import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,oe,re,rs} from './fixtures/home-handoff-identifiers.mjs';
import {createHouseholdHandoffPort,snapshotDigest} from './fixtures/handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest} from './fixtures/handoff-controller-compatibility/handoff-consent.mjs';
import {createFamilyAttachmentJournal} from '../lib/family-attachment-journal.mjs';
import {createFamilyAttachmentActivation} from '../lib/family-attachment-activation.mjs';
import {handoffFamilyAttachments} from '../lib/family-attachment-handoff.mjs';

async function fixture({reserve=true,postAuthority=true,memberOnly=false,omitReceipt=false,commitFault=null}={}){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 const bytes=new Uint8Array([1,2,3,4]),sha=createHash('sha256').update(bytes).digest('hex');
 const owned=randomUUID(),member=randomUUID(),nativeRequest=randomUUID(),nativeLease=randomUUID();
 const descriptions=memberOnly?[[member,recipient,re]]:[[owned,owner,oe],[member,recipient,re]];
 for(const [id,user,epoch] of descriptions){
  await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,4,'image/png','stored',$5,$5,true,$6)",[id,user,epoch,product,sha,owner]);
  await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$4,$5,'settled',clock_timestamp())",[id,randomUUID(),user,owner,epoch]);
 }
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeRequest,owner,oe,nativeLease]);
 for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.exec(readFileSync('tests/fixtures/handoff-controller-compatibility/'+name,'utf8'));
 for(const name of ['journal','quota','activation'])await db.exec(readFileSync('tests/fixtures/family-attachment-'+name+'.sql','utf8'));
 const controllerScope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:nativeRequest,scopeID:oe}]};
 await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,controllerScope,nativeLease]);
 await db.query('select maintenance_private.freeze_household_scope($1,$2)',[controllerScope,nativeLease]);
 const saved=(await db.query('select maintenance_private.household_family_snapshot($1) as value',[home])).rows[0].value;
 const consentPlan={protocolVersion:2,requestID:controllerScope.requestID,userID:owner,inventoryDigest:controllerScope.inventoryDigest,appRequestID:nativeRequest,appScopeID:oe,householdID:home,successorID:recipient,memberIDs:[owner,recipient],familyRecordIDs:[product],familySnapshotDigest:snapshotDigest(saved)};
 await db.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[home,owner,recipient,controllerScope,consentPlan,handoffPlanDigest(controllerScope,consentPlan),saved]);
 await db.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[home,owner,controllerScope]);
 const adapter=tx=>({query:async(sql,args)=>{const r=await tx.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};}});
 const key=randomBytes(32);
 const issuer=createHandoffConsentIssuer({key,verifyIdentity:async actor=>({userID:actor,authVerifiedAt:Date.now()}),store:{
  transaction:cb=>db.transaction(tx=>cb(adapter(tx))),target:async()=>({scope:controllerScope,plan:consentPlan}),
  existing:async(tx,s,p,actor)=>{const r=(await tx.query('select * from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2 for update',[home,actor])).rows[0];return r?{actorID:r.actor_id,token:r.token,revokedAt:r.revoked_at}:null;},
  record:(tx,s,p,actor,token)=>tx.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[home,actor,token])
 }});
 for(const actor of [owner,recipient])assert.equal((await issuer({requestID:controllerScope.requestID,householdID:home,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
 const scope={requestID:controllerScope.requestID,homeID:home,userID:owner,ownerEpoch:oe,nativeRequestID:nativeRequest,nativeLease,controllerScope};
 const plan={requestID:scope.requestID,homeID:home,ownerID:owner,ownerEpoch:oe,recipientID:recipient,recipientEpoch:re,snapshotDigest:consentPlan.familySnapshotDigest,files:descriptions.map(([id,userID,epoch])=>({id,size:4,mime:'image/png',sha256:sha,source:{userID,epoch,path:`${userID}/${epoch}/${id}.png`}}))};
 // Signed family consent uses synthetic identity; complete file inventory
 // consent/freeze authorization is injected. No shipping Auth claim here.
 const journal=createFamilyAttachmentJournal({transaction:cb=>db.transaction(tx=>cb(adapter(tx))),authorize:async()=>true});
 await journal[reserve?'reserve':'record'](scope,plan,new AbortController().signal);
 const objects=new Map(plan.files.map(f=>[f.source.path,new Blob([bytes],{type:'image/png'})]));
 let checks=0,removals=0;
 const ports={guard:async()=>true,plan:async()=>plan,prepare:async()=>{throw Error('Preparation already persisted');},
  status:async(s,p)=>({state:(await db.query('select 1 from maintenance_private.family_attachment_activation_receipts where request_id=$1',[scope.requestID])).rows.length?'activated':'prepared',planDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex')}),
  inspectDestination:async(s,p,f)=>objects.get(f.destination.path)??null,
  writeDestination:async(s,p,f)=>{objects.set(f.destination.path,objects.get(f.source.path));},
  activate:async(s,p,d,proof,signal)=>{
   const activation=createFamilyAttachmentActivation({scope:s,plan,proof,signal,authorize:async()=>++checks===1||postAuthority});
   await db.transaction(tx=>{
    const pinned=adapter(tx);
    // Fault injection: a lying adapter claims the receipt was inserted. The DB
    // deferred group check must still refuse COMMIT using actual persisted rows.
    const guarded={query:async(sql,args)=>{
     if(omitReceipt&&sql.startsWith('insert into maintenance_private.family_attachment_activation_receipts'))return {rows:[],rowCount:1};
     if(commitFault&&sql.startsWith('insert into maintenance_private.household_handoff_receipts')){
      if(commitFault==='missingRoute')await pinned.query("delete from maintenance_private.household_write_routes where kind='products' and object_id=$1",[product]);
      if(commitFault==='expiredBinding')await pinned.query("update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second' where user_id=$1",[owner]);
      if(commitFault==='revokedConsent')await pinned.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where home_id=$1 and actor_id=$2',[home,recipient]);
     }
     return pinned.query(sql,args);
    }};
    return createHouseholdHandoffPort(key,activation)(controllerScope,nativeLease,home,guarded);
   });
  },
  removeSource:async()=>{removals++;throw Error('Cleanup intentionally not implemented in this activation fixture');},
  sourceAbsent:async()=>false,finish:async()=>{throw Error('Activation is not whole-account completion');}
 };
 return {db,scope,plan,ports,objects,owned,member,key,saved,journal,get removals(){return removals;},run:()=>handoffFamilyAttachments(scope,ports,new AbortController().signal)};
}

test('measured copies compose with both family guards and atomically switch home, file custody, write routing and quota',async()=>{
 const f=await fixture();try{
  assert.deepEqual(await f.run(),{state:'pending'}); // old Storage cleanup is still pending
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  assert.deepEqual((await f.db.query('select maintenance_private.household_family_snapshot($1) as value',[home])).rows[0].value,f.saved);
  const files=(await f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  for(const file of files){assert.equal(file.user_id,recipient);assert.equal(file.app_epoch_id,re);assert.equal(file.captured_owner_id,recipient);assert.equal(file.state,'stored');}
  assert.equal(files.find(r=>r.id===f.member).object_path,f.plan.files.find(r=>r.id===f.member).source.path);
  const writes=(await f.db.query('select * from maintenance_private.attachment_write_attempts')).rows;
  assert.ok(writes.every(r=>r.owner_id===recipient&&r.uploader_id===recipient&&r.app_epoch_id===re&&r.state==='settled'));
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'consumed');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_handoff_receipts')).rows[0].n,1);
  await f.db.exec('set role service_role');
  const visible=(await f.db.query('select public.read_maintenance_attachment($1,$2,$3,$4) as value',[recipient,rs,re,f.owned])).rows[0].value;
  assert.equal(visible.user,recipient);assert.equal(visible.epoch,re);await f.db.exec('reset role');
  assert.ok(f.objects.has(f.plan.files.find(r=>r.id===f.owned).source.path));
  assert.equal((await f.db.query('select count(*)::int n from auth.users')).rows[0].n,3);
  const oldContext=(await f.db.query('select token from maintenance_private.family_attachment_activation_contexts')).rows[0].token;
  await f.db.query("select set_config('maintenance.attachment_activation_context',$1,false)",[oldContext]);
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set sha256=$1 where id=$2',['f'.repeat(64),f.owned]),/Household principal stopped/);
  await assert.rejects(f.db.exec("update maintenance_private.family_attachment_quota set state='reserved'"),/Verified quota consumption/);
 }finally{await f.db.close();}
});

test('lost post-mutation authority rolls home, file rows, settled writes, quota and both receipts back together',async()=>{
 const f=await fixture({postAuthority:false});try{
  const before=(await f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.deepEqual((await f.db.query('select * from maintenance_private.product_attachments order by id')).rows,before);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  for(const table of ['family_attachment_activation_receipts','household_handoff_receipts'])assert.equal((await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

test('a prepared client flag cannot replace exact quota, measured proof or private transaction context',async()=>{
 const f=await fixture({reserve:false});try{
  assert.deepEqual(await f.run(),{state:'pending'});assert.equal(f.removals,0);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.throws(()=>createFamilyAttachmentActivation({scope:f.scope,plan:f.plan,proof:{verified:true},signal:new AbortController().signal,authorize:async()=>true}),/Current measured/);
  assert.throws(()=>createHouseholdHandoffPort(f.key,{verified:true}),/Measured attachment/);
  await f.db.query("select set_config('maintenance.attachment_activation_context',$1,false)",[randomUUID()]);
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set user_id=$1 where id=$2',[recipient,f.owned]),/Household principal stopped/);
 }finally{await f.db.close();}
});

test('receiver enrollment loss before activation cannot consume quota or change household ownership',async()=>{
 const f=await fixture();try{
  await f.db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[recipient]);
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

test('deferred commit refuses quota consumption and home/files changes without a durable attachment receipt',async()=>{
 const f=await fixture({omitReceipt:true});try{
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  assert.equal((await f.db.query('select user_id from maintenance_private.product_attachments where id=$1',[f.owned])).rows[0].user_id,owner);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

test('deferred commit also protects member-only handoff with no receiver quota consumption event',async()=>{
 const f=await fixture({omitReceipt:true,memberOnly:true});try{
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select captured_owner_id from maintenance_private.product_attachments where id=$1',[f.member])).rows[0].captured_owner_id,owner);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_quota')).rows[0].n,0);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

for(const fault of ['missingRoute','expiredBinding','revokedConsent'])test(`deferred commit refuses ${fault} after final application authorization`,async()=>{
 const f=await fixture({commitFault:fault});try{
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  assert.equal((await f.db.query('select user_id from maintenance_private.product_attachments where id=$1',[f.owned])).rows[0].user_id,owner);
  assert.equal((await f.db.query('select owner_id from maintenance_private.household_write_routes where kind=$1 and object_id=$2',['products',product])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts')).rows[0].n,0);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});
