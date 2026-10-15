import {Client} from 'pg';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {createFamilyAttachmentInventoryConsent} from '../../lib/family-attachment-inventory-consent.mjs';
import {createFamilyAttachmentJournal} from '../../lib/family-attachment-journal.mjs';
import {createFamilyAttachmentStatus} from '../../lib/family-attachment-status.mjs';
import {createFamilyAttachmentActivation} from '../../lib/family-attachment-activation.mjs';
import {createFamilyAttachmentCompletion} from '../../lib/family-attachment-completion.mjs';
import {createFamilyAttachmentStoragePorts} from '../../lib/family-attachment-storage.mjs';
import {normalizeFamilyAttachmentPlan} from '../../lib/family-attachment-handoff.mjs';
import {createHouseholdHandoffPort,snapshotDigest} from './handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest,createCommittedHouseholdConsentVerifier} from './handoff-controller-compatibility/handoff-consent.mjs';

// Private disposable integration only. Real signed Auth/MFA is mandatory. No
// production grant/route or peer source modification. The explicit-owner variant
// requires a phase-bound removal of only the original owner's member row.
// Optional former-member upload remains at its original uploader path; that
// account and its unrelated private home/file are never retirement targets.
export async function createWholeOuchiFamilyServices({db,actor,recipient,formerUploader=null,admin,origin,bytes,clientForSignal,createSharedConsentIdentityVerifier,sharedIdentityOptions,tokens}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 for(const f of [clientForSignal,createSharedConsentIdentityVerifier])assert.equal(typeof f,'function');
 assert.equal(!!formerUploader,process.env.OUCHI_WHOLE_FAMILY_FORMER_UPLOADER==='true');
 const explicitOwner=process.env.OUCHI_WHOLE_FAMILY_EXPLICIT_OWNER==='true';
 const home=randomUUID(),product=randomUUID(),task=randomUUID(),sha=createHash('sha256').update(bytes).digest('hex');
 const ok=r=>{assert.equal(r.error,null);return r.data;};
 const actorToken=tokens.get(actor.user),actorClaims=JSON.parse(Buffer.from(actorToken.split('.')[1],'base64url'));
 assert.equal(ok(await admin.auth.getUser(actorToken)).user.id,actor.user);assert.equal(actorClaims.sub,actor.user);assert.equal(actorClaims.session_id,actor.session);
 const old=(await db.query("select nullif(current_setting('request.jwt.claims',true),'') claims,nullif(current_setting('request.jwt.claim.sub',true),'') subject")).rows[0];
 await db.query('begin');try{
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify(actorClaims),actor.user]);
  await db.query('insert into public.homes(id,owner_id,name,kind) values($1,$2,$3,$4)',[home,actor.user,'Synthetic retained Ouchi family','home']);
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,recipient.user,'Synthetic receiver']);
  if(explicitOwner)await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,actor.user,'Synthetic original owner member']);
  if(formerUploader)await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,formerUploader.user,'Synthetic prior uploader']);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Synthetic retained family product']);
  await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,$5,$6)',[task,product,'Synthetic retained care',"\u6383\u9664",'2030-01-01',"\u30e6\u30fc\u30b6\u30fc\u8a2d\u5b9a"]);
  await db.query('insert into public.maintenance_history("taskId","productId","completedAt") values($1,$2,$3)',[task,product,'2026-01-01']);await db.query('commit');
 }catch(e){await db.query('rollback');throw e;}
 assert.deepEqual((await db.query("select nullif(current_setting('request.jwt.claims',true),'') claims,nullif(current_setting('request.jwt.claim.sub',true),'') subject")).rows[0],old);
 const source=[];
 for(const person of [actor,recipient,...(formerUploader?[formerUploader]:[])]){
  const id=randomUUID(),path=`${person.user}/${person.epoch}/${id}.png`,identity={target_user:person.user,verified_session:person.session,expected_epoch:person.epoch};
  ok(await admin.rpc('reserve_maintenance_attachment',{...identity,target_product:product,attachment_id:id,byte_count:bytes.length,media_type:'image/png',measured_sha256:sha}));
  const attempt=randomUUID();ok(await admin.rpc('begin_maintenance_attachment_write',{...identity,target_attachment:id,target_attempt:attempt}));
  ok(await admin.storage.from('ouchi-product-attachments').upload(path,bytes,{contentType:'image/png',upsert:false}));
  assert.equal(ok(await admin.rpc('settle_maintenance_attachment_write',{target_attachment:id,target_attempt:attempt})),true);
  ok(await admin.rpc('finalize_maintenance_attachment',{...identity,attachment_id:id,actual_bytes:bytes.length,verified_sha256:sha}));
  source.push({id,user:person.user,epoch:person.epoch,path});
 }
 let privateFile=null,privateState=null;
 const readPrivate=async()=>{
  if(!privateFile)return null;
  const h=(await db.query('select * from public.homes where id=$1',[privateFile.home])).rows;
  const p=(await db.query('select * from public.products where id=$1',[privateFile.product])).rows;
  const f=(await db.query('select * from maintenance_private.product_attachments where id=$1',[privateFile.id])).rows;
  const w=(await db.query('select * from maintenance_private.attachment_write_attempts where attachment_id=$1 order by attempt_id',[privateFile.id])).rows;
  return JSON.parse(JSON.stringify({h,p,f,w}));
 };
 if(formerUploader){
  const person=formerUploader,token=ok(await person.client.auth.getSession()).session.access_token;
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  assert.equal(ok(await admin.auth.getUser(token)).user.id,person.user);assert.equal(claims.sub,person.user);assert.equal(claims.session_id,person.session);
  privateFile={home:randomUUID(),product:randomUUID(),id:randomUUID()};privateFile.path=`${person.user}/${person.epoch}/${privateFile.id}.png`;
  await db.query('begin');try{
   await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify(claims),person.user]);
   assert.equal((await db.query('select auth.uid() id')).rows[0].id,person.user);
   await db.query('insert into public.homes(id,owner_id,name,kind) values($1,$2,$3,$4)',[privateFile.home,person.user,'Synthetic former uploader private home','home']);
   await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[privateFile.product,privateFile.home,'air','Synthetic unrelated former uploader product']);
   assert.equal((await db.query('delete from public.home_members where "homeId"=$1 and user_id=$2 returning user_id',[home,person.user])).rowCount,1);
   await db.query('commit');
  }catch(e){await db.query('rollback');throw e;}
  assert.deepEqual((await db.query("select nullif(current_setting('request.jwt.claims',true),'') claims,nullif(current_setting('request.jwt.claim.sub',true),'') subject")).rows[0],old);
  const who={target_user:person.user,verified_session:person.session,expected_epoch:person.epoch},attempt=randomUUID();
  ok(await admin.rpc('reserve_maintenance_attachment',{...who,target_product:privateFile.product,attachment_id:privateFile.id,byte_count:bytes.length,media_type:'image/png',measured_sha256:sha}));
  ok(await admin.rpc('begin_maintenance_attachment_write',{...who,target_attachment:privateFile.id,target_attempt:attempt}));
  ok(await admin.storage.from('ouchi-product-attachments').upload(privateFile.path,bytes,{contentType:'image/png',upsert:false}));
  assert.equal(ok(await admin.rpc('settle_maintenance_attachment_write',{target_attachment:privateFile.id,target_attempt:attempt})),true);
  ok(await admin.rpc('finalize_maintenance_attachment',{...who,attachment_id:privateFile.id,actual_bytes:bytes.length,verified_sha256:sha}));
  privateState=await readPrivate();assert.equal(privateState.f.length,1);assert.equal(privateState.w.length,1);
  const formerFile=source.find(f=>f.user===person.user);assert.ok(formerFile);
  assert.equal(ok(await admin.rpc('read_maintenance_attachment',{...who,attachment_id:formerFile.id})),null);
  console.log('whole Ouchi family: third member uploaded before leaving; original family now excludes that member, unrelated private home and file retained for comparison');
 }
 const snapshot=async tx=>(await tx.query('select maintenance_private.household_family_snapshot($1) value',[home])).rows[0].value;
 const initialSnapshot=await snapshot(db);
 const inventory=async tx=>{
  const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[home])).rows;
  const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[home])).rows;
  const files=(await tx.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by f.id for update of f',[home])).rows;
  const writes=(await tx.query('select w.* from maintenance_private.attachment_write_attempts w join maintenance_private.product_attachments f on f.id=w.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by w.attachment_id for update of w',[home])).rows;
  return JSON.parse(JSON.stringify({members,products,files,writes}));
 };
 const initialInventory=await inventory(db);let root,native,transaction,controller,plan,scope,consentPlan,consents,committed,ports,issued=false;
 assert.equal(initialInventory.members.some(m=>m.user_id===actor.user),explicitOwner);
 const retainedSnapshotMatches=async tx=>{
  const row=(await tx.query(`select n.records_erased,
   n.user_id=$2 and n.app_epoch_id=$3 and coalesce(n.lease_token,n.completion_lease)=$4
    and n.state in('running','complete') original_native
   from maintenance_private.account_deletion_requests n where n.id=$1`,[native.requestID,actor.user,actor.epoch,native.leaseToken])).rows[0];
  let expected=initialSnapshot;
  if(row?.records_erased===true){
   if(row.original_native!==true)return false;
   const fixed={...root};delete fixed.leaseToken;
   const proof=(await tx.query(`select exists(select 1 from private.kb_shared_deletion_journal j
    join maintenance_private.shared_family_stage_contexts f on f.request_id=j.request_id
    where j.request_id=$1 and j.user_id=$2 and j.scope=$3::jsonb and f.scope=$4::jsonb
     and f.receipt=j.receipts->'handoff-family' and f.receipt->>'durable'='true'
     and f.receipt->>'stage'='handoff-family' and f.coverage_digest=f.receipt->>'familyCoverageDigest'
     and ((j.status='processing' and j.lease_token=$5 and j.lease_until>clock_timestamp())
      or (j.status='complete' and j.receipts->'complete'->>'durable'='true'
       and j.receipts->'complete'->>'stage'='complete'
       and ((j.receipts->'complete')-'durable'-'stage')=j.scope))) current`,[root.requestID,actor.user,fixed,root,root.leaseToken])).rows[0];
   if(proof.current!==true)return false;
   // Keep the historical signed snapshot unchanged. Only the exact retiring
   // principal's membership may disappear after canonical record erasure.
   expected={...initialSnapshot,members:initialSnapshot.members.filter(m=>m.user_id!==actor.user)};
  }
  return same(await snapshot(tx),expected);
 };
 const events=[];const key=randomBytes(32);let preparations=0,copies=0,activations=0,removals=0,finishes=0,tamperActivation=true,lastActivationFailure=null,originalProofDigest=null;
 const proofDigest=async()=>createHash('sha256').update(JSON.stringify({household:(await db.query('select actor_id,token,revoked_at from maintenance_private.household_handoff_consents where home_id=$1 order by actor_id',[home])).rows,inventory:(await db.query('select actor_id,token,revoked_at from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id',[root.requestID,home])).rows})).digest('hex');
 let lockOrderProved=false;
 const locks=async tx=>{await tx.query('select request_id from private.kb_shared_deletion_journal where request_id=$1 for update',[root.requestID]);for(const id of [...new Set([actor.user,recipient.user,...source.map(f=>f.user)])].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);};
 const frozenAuthority=async(tx,s,p,signal)=>{
  signal.throwIfAborted();if(!same(s,scope)||p.homeID!==home)return false;
  const fixed={...root};delete fixed.leaseToken;
  const row=(await tx.query(`select exists(select 1 from private.kb_shared_deletion_journal j
   join maintenance_private.household_stop_bindings b on b.user_id=j.user_id
   join maintenance_private.account_deletion_requests n on n.id=$4
   join maintenance_private.household_family_holds h on h.principal=b.user_id and h.home_id=$5
   where j.request_id=$1 and j.scope=$2::jsonb and j.status='processing' and j.lease_token=$3 and j.lease_until>clock_timestamp()
   and b.scope=$6::jsonb and b.native_lease=$7 and b.state='processing' and b.lease_until>clock_timestamp()
   and exists(select 1 from maintenance_private.household_principal_fences f where f.user_id=b.user_id and f.stopped)
   and n.user_id=b.user_id and n.app_epoch_id=$8 and n.state='running' and n.lease_token=$7 and n.lease_until>clock_timestamp()
   and h.scope=b.scope and exists(select 1 from maintenance_private.account_access a join maintenance_private.app_epochs e using(user_id)
    where a.user_id=$9 and a.enabled and e.enabled and e.epoch_id=$10) and not exists(select 1 from maintenance_private.account_deletion_requests q where q.user_id=$9 and q.state<>'complete')) current`,[root.requestID,fixed,root.leaseToken,native.requestID,home,root,native.leaseToken,actor.epoch,recipient.user,recipient.epoch])).rows[0];
  return row.current===true;
 };
 const identity=async(token,tx)=>{
  const reader=async(who,checked)=>{
   if(![actor.user,recipient.user].includes(who.userID))return false;await locks(checked);
   if(!lockOrderProved){
    const probe=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:2000,query_timeout:2000});await probe.connect();
    try{await probe.query("set lock_timeout='200ms'");await assert.rejects(probe.query('select request_id from private.kb_shared_deletion_journal where request_id=$1 for update',[root.requestID]),e=>e.code==='55P03');for(const id of [...new Set([actor.user,recipient.user,...source.map(f=>f.user)])].sort())await assert.rejects(probe.query('select pg_advisory_xact_lock(hashtext($1))',[id]),e=>e.code==='55P03');}finally{await probe.end();}
    lockOrderProved=true;console.log('whole Ouchi family: original root and both participant coordination locks held before Auth row pins');
   }

   const row=(await checked.query('select p.plan,p.scope,j.scope root_scope,j.status from maintenance_private.household_handoff_plans p join private.kb_shared_deletion_journal j on j.request_id=(p.scope->>\'requestID\')::uuid where p.home_id=$1 for update of p,j',[home])).rows[0];
   const fixed={...root};delete fixed.leaseToken;
   if(!row||!same(row.plan,consentPlan)||!same(row.scope,root)||!same(row.root_scope,fixed)||row.status!=='processing')return false;
   const apps=(await checked.query('select app,request_id,scope_id from private.composition_fixture_inventory where user_id=$1 order by app',[actor.user])).rows;
   if(!same(apps,root.apps.map(a=>({app:a.app,request_id:a.requestID,scope_id:a.scopeID})).sort((a,b)=>a.app.localeCompare(b.app))))return false;
   return frozenAuthority(checked,scope,plan,checked.signal);
  };
  const found=await createSharedConsentIdentityVerifier({...sharedIdentityOptions,verifyReadAuthority:reader})(token,tx);
  if(!found)return null;return {...found,epochID:found.userID===actor.user?actor.epoch:recipient.epoch};
 };
 const verifyActor=async(tx,claim,signal)=>{
  signal.throwIfAborted();const found=await identity(tokens.get(claim.actorID),tx);
  return !!found&&found.userID===claim.actorID&&found.sessionID===claim.sessionID&&found.epochID===claim.epochID&&found.aal===claim.aal&&found.authenticatedAt===claim.authenticatedAt&&found.authStateDigest===claim.authStateDigest;
 };
 // Count only SDK side-effect dispatches, never an orchestrator attempt
 // refused by current authority BEFORE it reaches Storage.
 const countedClientForSignal=async signal=>{
  const client=await clientForSignal(signal);
  return {storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');const api=client.storage.from(bucket);return {
   download:(...args)=>api.download(...args),
   upload:async(path,...args)=>{assert.ok(normalizeFamilyAttachmentPlan(plan).files.some(f=>f.destination.path===path&&f.source.path!==path));copies++;return api.upload(path,...args);},
   remove:async paths=>{assert.equal(paths.length,1);assert.ok(normalizeFamilyAttachmentPlan(plan).files.some(f=>f.source.path===paths[0]&&f.destination.path!==paths[0]));removals++;return api.remove(paths);}
  };}}};
 };
 const completed=async(tx,signal)=>{
  if(!await committed(tx,scope,signal))return false;
  const row=(await tx.query(`select exists(select 1 from maintenance_private.family_attachment_completion_receipts r
   join maintenance_private.family_attachment_completion_contexts c on c.token=r.completion_token
   join maintenance_private.family_attachment_journals j on j.request_id=r.request_id and j.home_id=r.home_id
   where r.request_id=$1 and r.home_id=$2 and r.scope=$3::jsonb and j.plan=$4::jsonb
   and r.activation_token=c.activation_token and r.plan_digest=c.plan_digest and r.inventory_digest=c.inventory_digest
   and r.plan_digest=j.plan_digest and r.inventory_digest=j.inventory_digest
   and exists(select 1 from maintenance_private.family_attachment_activation_receipts a where a.request_id=r.request_id and a.home_id=r.home_id and a.activation_token=r.activation_token and a.plan_digest=r.plan_digest and a.inventory_digest=r.inventory_digest)
   and r.scope=c.scope and r.proof=c.proof) complete`,[root.requestID,home,scope,normalizeFamilyAttachmentPlan(plan)])).rows[0];
  return row.complete===true;
 };
 const current=async tx=>{
  await locks(tx);
  const receiver=(await tx.query('select e.epoch_id from maintenance_private.app_epochs e join maintenance_private.account_access a using(user_id) where e.user_id=$1 and e.epoch_id=$2 and e.enabled and a.enabled for update of e,a',[recipient.user,recipient.epoch])).rows;
  if(receiver.length!==1||(await tx.query("select 1 from maintenance_private.account_deletion_requests where user_id=$1 and state<>'complete'",[recipient.user])).rows.length)return false;
  if(!await retainedSnapshotMatches(tx))return false;
  if((await tx.query('select 1 from public.home_members m join public.homes h on h.id=m."homeId" where m.user_id=$1 and h.owner_id<>$1 and h.id<>$2',[actor.user,home])).rows.length)return false;
  const owner=(await tx.query('select owner_id from public.homes where id=$1',[home])).rows[0]?.owner_id;
  const other=(await tx.query('select id from public.homes h where h.owner_id=$1 and exists(select 1 from public.home_members m where m."homeId"=h.id and m.user_id<>$1) order by id',[actor.user])).rows.map(x=>x.id);
  if(!same(other,owner===actor.user?[home]:[]))return false;
  if(owner===actor.user)return same(await inventory(tx),initialInventory);
  if(owner!==recipient.user||!committed||!await committed(tx,scope,tx.signal))return false;
  const list=await inventory(tx);if(list.files.length!==source.length||list.writes.length!==source.length)return false;
  for(const f of normalizeFamilyAttachmentPlan(plan).files){const row=list.files.find(x=>x.id===f.id),w=list.writes.find(x=>x.attachment_id===f.id);
   if(!row||row.user_id!==f.destination.userID||row.app_epoch_id!==f.destination.epoch||row.captured_owner_id!==recipient.user||row.object_path!==f.destination.path||row.sha256!==sha||Number(row.size_bytes)!==bytes.length||row.mime!=='image/png'||row.state!=='stored'||!w||w.state!=='settled'||!w.settled_at||w.owner_id!==recipient.user||w.uploader_id!==f.destination.userID||w.app_epoch_id!==f.destination.epoch)return false;
  }return true;
 };
 return {home,product,task,source,stats:()=>({preparations,copies,activations,removals,finishes,events:[...events]}),
  async setup(context){({scope:root,native,transaction,controller}=context);
   const originalTransaction=transaction;transaction=async(work,...args)=>{try{return await originalTransaction(async tx=>{await locks(tx);return work(tx);},...args);}catch(e){console.log('whole Ouchi family transaction refused',e.message,e.where??'');throw e;}};
   scope={requestID:root.requestID,homeID:home,userID:actor.user,ownerEpoch:actor.epoch,nativeRequestID:native.requestID,nativeLease:native.leaseToken,controllerScope:root};
   consentPlan={protocolVersion:2,requestID:root.requestID,userID:actor.user,inventoryDigest:root.inventoryDigest,appRequestID:native.requestID,appScopeID:actor.epoch,householdID:home,successorID:recipient.user,memberIDs:initialInventory.members.map(m=>m.user_id),familyRecordIDs:[product],familySnapshotDigest:snapshotDigest(initialSnapshot)};
   plan={requestID:root.requestID,homeID:home,ownerID:actor.user,ownerEpoch:actor.epoch,recipientID:recipient.user,recipientEpoch:recipient.epoch,snapshotDigest:consentPlan.familySnapshotDigest,files:source.map(f=>({id:f.id,mime:'image/png',size:bytes.length,sha256:sha,source:{userID:f.user,epoch:f.epoch,path:f.path}}))};
   consents=createFamilyAttachmentInventoryConsent({key:randomBytes(32),store:{transaction,target:async(tx,request,h,who)=>{assert.equal(request,root.requestID);assert.equal(h,home);assert.ok([actor.user,recipient.user].includes(who));await locks(tx);return {scope,plan,inventory:await inventory(tx)};},records:async(tx,s)=>(await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id for update',[s.requestID,s.homeID])).rows,record:(tx,s,p,r)=>tx.query('insert into maintenance_private.family_attachment_inventory_consents values($1,$2,$3,$4,null)',[s.requestID,s.homeID,r.actorID,r.token])},identifyActor:async(token,signal)=>{signal.throwIfAborted();return ok(await admin.auth.getUser(token)).user.id;},verifyIdentity:identity,verifyActor,currentAuthority:(tx,s,p,i,d,signal)=>frozenAuthority(tx,s,p,signal)});
   committed=createCommittedHouseholdConsentVerifier({key,verifyCommittedInventory:consents.authorizeCommittedActivation});
   const status=createFamilyAttachmentStatus({transaction,authorize:consents.authorize}),journal=createFamilyAttachmentJournal({transaction,authorize:consents.authorize});
   const storage=createFamilyAttachmentStoragePorts({clientForSignal:countedClientForSignal,guard:async(s,p,f,op,signal)=>{const state=await status(s,p,signal);return op==='cleanup'?state.state==='activated':state.state==='prepared'||state.state==='activated';}});
   const completionStorage=createFamilyAttachmentStoragePorts({clientForSignal:countedClientForSignal,guard:(s,p,f,op,signal)=>frozenAuthority(db,s,p,signal)});
   const completion=createFamilyAttachmentCompletion({transaction,verifyCommittedConsent:committed,verifyReadAuthority:frozenAuthority,verifyWriteAuthority:frozenAuthority,storage:completionStorage});
   ports={...storage,plan:async()=>plan,guard:async(s,signal)=>await frozenAuthority(db,s,plan,signal),status:async(...args)=>await completed(db,args[2])?completion.status(...args):status(...args),
    prepare:async(...args)=>{preparations++;await journal.prepare(...args);throw Error('Successful Ouchi family reservation reply lost');},
    writeDestination:async(...args)=>{await storage.writeDestination(...args);throw Error('Successful Ouchi family copy upload reply lost');},
    activate:async(s,p,digest,proof,signal)=>{
     activations++;const activation=createFamilyAttachmentActivation({scope:s,plan,proof,signal,authorize:consents.authorizeActivation});
     try{await transaction(async tx=>{
      await createHouseholdHandoffPort(key,activation)(root,native.leaseToken,home,tx);
      if(tamperActivation){tamperActivation=false;assert.equal((await tx.query("update auth.mfa_factors set friendly_name=$1 where id=(select id from auth.mfa_factors where user_id=$2 and status::text='verified' and factor_type::text='totp' order by id limit 1) returning id",['Synthetic late Ouchi family drift',recipient.user])).rowCount,1);}
     },signal);}catch(e){lastActivationFailure=e;throw e;}
     throw Error('Successful Ouchi family activation reply lost');
    },
    removeSource:async(...args)=>{await storage.removeSource(...args);throw Error('Successful Ouchi family source removal reply lost');},
    finish:async(...args)=>{finishes++;await completion.finish(...args);throw Error('Successful Ouchi family completion reply lost');}};
   for(const name of Object.keys(ports)){const original=ports[name];ports[name]=async(...args)=>{try{const result=await original(...args);if(result===false&&events.length<20)events.push({stage:name,message:'false'});return result;}catch(e){if(events.length<20)events.push({stage:name,message:String(e.message).slice(0,180)});console.log('whole Ouchi family port outcome',name,e.message);throw e;}};}
  },
  async prepare(s,tx){assert.deepEqual(s,root);assert.equal(await current(tx),true);
   await tx.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[home,actor.user,recipient.user,root,consentPlan,handoffPlanDigest(root,consentPlan),initialSnapshot]);
   await tx.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[home,actor.user,root]);return true;
  },current,targets:async tx=>{assert.equal(await current(tx),true);const rows=(await tx.query('select home_id from maintenance_private.household_handoff_plans where owner_id=$1 and scope=$2::jsonb order by home_id',[actor.user,root])).rows;assert.deepEqual(rows,[{home_id:home}]);return [{scope,plan:normalizeFamilyAttachmentPlan(plan)}];},
  completions:async(tx,list)=>list.length===1&&await current(tx)&&await completed(tx,tx.signal),ports:async()=>ports,
  async ensureConsents(){if(issued)return;const issuer=createHandoffConsentIssuer({key,verifyIdentity:async(token,tx)=>{const found=await identity(token,tx);return found?{userID:found.userID,authVerifiedAt:found.authenticatedAt}:null;},store:{transaction,target:async(tx,r,h,who)=>{assert.equal(r,root.requestID);assert.equal(h,home);assert.ok([actor.user,recipient.user].includes(who));await locks(tx);assert.equal(await current(tx),true);return {scope:root,plan:consentPlan};},existing:async(tx,s,p,who)=>{const row=(await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2 for update',[home,who])).rows[0];return row??null;},record:(tx,s,p,who,token)=>tx.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[home,who,token])}});
   for(const person of [actor,recipient]){
    const token=tokens.get(person.user);assert.equal((await consents.issue({requestID:root.requestID,homeID:home,accessToken:token,confirmation:'写真・保証書の一覧と受取先を確認して引き継ぎに同意する',signal:controller.signal})).status,'accepted');
    assert.equal((await issuer({requestID:root.requestID,householdID:home,accessToken:token,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
   }issued=true;originalProofDigest=await proofDigest();
  },
  async verifyAbortBoundary(){
   const probe=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:2000,query_timeout:6500});await probe.connect();const cancel=new AbortController();let entered=false;
   try{await probe.query('begin');await probe.query('select request_id from private.kb_shared_deletion_journal where request_id=$1 for update',[root.requestID]);
    const pid=(await db.query('select pg_backend_pid() pid')).rows[0].pid;const timer=setTimeout(()=>cancel.abort(),50);
    try{await assert.rejects(transaction(async()=>{entered=true;},cancel.signal),e=>e.name==='AbortError');}finally{clearTimeout(timer);}
    assert.equal(entered,false);const quiet=(await probe.query('select state,xact_start from pg_stat_activity where pid=$1',[pid])).rows[0];assert.equal(quiet.state,'idle');assert.equal(quiet.xact_start,null);
   }finally{await probe.query('rollback');await probe.end();}
   console.log('whole Ouchi family: cancellation during actual root-row lock wait rolled back to idle; callback never entered, original controller remains usable');
  },
  async verifyRefusedActivation(){
   assert.equal(lastActivationFailure?.code,'CURRENT_TRANSACTION_VERIFICATION_REQUIRED');assert.deepEqual(await inventory(db),initialInventory);assert.deepEqual(await snapshot(db),initialSnapshot);
   assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,actor.user);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts where request_id=$1 and home_id=$2',[root.requestID,home])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from auth.mfa_factors where user_id=$1 and friendly_name=$2',[recipient.user,'Synthetic late Ouchi family drift'])).rows[0].n,0);
   assert.equal(await proofDigest(),originalProofDigest);assert.deepEqual({preparations,copies,activations,removals,finishes},{preparations:1,copies:1,activations:1,removals:0,finishes:0});
   for(const f of source){const blob=ok(await admin.storage.from('ouchi-product-attachments').download(f.path));assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);}
  },
  async verifyRetained(){assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient.user);assert.equal(await retainedSnapshotMatches(db),true);
   for(const f of normalizeFamilyAttachmentPlan(plan).files){const blob=ok(await admin.storage.from('ouchi-product-attachments').download(f.destination.path));assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);const read=ok(await admin.rpc('read_maintenance_attachment',{target_user:recipient.user,verified_session:recipient.session,expected_epoch:recipient.epoch,attachment_id:f.id}));assert.equal(read.user,f.destination.userID);if(f.source.path!==f.destination.path){const missing=await admin.storage.from('ouchi-product-attachments').download(f.source.path);assert.equal(missing.error?.code,'NoSuchKey');}}
   if(formerUploader){
    assert.deepEqual(await readPrivate(),privateState);
    const blob=ok(await admin.storage.from('ouchi-product-attachments').download(privateFile.path));assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
    const who={target_user:formerUploader.user,verified_session:formerUploader.session,expected_epoch:formerUploader.epoch};
    assert.equal(ok(await admin.rpc('read_maintenance_attachment',{...who,attachment_id:privateFile.id})).user,formerUploader.user);
    assert.equal(ok(await admin.rpc('read_maintenance_attachment',{...who,attachment_id:source.find(f=>f.user===formerUploader.user).id})),null);
    assert.equal(ok(await formerUploader.client.auth.getUser()).user.id,formerUploader.user);
    console.log('whole Ouchi family: former uploader family file remains readable to recipient at original path; former member denied family RPC read, unrelated private metadata/write/path/bytes and Auth unchanged');
   }
   assert.deepEqual({preparations,copies,activations,removals,finishes},{preparations:1,copies:1,activations:2,removals:1,finishes:1});assert.equal(await proofDigest(),originalProofDigest);
  }};
}
