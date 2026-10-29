import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createOuchiFamilyNativePreparation} from '../../../lib/ouchi-family-native-preparation.mjs';
import {createDeletionJournal} from '../kakei-completion/lib/shared-deletion-journal.mjs';
import {fixtureTOTP} from '../scoped-native-gotrue.mjs';
export async function verifyFamilyNativePreparation({admin,coordinator,auth,transaction}){
 await admin.query(readFileSync('tests/fixtures/family-native-preparation-20261021/protocol.sql','utf8'));
 async function actor(){const user=randomUUID(),epoch=randomUUID(),email=user+'@fixture.invalid',password=randomBytes(30).toString('base64url');await auth.createFixtureUser(user,email,password);const login=await auth.request('/token?grant_type=password',{email,password});const f=await auth.request('/factors',{factor_type:'totp',friendly_name:'Family native fixture'},login.access_token);const c=await auth.request('/factors/'+f.id+'/challenge',{},login.access_token);const promoted=await auth.request('/factors/'+f.id+'/verify',{challenge_id:c.id,code:fixtureTOTP(f.totp.secret)},login.access_token);const sid=JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).session_id;
 await admin.query('insert into maintenance_private.account_access values($1,true)',[user]);await admin.query('insert into maintenance_private.app_epochs values($1,$2,true)',[user,epoch]);await admin.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[sid,user,epoch]);return {user,epoch,token:promoted.access_token};}
 const owner=await actor(),receiver=await actor(),home=randomUUID(),product=randomUUID();
 await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner.user]);await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,receiver.user,'Family native receiver']);await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Family before-claim retained']);
 await admin.query((await admin.query("select format('create policy family_native_%s on private.kb_shared_deletion_journal for all to shared_retirement_backend using(user_id=%L::uuid) with check(user_id=%L::uuid)',replace($1::text,'-',''),$1::text,$1::text) sql",[owner.user])).rows[0].sql);
 const before=(await admin.query('select maintenance_private.requested_actor_observation($1,$2) value',[owner.user,owner.epoch])).rows[0].value;
 const oldOriginals=(await admin.query('select * from maintenance_private.ouchi_owner_originals order by request_id')).rows;
 const oldPlans=(await admin.query('select * from maintenance_private.household_handoff_plans order by home_id')).rows;
 const make=async()=>{const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner.user,leaseToken:randomUUID(),inventoryDigest:'6'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:owner.epoch}]};const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,owner.user,fixed]);return {scope,generationID:randomUUID(),nativeLease:randomUUID(),homes:[{homeID:home,successorID:receiver.user}]};};
 let covered=true;const port=x=>createOuchiFamilyNativePreparation({...x,verifyNoDispatch:async(s,tx,signal)=>{signal.throwIfAborted();return covered&&JSON.stringify(s)===JSON.stringify(x.scope);}});
 const first=await make(),p=port(first);
 // A synthetic shared-file metadata row is NOT an empty-file preparation.
 // Preserve actual FK/checks and restore trigger modes before calling the port.
 const modes=(await admin.query("select tgname,tgenabled from pg_trigger where tgrelid='maintenance_private.household_attachments'::regclass and not tgisinternal")).rows;
 const sharedFile=randomUUID();
 const syntheticFile=async work=>{await admin.query('begin');try{await admin.query('alter table maintenance_private.household_attachments disable trigger user');await work();for(const t of modes){assert.match(t.tgname,/^[a-z0-9_]+$/);await admin.query('alter table maintenance_private.household_attachments '+({O:'enable trigger',A:'enable always trigger',R:'enable replica trigger',D:'disable trigger'}[t.tgenabled])+' '+t.tgname);}await admin.query('commit');}catch(e){await admin.query('rollback');throw e;}};
 await admin.query('insert into maintenance_private.closure_home_instances(home_id) values($1) on conflict do nothing',[home]);
 await syntheticFile(()=>admin.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256) select $1,$2,instance_id,$3,1,'application/pdf',repeat('a',64) from maintenance_private.closure_home_instances where home_id=$2",[sharedFile,home,product]));
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.household_attachments where id=$1',[sharedFile])).rows[0].n,1);
 await assert.rejects(transaction(coordinator,tx=>p.prepare(first.scope,tx)),/Actual unchanged empty-file family preimage/);
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.family_native_preparations where generation_id=$1',[first.generationID])).rows[0].n,0);
 await syntheticFile(()=>admin.query('delete from maintenance_private.household_attachments where id=$1',[sharedFile]));
 await assert.rejects(transaction(coordinator,async tx=>{await p.prepare(first.scope,tx);covered=false;}),/Current transaction verification/);covered=true;
 assert.deepEqual((await admin.query('select maintenance_private.requested_actor_observation($1,$2) value',[owner.user,owner.epoch])).rows[0].value,before);
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.family_preparation_generations where generation_id=$1',[first.generationID])).rows[0].n,0);
 assert.equal(await transaction(coordinator,tx=>p.prepare(first.scope,tx)),true);assert.equal(await transaction(coordinator,tx=>p.prepare(first.scope,tx)),true,'Lost preparation response retries immutable generation');
 const job=(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[first.scope.apps[0].requestID])).rows[0];assert.equal(job.state,'running');assert.equal(job.inventory_captured,false);assert.equal(job.records_erased,false);
 assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[owner.user])).rows[0].enabled,false);assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner.user])).rows[0].stopped,true);
 await assert.rejects(admin.query('update public.products set name=$2 where id=$1',[product,'Must not write while prepared']),/stop|fenc|closed/i);
 const outsider=randomUUID();await auth.createFixtureUser(outsider,outsider+'@fixture.invalid',randomBytes(30).toString('base64url'));
 await assert.rejects(admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,outsider,'Must not join while prepared']),/closed|stop|pending/i);
 await assert.rejects(coordinator.query('update maintenance_private.account_access set enabled=true where user_id=$1',[owner.user]),/permission denied/);
 await assert.rejects(admin.query('update maintenance_private.family_native_preparations set before_owner=\'{}\' where generation_id=$1',[first.generationID]),/Immutable family native preimage/);
 const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(s,tx)=>p.cancelRequested(s,tx)});
 const changedReceiverEpoch=randomUUID();await admin.query('update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[receiver.user,changedReceiverEpoch]);
 await assert.rejects(journal.cancel(first.scope),/Changed\/dispatched\/unknown/);
 assert.equal((await admin.query('select epoch_id from maintenance_private.app_epochs where user_id=$1',[receiver.user])).rows[0].epoch_id,changedReceiverEpoch);
 await admin.query('update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[receiver.user,receiver.epoch]);
 await assert.rejects(transaction(coordinator,async tx=>{await tx.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '1 minute' where request_id=$1",[first.scope.requestID,first.scope.leaseToken]);await p.cancelRequested(first.scope,tx);}),/Exact requested\/cancelled/);
 await assert.rejects(transaction(coordinator,async tx=>{await tx.query("update private.kb_shared_deletion_journal set status='cancelled' where request_id=$1",[first.scope.requestID]);await p.cancelRequested(first.scope,tx);covered=false;}),/Current transaction verification/);covered=true;
 assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner.user])).rows[0].stopped,true,'Late cancel rolls restoration back');
 await admin.query('alter table maintenance_private.account_deletion_requests disable trigger cancelled_family_native_identity');try{await assert.rejects(journal.cancel(first.scope),/Changed\/dispatched\/unknown/);}finally{await admin.query('alter table maintenance_private.account_deletion_requests enable always trigger cancelled_family_native_identity');}
 assert.equal(await journal.cancel(first.scope),true);
 assert.deepEqual((await admin.query('select maintenance_private.requested_actor_observation($1,$2) value',[owner.user,owner.epoch])).rows[0].value,before,'Family actual native/stop/enrollment preparation delta restores exactly');
 await assert.rejects(admin.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[first.scope.apps[0].requestID,owner.user,owner.epoch]),/Cancelled family native identity/);
 const next=await make(),q=port(next);assert.equal(await transaction(coordinator,tx=>q.prepare(next.scope,tx)),true);assert.equal(await transaction(coordinator,tx=>p.cancelRequested(first.scope,tx)),true);
 assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner.user])).rows[0].stopped,true,'Old cancel cannot reopen later native preparation');
 await admin.query("insert into maintenance_private.family_preparation_dispatches values($1,'transfer','unknown')",[next.generationID]);const nextJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(s,tx)=>q.cancelRequested(s,tx)});await assert.rejects(nextJournal.cancel(next.scope),/Changed\/dispatched\/unknown/);
 assert.equal((await admin.query('select state from maintenance_private.account_deletion_requests where id=$1',[next.scope.apps[0].requestID])).rows[0].state,'running');
 assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals order by request_id')).rows,oldOriginals);assert.deepEqual((await admin.query('select * from maintenance_private.household_handoff_plans order by home_id')).rows,oldPlans);
 assert.equal((await admin.query('select name from public.products where id=$1',[product])).rows[0].name,'Family before-claim retained');
 await assert.rejects(coordinator.query('select * from maintenance_private.family_native_preparations'),/permission denied/);
 console.log('Family before-claim native preparation: actual complete enrolled/TOTP family roster -> immutable preimage -> running native with canonical captured=false -> real freeze/disabled enrollment; ordinary family write refused. Exact cancellation restores native/route/binding/fence/flags, late failure rolls back, processing/writer drift/unknown transfer refuse; old cancel/new-root and cancelled native-ID reuse guarded. Canonical capture/old originals/plans unchanged. NO new family AAL2 original issuance/claim/handoff/file/paired final-COMMIT or hosted role/retention adoption.');
}
