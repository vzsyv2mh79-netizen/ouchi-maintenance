import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createFamilyAttachmentInventoryConsent} from '../../lib/family-attachment-inventory-consent.mjs';
import {createFamilyAttachmentJournal} from '../../lib/family-attachment-journal.mjs';
import {createFamilyAttachmentStatus} from '../../lib/family-attachment-status.mjs';
import {createFamilyAttachmentActivation} from '../../lib/family-attachment-activation.mjs';
import {createFamilyAttachmentStoragePorts} from '../../lib/family-attachment-storage.mjs';
import {handoffFamilyAttachments} from '../../lib/family-attachment-handoff.mjs';
import {createHouseholdHandoffPort,snapshotDigest} from './handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest} from './handoff-controller-compatibility/handoff-consent.mjs';

/** Actual disposable PostgreSQL, GoTrue accounts and private Storage bytes.
 * Family-snapshot consents use actual getUser identities and a synthetic signing
 * key. Complete-inventory consents now use verified real bearers, password AMR
 * timestamps using the prepared pinned issuer adapter. Its separate scratch
 * account exercises actual session/factor/enrollment contention and rollback.
 * Issuer and worker use the prepared current-session/factor/enrollment pins;
 * project policy remains explicitly injected and exact factor-set snapshot
 * binding/current production policy remain open.
 * No shipping
 * route, new production grant, source cleanup or whole-account completion proof.
 * Runs last: its global private review fences must not change preceding cases.
 */
export async function verifyDisposableFamilyAttachmentAtomic({account,admin,origin,service,options,bytes,createAttachmentFetch,readAttachmentResponse,createHomeHandoffInventoryIdentityVerifier,createHomeHandoffInventoryActorVerifier}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 assert.equal(typeof readAttachmentResponse,'function');assert.equal(typeof createHomeHandoffInventoryIdentityVerifier,'function');assert.equal(typeof createHomeHandoffInventoryActorVerifier,'function');
 const {Client}=await import('pg');
 const db=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
 await db.connect();
 try{
  const owner=await account(),receiver=await account(),unrelated=await account();
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
  await db.query(readFileSync('tests/fixtures/family-attachment-inventory-consent.sql','utf8'));
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
  // Explicit disposable policy, not live Management acquisition. The production
  // issuer adapter itself verifies/pins actual Auth rows and recent signed AMR.
  const projectID='abcdefghijklmnopqrst';
  const policy=Object.freeze({projectID,singleSession:false,timeboxSeconds:null,inactivitySeconds:null,allowLowAALSeconds:null,totpVerify:true,phoneVerify:false,webAuthnVerify:false});
  const policyReader=Object.assign(async()=>policy,{isCurrent:value=>value===policy});
  const identity=createHomeHandoffInventoryIdentityVerifier({projectID,policyReader,getUser:(token,signal)=>createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(signal,5000,65536)}}).auth.getUser(token)});
  // A separate real account proves row/factor-insertion fences and cancellation
  // without revoking the two people needed by the complete Storage handoff.
  const scratch=await account();
  const scratchFactor=await scratch.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic pin test'});assert.equal(scratchFactor.error,null);
  const scratchSession=await scratch.client.auth.getSession();assert.equal(scratchSession.error,null);
  const scratchToken=scratchSession.data.session.access_token;
  const contender=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:3000});
  await contender.connect();
  try{
   await contender.query("set lock_timeout='200ms'");
   await transaction(async tx=>{
    const signal=AbortSignal.timeout(10000);
    const verified=await identity(scratchToken,{signal,query:(sql,args)=>tx.query(sql,args)});
    assert.equal(verified.userID,scratch.user);assert.equal(verified.sessionID,scratch.session);assert.equal(verified.epochID,scratch.epoch);assert.equal(verified.aal,'aal1');
    for(const [sql,args] of [
     ['delete from auth.sessions where id=$1',[scratch.session]],
     ["update auth.mfa_factors set status='verified' where id=$1",[scratchFactor.data.id]],
     ['update maintenance_private.app_epochs set enabled=false where user_id=$1',[scratch.user]],
     ["insert into auth.mfa_factors select (jsonb_populate_record(null::auth.mfa_factors,to_jsonb(f)||jsonb_build_object('id',$1::uuid,'user_id',$2::uuid,'friendly_name',$3::text))).* from auth.mfa_factors f where id=$4",[randomUUID(),scratch.user,'Synthetic concurrent factor '+randomUUID(),scratchFactor.data.id]]
    ])await assert.rejects(contender.query(sql,args),error=>error.code==='55P03');
   });
   const cancellation=new AbortController();
   await assert.rejects(transaction(tx=>identity(scratchToken,{signal:cancellation.signal,query:async(sql,args)=>{
    const result=await tx.query(sql,args);if(sql.includes('from auth.users where'))cancellation.abort();return result;
   }})),{name:'AbortError'});
   await contender.query('begin');
   try{assert.equal((await contender.query('select id from auth.users where id=$1 for update nowait',[scratch.user])).rows[0].id,scratch.user);}
   finally{await contender.query('rollback');}
   const logout=await scratch.client.auth.signOut({scope:'local'});assert.equal(logout.error,null);
   assert.equal(await transaction(tx=>identity(scratchToken,{signal:AbortSignal.timeout(10000),query:(sql,args)=>tx.query(sql,args)})),null);
  }finally{await contender.end();}
  async function originalInventory(tx){
   const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[homeID])).rows;
   const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[homeID])).rows;
   const files=(await tx.query("select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p.\"homeId\"=$1 and f.state<>'removed' order by f.id for update of f",[homeID])).rows;
   const writes=(await tx.query("select w.* from maintenance_private.attachment_write_attempts w join maintenance_private.product_attachments f on f.id=w.attachment_id join public.products p on p.id=f.product_id where p.\"homeId\"=$1 and f.state<>'removed' order by w.attachment_id for update of w",[homeID])).rows;
   return JSON.parse(JSON.stringify({members,products,files,writes}));
  }
  const actorVerifier=createHomeHandoffInventoryActorVerifier({projectID,policyReader});
  const inventoryConsent=createFamilyAttachmentInventoryConsent({key:randomBytes(32),store:{
   transaction,target:async(tx,request,home,actor)=>{assert.equal(request,scope.requestID);assert.equal(home,homeID);assert.ok([owner.user,receiver.user].includes(actor));return {scope,plan,inventory:await originalInventory(tx)};},
   records:async(tx,s)=>(await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id for update',[s.requestID,s.homeID])).rows,
   record:(tx,s,p,r)=>tx.query('insert into maintenance_private.family_attachment_inventory_consents values($1,$2,$3,$4,null)',[s.requestID,s.homeID,r.actorID,r.token])
  },verifyIdentity:(token,tx,signal)=>identity(token,{signal,query:(sql,args)=>tx.query(sql,args)}),verifyActor:(tx,claims,signal)=>actorVerifier({signal,query:(sql,args)=>tx.query(sql,args)},claims,signal),currentAuthority:async(tx,s,p,i,d,signal)=>{
   signal.throwIfAborted();
   const row=(await tx.query("select exists(select 1 from maintenance_private.account_deletion_requests n join maintenance_private.household_stop_bindings b on b.user_id=n.user_id join maintenance_private.household_family_holds h on h.principal=n.user_id where n.id=$1 and n.user_id=$2 and n.app_epoch_id=$3 and n.lease_token=$4 and n.state='running' and n.lease_until>clock_timestamp() and b.native_lease=n.lease_token and b.scope=$5::jsonb and b.state='processing' and b.lease_until>clock_timestamp() and h.home_id=$6 and h.scope=b.scope) as current",[s.nativeRequestID,s.userID,s.ownerEpoch,s.nativeLease,JSON.stringify(s.controllerScope),s.homeID])).rows[0];
   signal.throwIfAborted();return row.current===true;
  }});
  for(const actor of [owner,receiver]){
   const session=await actor.client.auth.getSession();assert.equal(session.error,null);
   assert.equal((await inventoryConsent.issue({requestID:scope.requestID,homeID,accessToken:session.data.session.access_token,confirmation:'写真・保証書の一覧と受取先を確認して引き継ぎに同意する',signal:AbortSignal.timeout(10000)})).status,'accepted');
  }
  const provider=()=>createFamilyAttachmentStatus({transaction,authorize:inventoryConsent.authorize});
  const journal=createFamilyAttachmentJournal({transaction,authorize:inventoryConsent.authorize});
  let status=provider(),preparations=0,activations=0,cleanupCalls=0;
  const storage=createFamilyAttachmentStoragePorts({clientForSignal:signal=>createClient(origin,service,{...options,global:{fetch:createAttachmentFetch(signal)}}),guard:async(s,p,f,operation,signal)=>{
   if(operation==='cleanup'){cleanupCalls++;return false;} // no source erasure in this fixture
   const current=await status(s,p,signal);return current.state==='prepared'||current.state==='activated';
  }});
  const ports={...storage,plan:async()=>plan,guard:async(s,signal)=>{await status(s,plan,signal);return true;},status:(...args)=>status(...args),
   prepare:async(...args)=>{preparations++;await journal.prepare(...args);throw Error('Successful reservation reply lost');},
   activate:async(s,p,digest,proof,signal)=>{
    activations++;const activation=createFamilyAttachmentActivation({scope:s,plan,proof,signal,authorize:inventoryConsent.authorizeActivation});
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
  const signedContext=(await db.query('select inventory_approval from maintenance_private.family_attachment_activation_contexts where request_id=$1',[scope.requestID])).rows;
  assert.equal(signedContext.length,1);assert.equal(signedContext[0].inventory_approval.consents.length,2);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents where request_id=$1',[scope.requestID])).rows[0].n,2);
  for(const path of [plan.files[0].source.path,plan.files[1].source.path,`${receiver.user}/${receiver.epoch}/${ownFile}.png`]){
   const result=await admin.storage.from('ouchi-product-attachments').download(path);assert.equal(result.error,null);assert.deepEqual(Buffer.from(await result.data.arrayBuffer()),bytes);
  }
  for(const id of [ownFile,memberFile]){
   const result=await admin.rpc('read_maintenance_attachment',{target_user:receiver.user,verified_session:receiver.session,expected_epoch:receiver.epoch,attachment_id:id});assert.equal(result.error,null);assert.equal(result.data.user,receiver.user);
  }
  // Exercise the existing prepared HTTP handler with the person's ACTUAL bearer,
  // not an admin-supplied target_user or a client entitlement flag. No public
  // route is deployed by this direct handler invocation.
  const receiverSession=await receiver.client.auth.getSession();assert.equal(receiverSession.error,null);
  const receiverToken=receiverSession.data.session.access_token;
  async function downloadWithToken(token,id){
   return readAttachmentResponse(new Request(origin+'/api/attachments?attachmentId='+id,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)}),admin);
  }
  async function refused(response){
   assert.notEqual(response.status,200);assert.equal(response.headers.get('content-type'),'application/json');
   assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(typeof (await response.json()).error,'string');
  }
  for(const id of [ownFile,memberFile]){
   const response=await downloadWithToken(receiverToken,id);assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  }
  for(const actor of [owner,unrelated]){
   const session=await actor.client.auth.getSession();assert.equal(session.error,null);
   for(const id of [ownFile,memberFile])await refused(await downloadWithToken(session.data.session.access_token,id));
  }
  await db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where request_id=$1 and home_id=$2 and actor_id=$3',[scope.requestID,homeID,receiver.user]);
  await assert.rejects(status(scope,plan,AbortSignal.timeout(10000)),/Signed readback inventory/);
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});assert.equal(activations,1);
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(plan.files[0].source.path)).error,null);
  assert.equal((await owner.client.auth.getUser()).data.user.id,owner.user);assert.equal((await receiver.client.auth.getUser()).data.user.id,receiver.user);
  const logout=await receiver.client.auth.signOut({scope:'local'});assert.equal(logout.error,null);
  for(const id of [ownFile,memberFile])await refused(await downloadWithToken(receiverToken,id));
  // Logout must not remove records, bytes or the GoTrue user itself.
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[receiver.user])).rows[0].n,1);
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(`${receiver.user}/${receiver.epoch}/${ownFile}.png`)).error,null);
 }finally{await db.end();}
}
