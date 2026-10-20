import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,createHmac,createHash,randomUUID} from 'node:crypto';
import {createFamilyAttachmentInventoryConsent} from '../lib/family-attachment-inventory-consent.mjs';
import {createFamilyAttachmentStatus} from '../lib/family-attachment-status.mjs';
import {familyAttachmentInventoryDigest as digest} from '../lib/family-attachment-journal.mjs';
import {familyAttachmentActivationFixture as fixture} from './fixtures/family-attachment-activation.mjs';
import {owner,recipient,oe,re,os,rs} from './fixtures/home-handoff-identifiers.mjs';
import {bindKakeiCommittedFamilyVerifier} from '../lib/kakei-retained-family-verifier.mjs';
import {createOtherAppFamilyVerifier} from '../lib/other-app-family-verifier.mjs';
import {createKakeiFamilyCompletion} from './fixtures/kakei-completion/lib/kakei-family-completion.mjs';
import {createKakeiFamilyTransfer} from './fixtures/kakei-completion/lib/kakei-family-transfer.mjs';
import {createHandoffConsentStore} from './fixtures/kakei-completion/lib/handoff-consent-store.mjs';
import {createHandoffConsentIssuer as createKakeiConsentIssuer,createSignedHandoffConsentVerifier as createKakeiConsentVerifier} from './fixtures/kakei-completion/lib/handoff-consent.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilyPlanDigests} from './fixtures/kakei-completion/lib/kakei-family-snapshot.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {StorageApiError} from '@supabase/supabase-js';
import {createFamilyAttachmentCompletion} from '../lib/family-attachment-completion.mjs';
import {createFamilyAttachmentStoragePorts} from '../lib/family-attachment-storage.mjs';
import {normalizeFamilyAttachmentPlan} from '../lib/family-attachment-handoff.mjs';
import {createCommittedHouseholdConsentVerifier} from '../lib/home-handoff-consent.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

const confirmation='写真・保証書の一覧と受取先を確認して引き継ぎに同意する';
async function setup({activation=false,commitFault=null,memberOnly=false,alignFamilyAuth=false,includeKakei=false}={}){
 let provider;const f=await fixture({prepared:false,commitFault,memberOnly,extraControllerApps:includeKakei?[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()}]:[],inventoryAuthorize:(...args)=>provider.authorize(...args),activationAuthorize:activation?(...args)=>provider.authorizeActivation(...args):null});
 await f.db.exec(readFileSync('tests/fixtures/family-attachment-inventory-consent.sql','utf8'));
 let offset=0,live=true,onAuthority=async()=>true,transform=rows=>rows,identityTransform=x=>x;
 const key=randomBytes(32);
 const adapt=tx=>({query:async(sql,args)=>{
  const result=await tx.query(sql,args);
  if(sql.includes('as consent_now'))return {rows:[{consent_now:Number(result.rows[0].consent_now)+offset}]};
  return result;
 }});
 const transaction=(cb,signal=AbortSignal.timeout(10000))=>f.db.transaction(tx=>runWithTransactionCommitChecks(adapt(tx),signal,cb));
 async function inventory(tx){
  const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[f.scope.homeID])).rows;
  const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[f.scope.homeID])).rows;
  const files=(await tx.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 order by f.id for update of f',[f.scope.homeID])).rows;
  const writes=(await tx.query('select a.* from maintenance_private.attachment_write_attempts a join maintenance_private.product_attachments f on f.id=a.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 order by a.attachment_id for update of a',[f.scope.homeID])).rows;
  return JSON.parse(JSON.stringify({members,products,files,writes}));
 }
 const store={transaction,target:async tx=>{
  for(const id of [...new Set([owner,recipient,...f.plan.files.map(file=>file.source.userID)])].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
  return {scope:f.scope,plan:f.plan,inventory:await inventory(tx)};
 },
  records:async(tx,s)=>transform((await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id for update',[s.requestID,s.homeID])).rows),
  record:(tx,s,p,r)=>tx.query('insert into maintenance_private.family_attachment_inventory_consents values($1,$2,$3,$4,null)',[s.requestID,s.homeID,r.actorID,r.token])
 };
 const options={key,store,identifyActor:async actor=>[owner,recipient].includes(actor)?actor:null,verifyIdentity:async(actor,tx)=>{
  if(![owner,recipient].includes(actor))return null;
  const clock=Number((await tx.query('select floor(extract(epoch from clock_timestamp())*1000)::bigint as consent_now')).rows[0].consent_now);
  // New household-composition cases share one synthetic verified auth time;
  // actual GoTrue fixture separately verifies and pins signed TOTP AMR.
  const family=alignFamilyAuth?(await tx.query('select token from maintenance_private.household_handoff_consents where actor_id=$1',[actor])).rows[0]:null;
  const authenticatedAt=family?JSON.parse(Buffer.from(family.token.split('.')[0],'base64url').toString('utf8')).authVerifiedAt:clock-10000;
  return identityTransform({userID:actor,epochID:actor===owner?oe:re,sessionID:actor===owner?os:rs,aal:'aal1',authStateDigest:'a'.repeat(64),authenticatedAt,checkedAt:clock});
 },verifyActor:async(tx,c)=>{
  // Synthetic Auth table/session fixture; current MFA policy remains injected.
  const row=(await tx.query('select user_id from auth.sessions where id=$1 for update',[c.sessionID])).rows[0];
  return live&&row?.user_id===c.actorID;
 },currentAuthority:async(tx,s,p,i,d,signal,original)=>{
  signal.throwIfAborted();assert.equal(d,digest(i));assert.equal(original.requestID,f.scope.requestID);
  const row=(await tx.query("select exists(select 1 from maintenance_private.account_deletion_requests where id=$1 and user_id=$2 and app_epoch_id=$3 and lease_token=$4 and state='running' and lease_until>clock_timestamp()) as current",[s.nativeRequestID,s.userID,s.ownerEpoch,s.nativeLease])).rows[0];
  return row.current===true&&await onAuthority(tx);
 }};
 provider=createFamilyAttachmentInventoryConsent(options);
 const issue=actor=>provider.issue({requestID:f.scope.requestID,homeID:f.scope.homeID,accessToken:actor,confirmation,signal:new AbortController().signal});
 const original=await transaction(inventory);
 const authorize=(p=f.plan,i=original,s=f.scope,which=provider)=>transaction(tx=>which.authorize(tx,s,p,i,digest(i),new AbortController().signal,f.scope));
 return {f,options,provider,transaction,original,issue,authorize,
  set offset(v){offset=v;},set live(v){live=v;},set authority(v){onAuthority=v;},set transform(v){transform=v;},set identityTransform(v){identityTransform=v;}};
}

test('both private signatures bind the complete original inventory and permit guarded reserve/readback',async()=>{
 const s=await setup();try{
  for(const actor of [owner,recipient]){
   const issued=await s.issue(actor);assert.equal(issued.status,'accepted');assert.deepEqual(Object.keys(issued).sort(),['expiresAt','status']);
  }
  assert.equal(await s.authorize(),true);
  const reader=createFamilyAttachmentStatus({transaction:s.transaction,authorize:s.provider.authorize});
  assert.equal((await reader(s.f.scope,s.f.plan,new AbortController().signal)).state,'absent');
  assert.equal((await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal)).state,'reserved');
  assert.equal((await reader(s.f.scope,s.f.plan,new AbortController().signal)).state,'prepared');
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,2);
 }finally{await s.f.db.close();}
});

test('one person, changed receiver epoch/plan/metadata, forged token and wrong signing key cannot authorize',async()=>{
 const s=await setup();try{
  await s.issue(owner);assert.equal(await s.authorize(),false);await s.issue(recipient);
  assert.equal(await s.authorize({...s.f.plan,snapshotDigest:'b'.repeat(64)}),false);
  assert.equal(await s.authorize({...s.f.plan,recipientEpoch:oe}),false);
  const changed=structuredClone(s.original);changed.files[0].created_at='2000-01-01T00:00:00Z';assert.equal(await s.authorize(s.f.plan,changed),false);
  const missing=structuredClone(s.original);missing.files.pop();assert.equal(await s.authorize(s.f.plan,missing),false);
  const wrong=createFamilyAttachmentInventoryConsent({...s.options,key:randomBytes(32)});assert.equal(await s.authorize(s.f.plan,s.original,s.f.scope,wrong),false);
  s.transform=rows=>rows.map((r,i)=>i?{...r,token:r.token.slice(0,-2)+'xx'}:r);assert.equal(await s.authorize(),false);
  s.transform=rows=>[...rows,rows[0]];assert.equal(await s.authorize(),false);
 }finally{await s.f.db.close();}
});

test('replay keeps the original expiry, expired consent is not renewed and revoked consent cannot revive',async()=>{
 const s=await setup();try{
  const first=await s.issue(owner);assert.deepEqual(await s.issue(owner),first);await s.issue(recipient);
  s.offset=900001;assert.equal(await s.authorize(),false);assert.deepEqual(await s.issue(owner),{status:'expired',expiresAt:first.expiresAt});
  s.offset=0;await s.f.db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where actor_id=$1',[owner]);
  assert.equal(await s.authorize(),false);assert.deepEqual(await s.issue(owner),{status:'revoked'});
  await assert.rejects(s.f.db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=null where actor_id=$1',[owner]),/Immutable signed inventory/);
  await assert.rejects(s.f.db.exec('delete from maintenance_private.family_attachment_inventory_consents'),/Immutable signed inventory/);
 }finally{await s.f.db.close();}
});

test('recent authentication and a live signed session are mandatory; late revocation is re-read',async()=>{
 const s=await setup();try{
  s.identityTransform=x=>({...x,authenticatedAt:x.checkedAt-600001});assert.deepEqual(await s.issue(owner),{status:'unconfirmed'});
  s.identityTransform=x=>({...x,aal:undefined});assert.deepEqual(await s.issue(owner),{status:'unconfirmed'});
  s.identityTransform=x=>x;await s.issue(owner);await s.issue(recipient);
  s.live=false;assert.equal(await s.authorize(),false);s.live=true;
  let calls=0;s.authority=async tx=>{if(++calls===4)await tx.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);return true;};
  assert.equal(await s.authorize(),false);assert.equal(calls,4);
 }finally{await s.f.db.close();}
});

test('post-write authority loss and cancellation roll consent back; public roles cannot read private proofs',async()=>{
 const s=await setup();try{
  let calls=0;s.authority=async()=>++calls===1;
  assert.deepEqual(await s.issue(owner),{status:'unconfirmed'});
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,0);
  s.authority=async()=>true;s.live=false;assert.deepEqual(await s.issue(owner),{status:'unconfirmed'});
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,0);
  const c=new AbortController();const cancelled=createFamilyAttachmentInventoryConsent({...s.options,verifyIdentity:async(...args)=>{const id=await s.options.verifyIdentity(...args);c.abort();return id;}});
  assert.deepEqual(await cancelled.issue({requestID:s.f.scope.requestID,homeID:s.f.scope.homeID,accessToken:owner,confirmation,signal:c.signal}),{status:'unconfirmed'});
  for(const role of ['anon','authenticated','service_role']){
   await s.f.db.exec('set role '+role);
   for(const table of ['family_attachment_inventory_consents','family_attachment_inventory_approvals'])await assert.rejects(s.f.db.exec('select * from maintenance_private.'+table),/permission denied/);
   await s.f.db.exec('reset role');
  }
 }finally{await s.f.db.close();}
});


test('signed inventory approvals bind atomic activation to the exact pinned transaction',async()=>{
 const s=await setup({activation:true});try{
  await s.issue(owner);await s.issue(recipient);
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);
  assert.deepEqual(await s.f.run(),{state:'pending'}); // source cleanup remains disabled
  assert.equal((await s.f.db.query('select owner_id from public.homes where id=$1',[s.f.scope.homeID])).rows[0].owner_id,recipient);
  const contexts=(await s.f.db.query('select inventory_approval from maintenance_private.family_attachment_activation_contexts')).rows;
  assert.equal(contexts.length,1);assert.equal(contexts[0].inventory_approval.consents.length,2);
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts')).rows[0].n,1);
 }finally{await s.f.db.close();}
});

for(const memberOnly of [false,true])test(`late inventory revocation rolls atomic activation back (member-only: ${memberOnly})`,async()=>{
 const s=await setup({activation:true,commitFault:'revokedInventoryConsent',memberOnly});try{
  await s.issue(owner);await s.issue(recipient);
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);
  const before=(await s.f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  assert.deepEqual(await s.f.run(),{state:'pending'});
  assert.equal((await s.f.db.query('select owner_id from public.homes where id=$1',[s.f.scope.homeID])).rows[0].owner_id,owner);
  assert.deepEqual((await s.f.db.query('select * from maintenance_private.product_attachments order by id')).rows,before);
  for(const table of ['family_attachment_activation_contexts','family_attachment_activation_receipts','household_handoff_receipts'])assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  assert.equal(s.f.removals,0);
 }finally{await s.f.db.close();}
});

test('boolean authorization or a prior transaction approval cannot authorize atomic activation',async()=>{
 const s=await setup();try{
  await s.issue(owner);await s.issue(recipient);
  assert.equal(await s.transaction(tx=>s.provider.authorizeActivation({query:tx.query},s.f.scope,s.f.plan,s.original,digest(s.original),new AbortController().signal)),false,'A query-only adapter cannot omit final verification');
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);
  assert.equal(await s.transaction(tx=>s.provider.authorizeActivation(tx,s.f.scope,s.f.plan,s.original,digest(s.original),new AbortController().signal)),true);
  assert.deepEqual(await s.f.run(),{state:'pending'});
  assert.equal((await s.f.db.query('select owner_id from public.homes where id=$1',[s.f.scope.homeID])).rows[0].owner_id,owner);
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_approvals')).rows[0].n,1);
  assert.equal(s.f.removals,0);
 }finally{await s.f.db.close();}
});

test('session loss after the final receipt write rejects the whole activation transaction',async()=>{
 const s=await setup({activation:true,commitFault:'inventorySessionLost'});try{
  await s.issue(owner);await s.issue(recipient);
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);
  const before=(await s.f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  assert.deepEqual(await s.f.run(),{state:'pending'});
  assert.equal(s.f.lateAuthReceiptWritten,true);
  assert.equal(s.f.activationError?.code,'CURRENT_TRANSACTION_VERIFICATION_REQUIRED');
  assert.equal((await s.f.db.query('select owner_id from public.homes where id=$1',[s.f.scope.homeID])).rows[0].owner_id,owner);
  assert.deepEqual((await s.f.db.query('select * from maintenance_private.product_attachments order by id')).rows,before);
  assert.equal((await s.f.db.query('select user_id from auth.sessions where id=$1',[rs])).rows[0].user_id,recipient);
  for(const table of ['family_attachment_activation_contexts','family_attachment_activation_receipts','household_handoff_receipts'])assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  assert.equal(s.f.removals,0);
 }finally{await s.f.db.close();}
});

for(const memberOnly of [false,true])test(`recent authentication expiry at the last write rolls activation back (member-only: ${memberOnly})`,async()=>{
 const s=await setup({activation:true,commitFault:'recentAuthenticationExpired',memberOnly});try{
  // Three seconds of authentication validity remain, while the original
  // consent still has fifteen minutes and the normal approval has five seconds.
  s.identityTransform=x=>({...x,authenticatedAt:x.checkedAt-597000});
  assert.equal((await s.issue(owner)).status,'accepted');
  assert.equal((await s.issue(recipient)).status,'accepted');
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);
  const before=(await s.f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  assert.deepEqual(await s.f.run(),{state:'pending'});
  assert.ok(s.f.lateAuthWindow>0&&s.f.lateAuthWindow<=3000,'Reach the last write with a positive authentication-bound SQL deadline');
  assert.equal(s.f.lateAuthReceiptWritten,true,'The final receipt INSERT must succeed before deferred COMMIT rejects expiry');
  assert.ok(s.f.activationError,'The activation transaction must fail, not merely stop source cleanup');
  assert.equal(s.f.activationError.code,'P0001');
  assert.equal((await s.f.db.query('select owner_id from public.homes where id=$1',[s.f.scope.homeID])).rows[0].owner_id,owner);
  assert.deepEqual((await s.f.db.query('select * from maintenance_private.product_attachments order by id')).rows,before);
  for(const table of ['family_attachment_inventory_approvals','family_attachment_activation_contexts','family_attachment_activation_receipts','household_handoff_receipts'])assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,2);
  assert.equal(s.f.removals,0);
 }finally{await s.f.db.close();}
});


test('an approval expires by the database clock and repeated authorization cannot extend its transaction deadline',async()=>{
 const s=await setup();try{
  await s.issue(owner);await s.issue(recipient);
  await s.transaction(async tx=>{
   const args=[tx,s.f.scope,s.f.plan,s.original,digest(s.original),new AbortController().signal];
   assert.equal(await s.provider.authorizeActivation(...args),true);
   const first=(await tx.query('select expires_at from maintenance_private.family_attachment_inventory_approvals where transaction_id=txid_current()')).rows[0].expires_at;
   await tx.query('select pg_sleep(5.1)');
   assert.equal(await s.provider.authorizeActivation(...args),false);
   const second=(await tx.query('select expires_at from maintenance_private.family_attachment_inventory_approvals where transaction_id=txid_current()')).rows[0].expires_at;
   assert.deepEqual(second,first);
  });
 }finally{await s.f.db.close();}
});


test('v2 requires pinned Auth state and cannot reinterpret a legacy v1 consent',async()=>{
 const s=await setup();try{
  s.identityTransform=x=>{const value={...x};delete value.authStateDigest;return value;};
  assert.deepEqual(await s.issue(owner),{status:'unconfirmed'});
  s.identityTransform=x=>x;await s.issue(owner);await s.issue(recipient);assert.equal(await s.authorize(),true);
  s.transform=rows=>rows.map((r,i)=>{
   if(i)return r;
   const c=JSON.parse(Buffer.from(r.token.split('.')[0],'base64url'));
   c.purpose='OuchiMaintenance/family-attachment-inventory/v1';delete c.authStateDigest;
   const body=Buffer.from(JSON.stringify(c)).toString('base64url');
   const sig=createHmac('sha256',s.options.key).update(c.purpose+'\n'+body).digest('base64url');
   return {...r,token:body+'.'+sig};
  });
  assert.equal(await s.authorize(),false);
 }finally{await s.f.db.close();}
});


test('actor hint cannot replace pinned identity; inventory coordination precedes Auth row verification',async()=>{
 const s=await setup();try{
  const events=[];
  const provider=createFamilyAttachmentInventoryConsent({...s.options,
   identifyActor:async(...args)=>{events.push('identify');return s.options.identifyActor(...args);},
   store:{...s.options.store,target:async(...args)=>{events.push('target');return s.options.store.target(...args);}},
   verifyIdentity:async(...args)=>{events.push('pin');assert.deepEqual(events,['identify','target','pin']);return {...await s.options.verifyIdentity(...args),userID:recipient,epochID:re,sessionID:rs};}
  });
  assert.deepEqual(await provider.issue({requestID:s.f.scope.requestID,homeID:s.f.scope.homeID,accessToken:owner,confirmation,signal:AbortSignal.timeout(10000)}),{status:'unconfirmed'});
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,0);
  assert.throws(()=>createFamilyAttachmentInventoryConsent({...s.options,identifyActor:undefined}),/Trusted signed inventory provider/);
 }finally{await s.f.db.close();}
});


test('historical activation confirmation requires committed signed evidence and survives later logout, expiry and consent revocation',async()=>{
 const s=await setup({activation:true});try{
  const read=signal=>s.transaction(tx=>s.provider.authorizeCommittedActivation(tx,s.f.scope,signal??new AbortController().signal));
  assert.equal(await read(),false);
  for(const actor of [owner,recipient])assert.equal((await s.issue(actor)).status,'accepted');
  assert.equal(await read(),false); // signatures alone are not committed activation
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);await s.f.run();
  assert.equal(await read(),true);
  s.offset=900001;
  assert.equal(await s.authorize(),false);assert.equal(await read(),true);
  s.offset=0;s.live=false;
  await s.f.db.query('delete from auth.sessions where id=$1',[rs]);
  await s.f.db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);
  assert.equal(await s.authorize(),false); // no live mutation authority revived
  assert.equal(await read(),true);
  const controller=new AbortController();controller.abort();assert.equal(await read(controller.signal),false);
  const wrong=createFamilyAttachmentInventoryConsent({...s.options,key:randomBytes(32)});
  assert.equal(await s.transaction(tx=>wrong.authorizeCommittedActivation(tx,s.f.scope,new AbortController().signal)),false);
  assert.equal(await s.transaction(tx=>s.provider.authorizeCommittedActivation(tx,{...s.f.scope,ownerEpoch:re},new AbortController().signal)),false);
 }finally{await s.f.db.close();}
});

for(const fault of ['receiptToken','approvalToken','futureActivation','expiredAtActivation','wrongApprovalScope','foreignDestinationDigest','corruptCapturedSignature','expiredCapturedConsent','staleCapturedAuthentication'])test(`historical activation confirmation refuses ${fault} in loaded evidence`,async()=>{
 const s=await setup({activation:true});try{
  for(const actor of [owner,recipient])await s.issue(actor);
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);await s.f.run();
  const result=await s.transaction(tx=>s.provider.authorizeCommittedActivation({query:async(sql,args)=>{
   const r=await tx.query(sql,args);
   if(!sql.startsWith('select to_jsonb(j)'))return r;
   const rows=structuredClone(r.rows);
   for(const row of rows){
    if(fault==='receiptToken')row.receipt.activation_token=os;
    if(fault==='approvalToken')row.approval.consents[0].token+='x';
    if(fault==='futureActivation')row.receipt.activated_at='2999-01-01T00:00:00.000Z';
    if(fault==='expiredAtActivation')row.receipt.activated_at=row.approval.expires_at;
    if(fault==='wrongApprovalScope')row.approval.scope.nativeLease=os;
    if(fault==='foreignDestinationDigest')row.context.expected_inventory_digest=row.receipt.expected_inventory_digest='f'.repeat(64);
    if(fault==='corruptCapturedSignature'){
     row.approval.consents[0].token+='x';row.context.inventory_approval=structuredClone(row.approval);
    }
    if(['expiredCapturedConsent','staleCapturedAuthentication'].includes(fault)){
     const record=row.approval.consents[0],claim=JSON.parse(Buffer.from(record.token.split('.')[0],'base64url').toString('utf8'));
     claim.acceptedAt=Date.parse(row.receipt.activated_at)-(fault==='expiredCapturedConsent'?900001:599001);
     claim.authenticatedAt=claim.acceptedAt-10000;claim.checkedAt=claim.acceptedAt;claim.expiresAt=claim.acceptedAt+900000;
     const body=Buffer.from(JSON.stringify(claim)).toString('base64url');
     record.token=body+'.'+createHmac('sha256',s.options.key).update('OuchiMaintenance/family-attachment-inventory/v2\n'+body).digest('base64url');
     row.context.inventory_approval=structuredClone(row.approval);
    }

   }
   return {...r,rows};
  }},s.f.scope,new AbortController().signal));
  assert.equal(result,false);
  assert.equal(await s.transaction(tx=>s.provider.authorizeCommittedActivation(tx,s.f.scope,new AbortController().signal)),true);
 }finally{await s.f.db.close();}
});


test('historical household and inventory consents confirm the same committed transfer without reviving current authority',async()=>{
 const s=await setup({activation:true,alignFamilyAuth:true});try{
  const verify=createCommittedHouseholdConsentVerifier({key:s.f.key,verifyCommittedInventory:s.provider.authorizeCommittedActivation});
  const read=()=>s.transaction(tx=>verify(tx,s.f.scope,new AbortController().signal));
  assert.equal(await read(),false);
  for(const actor of [owner,recipient])await s.issue(actor);
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);await s.f.run();
  assert.equal(await read(),true);
  await s.f.db.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);
  await s.f.db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);
  s.live=false;await s.f.db.query('delete from auth.sessions where id=$1',[rs]);
  assert.equal(await s.authorize(),false);assert.equal(await read(),true);
  const wrong=createCommittedHouseholdConsentVerifier({key:randomBytes(32),verifyCommittedInventory:s.provider.authorizeCommittedActivation});
  assert.equal(await s.transaction(tx=>wrong(tx,s.f.scope,new AbortController().signal)),false);
  for(const table of ['household_handoff_contexts','household_handoff_plans','household_handoff_receipts']){
   await assert.rejects(s.f.db.exec('delete from maintenance_private.'+table),/Immutable/);
   await assert.rejects(s.f.db.exec('update maintenance_private.'+table+" set scope='{}'::jsonb"),/Immutable/);
  }
 }finally{await s.f.db.close();}
});

for(const fault of ['forgedFamilySignature','wrongFamilyRole','foreignFamilySnapshot','futureHouseholdTime','expiredHouseholdContext','differentAuthenticationTime'])test(`historical household confirmation refuses ${fault}`,async()=>{
 const s=await setup({activation:true,alignFamilyAuth:true});try{
  for(const actor of [owner,recipient])await s.issue(actor);
  await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);await s.f.run();
  const verify=createCommittedHouseholdConsentVerifier({key:s.f.key,verifyCommittedInventory:s.provider.authorizeCommittedActivation});
  const result=await s.transaction(tx=>verify({query:async(sql,args)=>{
   const r=await tx.query(sql,args);if(!sql.startsWith('select to_jsonb(c)'))return r;
   const rows=structuredClone(r.rows);
   for(const row of rows){
    if(fault==='forgedFamilySignature')row.context.consents[0].token+='x';
    if(fault==='foreignFamilySnapshot')row.parent.snapshot.products=[];
    if(fault==='futureHouseholdTime')row.household.completed_at='2999-01-01T00:00:00.000Z';
    if(fault==='expiredHouseholdContext')row.household_context.expires_at=row.household.completed_at;
    if(['wrongFamilyRole','differentAuthenticationTime'].includes(fault)){
     const record=row.context.consents[0],claim=JSON.parse(Buffer.from(record.token.split('.')[0],'base64url').toString('utf8'));
     if(fault==='wrongFamilyRole')claim.role=claim.role==='owner'?'successor':'owner';
     else claim.authVerifiedAt-=1000;
     const body=Buffer.from(JSON.stringify(claim)).toString('base64url');
     record.token=body+'.'+createHmac('sha256',s.f.key).update('OuchiMaintenance/shared-family-handoff/v1\n'+body).digest('base64url');
    }
   }
   return {...r,rows};
  }},s.f.scope,new AbortController().signal));
  assert.equal(result,false);
  assert.equal(await s.transaction(tx=>verify(tx,s.f.scope,new AbortController().signal)),true);
 }finally{await s.f.db.close();}
});


async function completionSetup({includeKakei=false}={}){
 const s=await setup({activation:true,alignFamilyAuth:true,includeKakei});
 await s.f.db.exec(readFileSync('tests/fixtures/family-attachment-completion.sql','utf8'));
 for(const actor of [owner,recipient])await s.issue(actor);
 await s.f.journal.reserve(s.f.scope,s.f.plan,new AbortController().signal);await s.f.run();
 const plan=normalizeFamilyAttachmentPlan(s.f.plan),signal=()=>new AbortController().signal;
 let absenceError=new StorageApiError('missing',404,'404','storage','NoSuchKey'),storageAllowed=true,inspections=0;
 const storage=createFamilyAttachmentStoragePorts({guard:async()=>storageAllowed,clientForSignal:()=>({storage:{from:()=>({download:async path=>{inspections++;return s.f.objects.has(path)?{data:s.f.objects.get(path),error:null}:{data:null,error:absenceError};}})}})});
 const consent=createCommittedHouseholdConsentVerifier({key:s.f.key,verifyCommittedInventory:s.provider.authorizeCommittedActivation});
 const options={transaction:s.transaction,verifyCommittedConsent:consent,verifyReadAuthority:async()=>true,
  verifyWriteAuthority:(tx,scope,p,sig)=>s.options.currentAuthority(tx,scope,p,s.original,digest(s.original),sig,s.f.scope),storage};
 const fresh=extra=>createFamilyAttachmentCompletion({...options,...extra});
 const finish=port=>{const c=port??fresh();return c.finish(s.f.scope,plan,createHashDigest(plan),signal());};
 const status=port=>(port??fresh()).status(s.f.scope,plan,signal());
 const clean=()=>{for(const file of plan.files.filter(f=>f.source.path!==f.destination.path))s.f.objects.delete(file.source.path);};
 return {s,plan,options,fresh,finish,status,clean,signal,get inspections(){return inspections;},set absenceError(v){absenceError=v;},set storageAllowed(v){storageAllowed=v;}};
}
const createHashDigest=plan=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');

test('durable family cleanup completion reconciles lost reply and can be read after logout without declaring whole-account retirement',async()=>{
 const c=await completionSetup();try{
  assert.equal((await c.status()).state,'activated');
  await assert.rejects(c.finish(),/Definitive family source absence/);
  assert.equal((await c.status()).state,'activated');c.clean();
  await assert.rejects((async()=>{await c.finish();throw Error('Successful family completion reply lost');})(),/reply lost/);
  const first=await c.status(c.fresh());assert.equal(first.state,'complete');
  const reads=c.inspections;assert.deepEqual(await c.finish(c.fresh()),first);assert.equal(c.inspections,reads);
  assert.equal((await c.status(c.fresh())).state,'complete');
  c.s.live=false;await c.s.f.db.query('delete from auth.sessions where id=$1',[rs]);
  await c.s.f.db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);
  assert.equal((await c.status(c.fresh())).state,'complete');
  assert.equal(await c.s.authorize(),false);
  assert.equal((await c.s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_completion_receipts')).rows[0].n,1);
  assert.equal((await c.s.f.db.query('select count(*)::int n from auth.users')).rows[0].n,3);
  assert.equal((await c.s.f.db.query('select state from maintenance_private.account_deletion_requests where id=$1',[c.s.f.scope.nativeRequestID])).rows[0].state,'running');
  for(const table of ['family_attachment_completion_contexts','family_attachment_completion_receipts']){
   await assert.rejects(c.s.f.db.exec('delete from maintenance_private.'+table),/Immutable/);
   await assert.rejects(c.s.f.db.exec('update maintenance_private.'+table+" set proof='{}'::jsonb"),/Immutable/);
  }
 }finally{await c.s.f.db.close();}
});

for(const fault of ['unknownAbsence','missingDestination','damagedDestination','storageAuthorityLost'])test(`family completion refuses ${fault} without saving a receipt`,async()=>{
 const c=await completionSetup();try{
  c.clean();const file=c.plan.files[0];
  if(fault==='unknownAbsence')c.absenceError=new StorageApiError('unknown',404,'404','storage','NoSuchBucket');
  if(fault==='missingDestination')c.s.f.objects.delete(file.destination.path);
  if(fault==='damagedDestination')c.s.f.objects.set(file.destination.path,new Blob([new Uint8Array([4,3,2,1])],{type:file.mime}));
  if(fault==='storageAuthorityLost')c.storageAllowed=false;
  await assert.rejects(c.finish());
  assert.equal((await c.s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_completion_receipts')).rows[0].n,0);
  assert.equal((await c.status()).state,'activated');
 }finally{await c.s.f.db.close();}
});

for(const fault of ['expiredBinding','expiredCompletionContext','missingRoute','missingReceipt'])test(`deferred family completion COMMIT refuses ${fault} even with an incomplete application adapter`,async()=>{
 const c=await completionSetup();try{
  c.clean();
  const transaction=(cb,sig)=>c.s.transaction(tx=>cb({beforeCommit:()=>{},query:async(sql,args)=>{
   if(fault==='missingReceipt'&&sql.startsWith('insert into maintenance_private.family_attachment_completion_receipts'))return {rows:[],rowCount:1};
   if(fault==='missingReceipt'&&sql.startsWith('select * from maintenance_private.family_attachment_completion_receipts')){
    const context=(await tx.query('select * from maintenance_private.family_attachment_completion_contexts')).rows[0];
    return {rows:context?[{...context,completion_token:context.token}]:[]};
   }
   const result=await tx.query(sql,args);
   if(sql.startsWith('insert into maintenance_private.family_attachment_completion_receipts')){
    if(fault==='expiredBinding')await tx.query("update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second' where user_id=$1",[owner]);
    if(fault==='expiredCompletionContext')await tx.query('select pg_sleep(5.1)');
    if(fault==='missingRoute')await tx.query("delete from maintenance_private.household_write_routes where kind='products'");
   }
   return result;
  }}),sig);
  await assert.rejects(c.finish(c.fresh({transaction})),/family completion|family routes/i);
  assert.equal((await c.s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_completion_receipts')).rows[0].n,0);
  assert.equal((await c.s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_completion_contexts')).rows[0].n,0);
  assert.equal((await c.finish()).state,'complete');
 }finally{await c.s.f.db.close();}
});

test('client JSON storage flags, query-only transactions, cancellation and read-authority loss cannot confirm family completion',async()=>{
 const c=await completionSetup();try{
  assert.throws(()=>c.fresh({storage:{verified:true}}),/Trusted family completion/);c.clean();
  await assert.rejects(c.finish(c.fresh({transaction:(cb,sig)=>c.s.transaction(tx=>cb({query:tx.query}),sig)})),/Pinned completion commit/);
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(c.fresh().finish(c.s.f.scope,c.plan,createHashDigest(c.plan),aborted.signal),{name:'AbortError'});
  await c.finish();await assert.rejects(c.status(c.fresh({verifyReadAuthority:async()=>false})),/authority/);
  await c.s.f.db.exec('set role service_role');
  await assert.rejects(c.s.f.db.exec('select * from maintenance_private.family_attachment_completion_receipts'),/permission denied/);
  await c.s.f.db.exec('reset role');
 }finally{await c.s.f.db.close();}
});


async function checkpointSetup(){
 const c=await completionSetup();c.clean();await c.finish();
 const s=c.s.f.scope.controllerScope;
 await c.s.f.db.exec(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
 await c.s.f.db.exec(readFileSync('tests/fixtures/shared-family-stage-store.sql','utf8'));
 const fixed={...s};delete fixed.leaseToken;
 await c.s.f.db.query("insert into private.kb_shared_deletion_journal(request_id,user_id,scope,status,lease_token,lease_until,receipts) values($1,$2,$3,'processing',$4,clock_timestamp()+interval '2 minutes',$5)",[s.requestID,s.userID,fixed,s.leaseToken,{prepare:{durable:true,stage:'prepare',...fixed}}]);
 const list=[{scope:c.s.f.scope,plan:c.plan}],coverageDigest=sharedFamilyCoverageDigest(list,s);
 const store=createSharedFamilyStageStore({verifyReadAuthority:async()=>true,loadValidatedTargets:async(tx,scope)=>{
  assert.deepEqual(scope.apps,s.apps); // only maintenance exists in this fixture
  assert.equal(scope.apps.length,1);
  assert.equal(await c.options.verifyCommittedConsent(tx,c.s.f.scope,c.signal()),true);
  return list;
 }});
 const record=(tx,scope=s)=>store.record(tx,scope,coverageDigest,c.signal());
 const read=scope=>c.s.transaction(tx=>store.read(tx,scope??s,c.signal()));
 return {...c,root:s,list,coverageDigest,store,record,read};
}

test('actual private controller checkpoint reads committed family completion and survives root lease recovery with one context',async()=>{
 const c=await checkpointSetup();try{
  assert.equal(await c.read(),null);await c.s.transaction(tx=>c.record(tx));
  const first=await c.read();assert.equal(first.stage,'handoff-family');assert.equal(first.familyCoverageDigest,c.coverageDigest);
  const recovered={...c.root,leaseToken:oe};
  await c.s.f.db.query('update private.kb_shared_deletion_journal set lease_token=$1 where request_id=$2',[recovered.leaseToken,c.root.requestID]);
  await c.s.transaction(tx=>c.record(tx,recovered));assert.deepEqual(await c.read(recovered),first);
  assert.equal((await c.s.f.db.query('select count(*)::int n from maintenance_private.shared_family_stage_contexts')).rows[0].n,1);
  await assert.rejects(c.s.f.db.query("update private.kb_shared_deletion_journal set receipts=receipts-'handoff-family' where request_id=$1",[c.root.requestID]),/Immutable controller family/);
 }finally{await c.s.f.db.close();}
});

for(const fault of ['rootLeaseExpired','missingPrepare','wrongRootLease','unplannedFamilyHome','contextExpired'])test(`controller checkpoint SQL rejects ${fault} before committing a global receipt`,async()=>{
 const c=await checkpointSetup();try{
  const txrun=(cb)=>c.s.transaction(tx=>cb({beforeCommit:()=>{},query:async(sql,args)=>{
   const result=await tx.query(sql,args);
   if(sql.startsWith('update private.kb_shared_deletion_journal set receipts=receipts||')){
    if(fault==='rootLeaseExpired')await tx.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[c.root.requestID]);
    if(fault==='missingPrepare')await tx.query("update private.kb_shared_deletion_journal set receipts=receipts-'prepare' where request_id=$1",[c.root.requestID]);
    if(fault==='wrongRootLease')await tx.query('update private.kb_shared_deletion_journal set lease_token=$1 where request_id=$2',[oe,c.root.requestID]);
    if(fault==='contextExpired')await tx.query('select pg_sleep(5.1)');
    if(fault==='unplannedFamilyHome')await tx.query('insert into maintenance_private.household_handoff_plans select $1,owner_id,successor_id,scope,plan,plan_digest,snapshot from maintenance_private.household_handoff_plans limit 1',[os]);
   }
   return result;
  }}));
  await assert.rejects(txrun(tx=>c.record(tx)),/controller family checkpoint|family coverage/i);
  assert.equal(await c.read(),null);
  assert.equal((await c.s.f.db.query('select count(*)::int n from maintenance_private.shared_family_stage_contexts')).rows[0].n,0);
  await c.s.transaction(tx=>c.record(tx));assert.equal((await c.read()).durable,true);
 }finally{await c.s.f.db.close();}
});


async function bothFamilySetup(){
 const c=await completionSetup({includeKakei:true}),db=c.s.f.db,root=c.s.f.scope.controllerScope;
 await db.exec(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
 await db.exec(readFileSync('tests/fixtures/shared-family-stage-store.sql','utf8'));
 const fixed={...root};delete fixed.leaseToken;
 await db.query("insert into private.kb_shared_deletion_journal(request_id,user_id,scope,status,lease_token,lease_until) values($1,$2,$3,'requested',null,null)",[root.requestID,root.userID,fixed]);
 await db.exec(readFileSync('tests/fixtures/kakei-completion/tests/fixtures/handoff-consent-store.sql','utf8'));
 await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table private.kb_deletion_context(user_id uuid,transaction_id bigint);
 create table public.kb_households(id uuid primary key,owner_id uuid,name text,invite_token uuid,created_at timestamptz default now(),updated_at timestamptz);
 create table public.kb_household_members(household_id uuid,user_id uuid,role text,display_name text,joined_at timestamptz default now(),primary key(household_id,user_id));
 create table public.kb_transactions(id uuid primary key,household_id uuid,created_by uuid,amount int);
 alter table public.kb_households enable row level security;alter table public.kb_household_members enable row level security;alter table public.kb_transactions enable row level security;
 revoke all on public.kb_households,public.kb_household_members,public.kb_transactions from public,anon,authenticated,service_role;
 `);
 await db.exec(readFileSync('tests/fixtures/kakei-completion/tests/fixtures/kakei-family-transfer.sql','utf8'));
 await db.exec('create trigger kb_touch_household before update on public.kb_households for each row execute function private.kb_touch_household();create trigger kb_touch_member before update on public.kb_household_members for each row execute function private.kb_touch_member();');
 await db.exec(readFileSync('tests/fixtures/kakei-completion/review/kakei-family-completion.sql','utf8'));
 const household=randomUUID(),record=randomUUID(),app=root.apps.find(a=>a.app==='kakei');
 await db.query('insert into public.kb_households(id,owner_id,name,invite_token) values($1,$2,$3,$4)',[household,root.userID,'Synthetic budget family',randomUUID()]);
 for(const [user,role] of [[root.userID,'owner'],[recipient,'member']])await db.query('insert into public.kb_household_members(household_id,user_id,role,display_name) values($1,$2,$3,$4)',[household,user,role,'Synthetic '+role]);
 await db.query('insert into public.kb_transactions values($1,$2,$3,200)',[record,household,recipient]);
 const plan={protocolVersion:2,requestID:root.requestID,userID:root.userID,inventoryDigest:root.inventoryDigest,appRequestID:app.requestID,appScopeID:app.scopeID,householdID:household,successorID:recipient,memberIDs:[root.userID,recipient],familyRecordIDs:[record]};
 Object.assign(plan,kakeiFamilyPlanDigests(await captureKakeiFamilySnapshot(root,household,db),root,plan));
 await db.query('insert into private.kb_shared_handoff_plans values($1,$2,$3)',[root.requestID,household,plan]);
 const key=randomBytes(32),proofStore=createHandoffConsentStore({transaction:cb=>c.s.transaction(cb)});
 const issuer=createKakeiConsentIssuer({key,store:proofStore,verifyIdentity:async user=>({userID:user,authVerifiedAt:Date.now()})});
 for(const actor of [root.userID,recipient])assert.equal((await issuer({requestID:root.requestID,householdID:household,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
 await db.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '2 minutes',receipts=$3 where request_id=$1",[root.requestID,root.leaseToken,{prepare:{durable:true,stage:'prepare',...fixed}}]);
 const verifyConsents=createKakeiConsentVerifier({key,loadRecords:proofStore.loadRecords}),fences=async()=>true; // explicit synthetic Kakei identity/fence, not shipping evidence
 const transfer=createKakeiFamilyTransfer({verifyConsents,writeFences:fences});
 const completed=createKakeiFamilyCompletion({key,transfer,loadRecords:proofStore.loadRecords,verifyReadAuthority:async()=>true,writeFences:fences});
 const kakei=bindKakeiCommittedFamilyVerifier({completion:completed,verifyWriteFences:fences,verifyFrozenCoverage:async(tx,s,plans)=>plans.length===1&&digest(plans[0])===digest(plan)});
 const other=createOtherAppFamilyVerifier({verifyControllerCoverage:async(tx,s)=>digest(s)===digest(root),verifiers:{kakei}});
 const targets=[{scope:c.s.f.scope,plan:c.plan}],coverage=sharedFamilyCoverageDigest(targets,root);
 const checkpoint=createSharedFamilyStageStore({verifyReadAuthority:async()=>true,loadValidatedTargets:async(tx,s,d)=>{
  assert.equal(d,coverage);assert.equal(await c.options.verifyCommittedConsent(tx,c.s.f.scope,c.signal()),true);
  if(await other(tx,s,c.signal())!==true)throw Error('Kakei committed family unconfirmed');return targets;
 }});
 return {...c,root,db,budgetPlan:plan,budgetTransfer:transfer,budgetCompletion:completed,other,checkpoint,targets,coverage,
  globalRecord:()=>c.s.transaction(tx=>checkpoint.record(tx,root,coverage,c.signal())),globalRead:()=>c.s.transaction(tx=>checkpoint.read(tx,root,c.signal()))};
}

test('both-app checkpoint requires actual signed Kakei completion and independently committed maintenance cleanup',async()=>{
 const c=await bothFamilySetup();try{
  c.clean();await c.finish();
  await assert.rejects(c.globalRecord(),/Kakei committed family unconfirmed/);assert.equal(await c.globalRead(),null);
  await assert.rejects(c.s.transaction(async tx=>{await c.budgetTransfer(c.root,c.budgetPlan,tx);assert.equal(await c.other(tx,c.root,c.signal()),false);throw Error('Unsigned completion probe rollback');}),/probe rollback/);
  assert.equal((await c.db.query('select owner_id from public.kb_households where id=$1',[c.budgetPlan.householdID])).rows[0].owner_id,c.root.userID);
  await c.s.transaction(tx=>c.budgetCompletion.complete(c.root,c.budgetPlan,tx));
  await c.db.query('update private.kb_shared_handoff_proofs set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);
  await c.globalRecord();const saved=await c.globalRead();assert.equal(saved.stage,'handoff-family');assert.equal(saved.apps.length,2);
  await c.globalRecord();assert.deepEqual(await c.globalRead(),saved);
  assert.equal((await c.db.query('select count(*)::int n from private.kb_shared_family_completions')).rows[0].n,1);
  assert.equal((await c.db.query('select count(*)::int n from maintenance_private.shared_family_stage_contexts')).rows[0].n,1);
  assert.equal((await c.db.query('select amount from public.kb_transactions')).rows[0].amount,200);
  assert.equal((await c.status()).state,'complete');
  assert.equal((await c.db.query('select state from maintenance_private.account_deletion_requests where id=$1',[c.s.f.scope.nativeRequestID])).rows[0].state,'running');
 }finally{await c.db.close();}
});

for(const fault of ['retainedBudgetDrift','budgetReceiptMissing','budgetPlanScopeChanged','maintenanceSourcePresent'])test(`mixed checkpoint refuses ${fault} and keeps already committed family result`,async()=>{
 const c=await bothFamilySetup();try{
  if(fault!=='maintenanceSourcePresent'){c.clean();await c.finish();}
  await c.s.transaction(tx=>c.budgetCompletion.complete(c.root,c.budgetPlan,tx));
  if(fault==='retainedBudgetDrift')await c.db.exec('update public.kb_transactions set amount=201');
  if(fault==='budgetPlanScopeChanged')await c.db.query('update private.kb_shared_handoff_plans set plan=$1',[{...c.budgetPlan,appScopeID:oe}]);
  if(fault==='budgetReceiptMissing'){
   await c.db.exec('alter table private.kb_shared_family_completions disable trigger immutable_kakei_family_completion');
   await c.db.exec('delete from private.kb_shared_family_completions');
   await c.db.exec('alter table private.kb_shared_family_completions enable trigger immutable_kakei_family_completion');
  }
  await assert.rejects(c.globalRecord());assert.equal(await c.globalRead(),null);
  assert.equal((await c.db.query('select count(*)::int n from maintenance_private.shared_family_stage_contexts')).rows[0].n,0);
  if(fault!=='maintenanceSourcePresent')assert.equal((await c.status()).state,'complete');
 }finally{await c.db.close();}
});


for(const replay of [false,true])test(`consent issuance rechecks exact actor at owning COMMIT (replay: ${replay})`,async()=>{
 const s=await setup();try{
  if(replay)assert.equal((await s.issue(owner)).status,'accepted');
  const before=(await s.f.db.query('select * from maintenance_private.family_attachment_inventory_consents order by actor_id')).rows;
  let callbackAccepted=false;
  const provider=createFamilyAttachmentInventoryConsent({...s.options,store:{...s.options.store,transaction:(cb,signal)=>s.options.store.transaction(async tx=>{
   const result=await cb(tx);callbackAccepted=result.status==='accepted';
   await tx.query('delete from auth.sessions where id=$1',[os]);
   return result;
  },signal)}});
  const result=await provider.issue({requestID:s.f.scope.requestID,homeID:s.f.scope.homeID,accessToken:owner,confirmation,signal:new AbortController().signal});
  assert.equal(callbackAccepted,true,'Fault must occur after the normal callback would accept');
  assert.equal(result.status,'unconfirmed');
  assert.deepEqual((await s.f.db.query('select * from maintenance_private.family_attachment_inventory_consents order by actor_id')).rows,before,'COMMIT failure rolls new consent back and never changes replayed consent');
  assert.equal((await s.f.db.query('select user_id from auth.sessions where id=$1',[os])).rows[0].user_id,owner,'Same-transaction test fault must roll back too');
 }finally{await s.f.db.close();}
});

test('consent issuance refuses a transaction without final checks and expires recent authentication at COMMIT',async()=>{
 const s=await setup();try{
  const request={requestID:s.f.scope.requestID,homeID:s.f.scope.homeID,accessToken:owner,confirmation,signal:new AbortController().signal};
  const noHook=createFamilyAttachmentInventoryConsent({...s.options,store:{...s.options.store,transaction:(cb,signal)=>s.options.store.transaction(tx=>cb({query:tx.query,signal:tx.signal}),signal)}});
  assert.equal((await noHook.issue(request)).status,'unconfirmed');
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,0);
  let accepted=false;
  const expires=createFamilyAttachmentInventoryConsent({...s.options,store:{...s.options.store,transaction:(cb,signal)=>s.options.store.transaction(async tx=>{const r=await cb(tx);accepted=r.status==='accepted';s.offset=600001;return r;},signal)}});
  assert.equal((await expires.issue(request)).status,'unconfirmed');assert.equal(accepted,true);
  assert.equal((await s.f.db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents')).rows[0].n,0);
 }finally{await s.f.db.close();}
});
