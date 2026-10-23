import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createOuchiRequestedPreparation,OUCHI_REQUESTED_PREPARE_SAVE_SQL,OUCHI_REQUESTED_PREPARE_SQL} from '../../../lib/ouchi-requested-preparation.mjs';
import {createDeletionJournal} from '../kakei-completion/lib/shared-deletion-journal.mjs';
import {fixtureTOTP} from '../scoped-native-gotrue.mjs';

export async function verifyPreparationProvenance({admin,coordinator,issuer,auth,transaction,ownerOnlyModule,policyReader,projectID}){
 for(const file of ['legacy-delegate.sql','protocol.sql'])await admin.query(readFileSync('tests/fixtures/requested-preparation-provenance-20261021/'+file,'utf8'));
 async function actor(){
  const user=randomUUID(),epoch=randomUUID(),email=user+'@fixture.invalid',password=randomBytes(30).toString('base64url');
  await auth.createFixtureUser(user,email,password);const initial=await auth.request('/token?grant_type=password',{email,password});
  const factor=await auth.request('/factors',{factor_type:'totp',friendly_name:'Cancellation provenance fixture'},initial.access_token);
  const challenge=await auth.request('/factors/'+factor.id+'/challenge',{},initial.access_token);
  const promoted=await auth.request('/factors/'+factor.id+'/verify',{challenge_id:challenge.id,code:fixtureTOTP(factor.totp.secret)},initial.access_token);
  const token=promoted.access_token,sessionID=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
  await admin.query('insert into maintenance_private.account_access values($1,true)',[user]);
  await admin.query('insert into maintenance_private.app_epochs values($1,$2,true)',[user,epoch]);
  await admin.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[sessionID,user,epoch]);
  await admin.query((await admin.query("select format('create policy provenance_actor_%s on private.kb_shared_deletion_journal for all to shared_retirement_backend using(user_id=%L::uuid) with check(user_id=%L::uuid)',replace($1::text,'-',''),$1::text,$1::text) sql",[user])).rows[0].sql);
  const home=randomUUID(),product=randomUUID();await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[home,user]);
  await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,\'air\',\'Provenance retained product\')',[product,home]);
  return {user,epoch,token,sessionID,home,product};
 }
 const a=await actor();
 const makeScope=async()=>{
  const nativeLease=randomUUID(),scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:a.user,leaseToken:randomUUID(),inventoryDigest:'9'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:a.epoch}]};
  const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,a.user,fixed]);return {scope,nativeLease};
 };
 let live=true;
 const portFor=({scope,nativeLease})=>createOuchiRequestedPreparation({scope,nativeLease,verifyCoverage:async(s,tx,signal)=>{signal.throwIfAborted();return live&&JSON.stringify(s)===JSON.stringify(scope);}});
 const snap=async()=>({
  access:(await admin.query('select * from maintenance_private.account_access where user_id=$1',[a.user])).rows,
  epochs:(await admin.query('select * from maintenance_private.app_epochs where user_id=$1 order by epoch_id',[a.user])).rows,
  mappings:(await admin.query('select * from maintenance_private.app_session_epochs where user_id=$1 order by session_id',[a.user])).rows,
  fence:(await admin.query('select * from maintenance_private.household_principal_fences where user_id=$1',[a.user])).rows,
  binding:(await admin.query('select * from maintenance_private.household_stop_bindings where user_id=$1',[a.user])).rows,
  data:(await admin.query('select * from public.products order by id')).rows,
  homes:(await admin.query('select * from public.homes order by id')).rows,
 });
 const originalSnapshot=await snap();const s=await makeScope(),port=portFor(s),args=[s.scope.requestID,JSON.stringify(s.scope),s.nativeLease];
 await assert.rejects(transaction(coordinator,tx=>tx.query(OUCHI_REQUESTED_PREPARE_SQL,args)),/Preimage must precede/);
 await assert.rejects(transaction(coordinator,tx=>tx.query(OUCHI_REQUESTED_PREPARE_SAVE_SQL,args)),/Same-transaction actual preparation required/);
 assert.deepEqual(await snap(),originalSnapshot,'Missing/partial snapshot preparation leaves app/family state untouched');
 await assert.rejects(transaction(coordinator,async tx=>{try{await port.prepare(s.scope,tx);}catch(e){console.error('Provenance preparation diagnostic',JSON.stringify({code:e.code,where:e.where}));throw e;}live=false;}),/Current transaction verification/);live=true;
 assert.deepEqual(await snap(),originalSnapshot,'Late preparation gate rollback restores access/epoch/fence/native artifacts');
 assert.equal(await transaction(coordinator,tx=>port.prepare(s.scope,tx)),true);
 assert.equal(await transaction(coordinator,tx=>port.prepare(s.scope,tx)),true,'Lost preparation reply retries same immutable snapshot/lease');
 assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[a.user])).rows[0].enabled,false);
 assert.equal((await admin.query('select inventory_captured from maintenance_private.account_deletion_requests where id=$1',[s.scope.apps[0].requestID])).rows[0].inventory_captured,true);
 const ownerPort=ownerOnlyModule.createOuchiOwnerOnlyClaimPort({key:randomBytes(32),scope:s.scope,nativeLease:s.nativeLease,projectID,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null})});
 assert.equal((await transaction(issuer,tx=>ownerPort.issue(a.token,tx))).status,'accepted','Actual owner AAL2 original can be issued after provenance preparation');
 const savedOriginal=(await admin.query('select * from maintenance_private.ouchi_owner_originals where request_id=$1',[s.scope.requestID])).rows;
 const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':async(value,tx)=>await port.cancelRequested(value,tx)&&await port.verifyCancelled(value,tx)});
 await assert.rejects(transaction(coordinator,async tx=>{
  await tx.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '1 minute' where request_id=$1",[s.scope.requestID,s.scope.leaseToken]);
  await port.cancelRequested(s.scope,tx);
 }),/Exact requested\/cancelled root/);
 await assert.rejects(transaction(coordinator,async tx=>{
  await tx.query("update private.kb_shared_deletion_journal set status='cancelled' where request_id=$1",[s.scope.requestID]);
  await port.cancelRequested(s.scope,tx);live=false;
 }),/Current transaction verification/);live=true;
 assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[a.user])).rows[0].enabled,false,'Failed cancellation rolls every restoration back');
 await admin.query('alter table maintenance_private.account_deletion_requests disable trigger cancelled_preparation_native_identity');
 try{await assert.rejects(journal.cancel(s.scope),/writer changed/);}finally{await admin.query('alter table maintenance_private.account_deletion_requests enable always trigger cancelled_preparation_native_identity');}
 assert.equal(await journal.cancel(s.scope),true);
 assert.deepEqual(await snap(),originalSnapshot,'New provenance cancellation exactly restores original actor flags/fences and leaves every family product/home unchanged');
 assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals where request_id=$1',[s.scope.requestID])).rows,savedOriginal,'Cancellation preserves actual original HMAC/expiry');
 assert.equal(await transaction(coordinator,tx=>ownerPort.requested(s.scope,tx)),null,'Cancelled root invalidates reuse without deleting original');
 assert.equal(await transaction(coordinator,tx=>port.cancelRequested(s.scope,tx)),true,'Cancelled retry is historical only');
 await assert.rejects(admin.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[s.scope.apps[0].requestID,a.user,a.epoch]),/Cancelled native identity/);
 const next=await makeScope(),nextPort=portFor(next);assert.equal(await transaction(coordinator,tx=>nextPort.prepare(next.scope,tx)),true);
 assert.equal(await transaction(coordinator,tx=>port.verifyCancelled(s.scope,tx)),true,'Old cancellation verify does not reset new root preparation');
 assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[a.user])).rows[0].enabled,false);
 const nextJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(value,tx)=>nextPort.cancelRequested(value,tx)});
 assert.equal(await nextJournal.cancel(next.scope),true);assert.deepEqual(await snap(),originalSnapshot);
 // Drift cases are injected only into synthetic rows. Restore USER trigger
 // modes before every protocol call, so success never uses a relaxed guard.
 const mutate=async(table,sql,args)=>{
  const relation=table==='products'?'public.products':table==='handoff'?'maintenance_private.household_handoff_plans':table==='native'?'maintenance_private.account_deletion_requests':table==='epoch'?'maintenance_private.app_epochs':null;assert.ok(relation);
  const modes=(await admin.query('select tgname,tgenabled from pg_trigger where tgrelid=$1::regclass and not tgisinternal',[relation])).rows;
  await admin.query('begin');try{
   await admin.query('alter table '+relation+' disable trigger user');await admin.query(sql,args);
   for(const t of modes){assert.match(t.tgname,/^[a-z_0-9]+$/);await admin.query('alter table '+relation+' '+({O:'enable trigger',A:'enable always trigger',R:'enable replica trigger',D:'disable trigger'}[t.tgenabled])+' '+t.tgname);}
   await admin.query('commit');
  }catch(e){await admin.query('rollback');throw e;}
 };
 const drift=await makeScope(),driftPort=portFor(drift);
 await transaction(coordinator,tx=>driftPort.prepare(drift.scope,tx));
 const driftJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(v,tx)=>driftPort.cancelRequested(v,tx)});
 await mutate('products','update public.products set name=$2 where id=$1',[a.product,'External drift fixture']);
 await assert.rejects(driftJournal.cancel(drift.scope),/footprint\/writer changed/);
 assert.equal((await admin.query('select name from public.products where id=$1',[a.product])).rows[0].name,'External drift fixture','Refusal never overwrites changed data');
 await mutate('products','update public.products set name=$2 where id=$1',[a.product,'Provenance retained product']);
 // No erase-start flag or replacement generation is rewound, even if a
 // privileged writer injected it. Restoring the fixture is explicit test-only.
 await mutate('native','update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[drift.scope.apps[0].requestID]);
 await assert.rejects(driftJournal.cancel(drift.scope),/footprint\/writer changed/);
 assert.equal((await admin.query('select records_erased from maintenance_private.account_deletion_requests where id=$1',[drift.scope.apps[0].requestID])).rows[0].records_erased,true);
 await mutate('native','update maintenance_private.account_deletion_requests set records_erased=false where id=$1',[drift.scope.apps[0].requestID]);
 const replacementEpoch=randomUUID();
 await mutate('epoch','update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[a.user,replacementEpoch]);
 await assert.rejects(driftJournal.cancel(drift.scope),/footprint\/writer changed/);
 assert.equal((await admin.query('select epoch_id from maintenance_private.app_epochs where user_id=$1',[a.user])).rows[0].epoch_id,replacementEpoch);
 await mutate('epoch','update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[a.user,a.epoch]);
 // A transfer/processing-plan marker added after the snapshot is not erased.
 const planHome=randomUUID(),successor=randomUUID();await auth.createFixtureUser(successor,successor+'@fixture.invalid',randomBytes(30).toString('base64url'));
 await admin.query("insert into maintenance_private.household_handoff_plans(home_id,owner_id,successor_id,scope,plan,plan_digest,snapshot) values($1,$2,$3,$4,'{}',repeat('a',64),'{}')",[planHome,a.user,successor,drift.scope]);
 await assert.rejects(driftJournal.cancel(drift.scope),/footprint\/writer changed/);
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.household_handoff_plans where home_id=$1',[planHome])).rows[0].n,1);
 await mutate('handoff','delete from maintenance_private.household_handoff_plans where home_id=$1',[planHome]);
 assert.equal(await driftJournal.cancel(drift.scope),true);assert.deepEqual(await snap(),originalSnapshot);
 // Unknown child storage is refused even when empty, not prefix-exempted.
 const unknown=await makeScope(),unknownPort=portFor(unknown);
 await admin.query('create table maintenance_private.provenance_unknown_fixture(request_id uuid references maintenance_private.account_deletion_requests(id) on delete cascade)');
 try{await assert.rejects(transaction(coordinator,tx=>unknownPort.prepare(unknown.scope,tx)),/No legacy preparation retrofit/);}finally{await admin.query('drop table maintenance_private.provenance_unknown_fixture');}
 assert.deepEqual(await snap(),originalSnapshot);
 assert.equal((await auth.request('/user',undefined,a.token)).id,a.user);
 await assert.rejects(coordinator.query('select * from maintenance_private.ouchi_requested_preparations'),/permission denied/);
 await assert.rejects(admin.query('update maintenance_private.ouchi_requested_preparations set before_state=\'{}\' where root_request=$1',[s.scope.requestID]),/Immutable/);
 const b=await actor();
 const specialScope=async who=>{
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:who.user,leaseToken:randomUUID(),inventoryDigest:'7'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:who.epoch}]};
  const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,who.user,fixed]);return {scope,nativeLease:randomUUID()};
 };
 const logout=await specialScope(b),logoutPort=portFor(logout);
 await transaction(coordinator,tx=>logoutPort.prepare(logout.scope,tx));
 const logoutResponse=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+b.token},signal:AbortSignal.timeout(3000)});assert.ok([200,204].includes(logoutResponse.status));
 assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1',[b.user])).rows[0].n,0);
 const logoutJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(v,tx)=>logoutPort.cancelRequested(v,tx)});
 await assert.rejects(logoutJournal.cancel(logout.scope),/footprint\/writer changed/,'Real logout cannot be undone by app metadata restoration');
 assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[b.user])).rows[0].enabled,false);
 const c=await actor(),legacy=await specialScope(c);
 // Actual legacy canonical preparation, with no provenance save. It is NEVER
 // adopted into the new protocol, even though all the state looks familiar.
 await admin.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[legacy.scope.apps[0].requestID,c.user,c.epoch,legacy.nativeLease]);
 assert.equal((await admin.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) ok',[legacy.scope.apps[0].requestID,c.user,c.epoch,legacy.nativeLease])).rows[0].ok,true);
 await admin.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '2 minutes','requested')",[c.user,legacy.scope,legacy.nativeLease]);await admin.query('select maintenance_private.freeze_household_scope($1,$2)',[legacy.scope,legacy.nativeLease]);
 const legacyPort=portFor(legacy),legacyJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(v,tx)=>legacyPort.cancelRequested(v,tx)});
 await assert.rejects(transaction(coordinator,tx=>legacyPort.prepare(legacy.scope,tx)),/No legacy preparation retrofit/);
 await assert.rejects(legacyJournal.cancel(legacy.scope),/No original preparation provenance/);
 assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[c.user])).rows[0].enabled,false);
 assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[c.user])).rows[0].stopped,true);
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.ouchi_requested_preparations where root_request=$1',[legacy.scope.requestID])).rows[0].n,0);
 console.log('New requested provenance: actual canonical running/inventory/disabled-access preparation follows same-transaction saved preimage, actual owner AAL2 original retained, requested cancellation restores exact actor state; missing preimage/partial COMMIT/processing/writer drift/late failure refuse and roll back; lost reply/retry/new root separation and cancelled native-ID reuse guard pass. Changed product/erase flag/replacement epoch/transfer marker/unknown child storage/real logout and actual legacy canonical preparation refuse without overwriting or retrofitting. Owner-zero empty-file scope only; legacy/no-provenance, family/file transformations and hosted adoption remain separate.');
}
