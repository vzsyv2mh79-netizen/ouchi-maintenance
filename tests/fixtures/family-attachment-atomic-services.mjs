import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createFamilyAttachmentJournal} from '../../lib/family-attachment-journal.mjs';
import {createFamilyAttachmentStatus} from '../../lib/family-attachment-status.mjs';
import {createFamilyAttachmentActivation} from '../../lib/family-attachment-activation.mjs';
import {createFamilyAttachmentStoragePorts} from '../../lib/family-attachment-storage.mjs';
import {handoffFamilyAttachments} from '../../lib/family-attachment-handoff.mjs';
import {createHouseholdHandoffPort,snapshotDigest} from './handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest} from './handoff-controller-compatibility/handoff-consent.mjs';

/** Actual disposable PostgreSQL, GoTrue accounts and private Storage bytes.
 * Family-snapshot consents use actual getUser identities and a synthetic signing
 * key. Complete-inventory authorization/current MFA remain injected. No shipping
 * route, new production grant, source cleanup or whole-account completion proof.
 * Runs last: its global private review fences must not change preceding cases.
 */
export async function verifyDisposableFamilyAttachmentAtomic({account,admin,origin,service,options,bytes,createAttachmentFetch}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const {Client}=await import('pg');
 const db=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
 await db.connect();
 try{
  const owner=await account(),receiver=await account();
  const homeID=randomUUID(),productID=randomUUID(),taskID=randomUUID(),ownFile=randomUUID(),memberFile=randomUUID(),nativeRequestID=randomUUID(),nativeLease=randomUUID();
  const sha=createHash('sha256').update(bytes).digest('hex');
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[homeID,owner.user]);
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[homeID,receiver.user,'Synthetic atomic receiver']);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[productID,homeID,'air','Synthetic atomic product']);
  await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[taskID,productID,'Synthetic atomic task','掃除','ユーザー設定']);
  const source=[{id:ownFile,user:owner},{id:memberFile,user:receiver}];
  for(const {id,user} of source){
   await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,$5,'image/png','stored',$6,$6,true,$7)",[id,user.user,user.epoch,productID,bytes.length,sha,owner.user]);
   await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$4,$5,'settled',clock_timestamp())",[id,randomUUID(),user.user,owner.user,user.epoch]);
   const upload=await admin.storage.from('ouchi-product-attachments').upload(`${user.user}/${user.epoch}/${id}.png`,bytes,{contentType:'image/png',upsert:false});assert.equal(upload.error,null);
  }
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeRequestID,owner.user,owner.epoch,nativeLease]);
  // Journal/quota were installed by the earlier awaited actual quota fixture.
  for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.query(readFileSync('tests/fixtures/handoff-controller-compatibility/'+name,'utf8'));
  await db.query(readFileSync('tests/fixtures/family-attachment-activation.sql','utf8'));
  const controllerScope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner.user,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:nativeRequestID,scopeID:owner.epoch}]};
  await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner.user,controllerScope,nativeLease]);
  await db.query('select maintenance_private.freeze_household_scope($1,$2)',[controllerScope,nativeLease]);
  const saved=(await db.query('select maintenance_private.household_family_snapshot($1) as value',[homeID])).rows[0].value;
  const consentPlan={protocolVersion:2,requestID:controllerScope.requestID,userID:owner.user,inventoryDigest:controllerScope.inventoryDigest,appRequestID:nativeRequestID,appScopeID:owner.epoch,householdID:homeID,successorID:receiver.user,memberIDs:[owner.user,receiver.user],familyRecordIDs:[productID],familySnapshotDigest:snapshotDigest(saved)};
  await db.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[homeID,owner.user,receiver.user,controllerScope,consentPlan,handoffPlanDigest(controllerScope,consentPlan),saved]);
  await db.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[homeID,owner.user,controllerScope]);
  const transaction=async callback=>{
   await db.query('begin');
   try{await db.query("set local statement_timeout='4500ms'");const result=await callback(db);await db.query('commit');return result;}
   catch(error){await db.query('rollback');throw error;}
  };
  const key=randomBytes(32);
  const issuer=createHandoffConsentIssuer({key,verifyIdentity:async token=>{
   const result=await admin.auth.getUser(token);assert.equal(result.error,null);
   return {userID:result.data.user.id,authVerifiedAt:Date.now()};
  },store:{transaction,target:async()=>({scope:controllerScope,plan:consentPlan}),
   existing:async(tx,s,p,actor)=>{const row=(await tx.query('select * from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2 for update',[homeID,actor])).rows[0];return row?{actorID:row.actor_id,token:row.token,revokedAt:row.revoked_at}:null;},
   record:(tx,s,p,actor,token)=>tx.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[homeID,actor,token])
  }});
  for(const actor of [owner,receiver]){
   const session=await actor.client.auth.getSession();assert.equal(session.error,null);
   assert.equal((await issuer({requestID:controllerScope.requestID,householdID:homeID,accessToken:session.data.session.access_token,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
  }
  const scope={requestID:controllerScope.requestID,homeID,userID:owner.user,ownerEpoch:owner.epoch,nativeRequestID,nativeLease,controllerScope};
  const plan={requestID:scope.requestID,homeID,ownerID:owner.user,ownerEpoch:owner.epoch,recipientID:receiver.user,recipientEpoch:receiver.epoch,snapshotDigest:consentPlan.familySnapshotDigest,files:source.map(({id,user})=>({id,mime:'image/png',size:bytes.length,sha256:sha,source:{userID:user.user,epoch:user.epoch,path:`${user.user}/${user.epoch}/${id}.png`}}))};
  const provider=()=>createFamilyAttachmentStatus({transaction,authorize:async()=>true}); // inventory/MFA injection remains explicit
  const journal=createFamilyAttachmentJournal({transaction,authorize:async()=>true});
  let status=provider(),preparations=0,activations=0,cleanupCalls=0;
  const storage=createFamilyAttachmentStoragePorts({clientForSignal:signal=>createClient(origin,service,{...options,global:{fetch:createAttachmentFetch(signal)}}),guard:async(s,p,f,operation,signal)=>{
   if(operation==='cleanup'){cleanupCalls++;return false;} // no source erasure in this fixture
   const current=await status(s,p,signal);return current.state==='prepared'||current.state==='activated';
  }});
  const ports={...storage,plan:async()=>plan,guard:async(s,signal)=>{await status(s,plan,signal);return true;},status:(...args)=>status(...args),
   prepare:async(...args)=>{preparations++;await journal.prepare(...args);throw Error('Successful reservation reply lost');},
   activate:async(s,p,digest,proof,signal)=>{
    activations++;const activation=createFamilyAttachmentActivation({scope:s,plan,proof,signal,authorize:async()=>true});
    await transaction(tx=>createHouseholdHandoffPort(key,activation)(controllerScope,nativeLease,homeID,tx));
    throw Error('Successful activation reply lost');
   },finish:async()=>{throw Error('Whole-account completion not implemented');}
  };
  assert.equal((await status(scope,plan,AbortSignal.timeout(10000))).state,'absent');
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(preparations,1);assert.equal(activations,1);assert.ok(cleanupCalls>0);
  status=provider();assert.equal((await status(scope,plan,AbortSignal.timeout(10000))).state,'activated');
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(preparations,1);assert.equal(activations,1);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[homeID])).rows[0].owner_id,receiver.user);
  assert.deepEqual((await db.query('select maintenance_private.household_family_snapshot($1) as value',[homeID])).rows[0].value,saved);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts where request_id=$1',[scope.requestID])).rows[0].n,1);
  assert.equal((await db.query('select state from maintenance_private.family_attachment_quota where request_id=$1',[scope.requestID])).rows[0].state,'consumed');
  for(const path of [plan.files[0].source.path,plan.files[1].source.path,`${receiver.user}/${receiver.epoch}/${ownFile}.png`]){
   const result=await admin.storage.from('ouchi-product-attachments').download(path);assert.equal(result.error,null);assert.deepEqual(Buffer.from(await result.data.arrayBuffer()),bytes);
  }
  for(const id of [ownFile,memberFile]){
   const result=await admin.rpc('read_maintenance_attachment',{target_user:receiver.user,verified_session:receiver.session,expected_epoch:receiver.epoch,attachment_id:id});assert.equal(result.error,null);assert.equal(result.data.user,receiver.user);
  }
  await db.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where home_id=$1 and actor_id=$2',[homeID,receiver.user]);
  await assert.rejects(status(scope,plan,AbortSignal.timeout(10000)),/Retained family consent/);
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});assert.equal(activations,1);
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(plan.files[0].source.path)).error,null);
  assert.equal((await owner.client.auth.getUser()).data.user.id,owner.user);assert.equal((await receiver.client.auth.getUser()).data.user.id,receiver.user);
 }finally{await db.end();}
}
