import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,createHmac} from 'node:crypto';
import {createFamilyAttachmentInventoryConsent} from '../lib/family-attachment-inventory-consent.mjs';
import {createFamilyAttachmentStatus} from '../lib/family-attachment-status.mjs';
import {familyAttachmentInventoryDigest as digest} from '../lib/family-attachment-journal.mjs';
import {familyAttachmentActivationFixture as fixture} from './fixtures/family-attachment-activation.mjs';
import {owner,recipient,oe,re,os,rs} from './fixtures/home-handoff-identifiers.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

const confirmation='写真・保証書の一覧と受取先を確認して引き継ぎに同意する';
async function setup({activation=false,commitFault=null,memberOnly=false}={}){
 let provider;const f=await fixture({prepared:false,commitFault,memberOnly,inventoryAuthorize:(...args)=>provider.authorize(...args),activationAuthorize:activation?(...args)=>provider.authorizeActivation(...args):null});
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
  return identityTransform({userID:actor,epochID:actor===owner?oe:re,sessionID:actor===owner?os:rs,aal:'aal1',authStateDigest:'a'.repeat(64),authenticatedAt:clock-10000,checkedAt:clock});
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
