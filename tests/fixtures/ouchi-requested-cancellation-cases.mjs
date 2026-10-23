import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createOuchiRequestedCancellation} from '../../lib/ouchi-requested-cancellation.mjs';
import {createDeletionJournal} from './kakei-completion/lib/shared-deletion-journal.mjs';

export async function verifyRequestedCancellation({admin,coordinator,auth,transaction}){
 // Actual canonical review sources, no stand-in empty metadata table.
 for(const [table,file] of [
  ['maintenance_private.scoped_consent_bindings','tests/fixtures/bound-scoped-shared-consent.sql'],
  ['maintenance_private.post_native_family_releases','tests/fixtures/post-native-seal-consent.sql']
 ])if((await admin.query('select to_regclass($1) relation',[table])).rows[0].relation===null)await admin.query(readFileSync(file,'utf8'));
 await admin.query(readFileSync('tests/fixtures/ouchi-requested-cancellation-state.sql','utf8'));
 await admin.query('grant execute on function maintenance_private.ouchi_requested_cancellation_state(uuid,jsonb) to shared_retirement_backend');
 const actor=randomUUID(),epoch=randomUUID(),password=randomBytes(30).toString('base64url'),email=actor+'@fixture.invalid';
 await auth.createFixtureUser(actor,email,password);const session=await auth.request('/token?grant_type=password',{email,password});
 const sessionID=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).session_id;
 // Explicit test enrollment, not production signup/claim/coverage approval.
 await admin.query('insert into maintenance_private.account_access(user_id,enabled) values($1,true)',[actor]);
 await admin.query('insert into maintenance_private.app_epochs(user_id,epoch_id,enabled) values($1,$2,true)',[actor,epoch]);
 await admin.query('insert into maintenance_private.app_session_epochs(session_id,user_id,epoch_id) values($1,$2,$3)',[sessionID,actor,epoch]);
 const home=randomUUID();await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[home,actor]);
 const product=randomUUID();await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,\'air\',\'Unprepared cancellation retained product\')',[product,home]);
 const before={homes:(await admin.query('select * from public.homes order by id')).rows,products:(await admin.query('select * from public.products order by id')).rows,originals:(await admin.query('select * from maintenance_private.ouchi_owner_originals order by request_id')).rows,manifest:(await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody order by request_id')).rows};
 const makeScope=()=>({protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:actor,leaseToken:randomUUID(),inventoryDigest:'8'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:epoch}]});
 const s=makeScope();const fixed=x=>{const v={...x};delete v.leaseToken;return v;};
 await admin.query((await admin.query("select format('create policy cancellation_actor_fixture on private.kb_shared_deletion_journal for all to shared_retirement_backend using(user_id=%L::uuid) with check(user_id=%L::uuid)', $1::text,$1::text) sql",[actor])).rows[0].sql);
 const root=async value=>{await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[value.requestID,actor,fixed(value)]);};await root(s);
 let coverage=true,lateRefusal=false;
 const port=createOuchiRequestedCancellation({signal:AbortSignal.timeout(30000),verifyCoverage:async(value,tx,signal)=>{signal.throwIfAborted();return coverage&&value.userID===actor&&(await tx.query('select user_id from private.kb_shared_deletion_journal where request_id=$1',[value.requestID])).rows[0]?.user_id===actor;}});
 const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':async(value,tx)=>{
  if(!await port.cancelRequested(value,tx)||!await port.verifyCancelled(value,tx))throw Error('Actual Ouchi requested cancellation refused');
  if(lateRefusal)coverage=false;return true;
 }});
 await assert.rejects(transaction(coordinator,async tx=>{assert.equal(await port.cancelRequested(s,tx),false);}),/Current transaction verification/,'Requested root is not already-cancelled evidence');
 coverage=false;await assert.rejects(journal.cancel(s),/cancellation refused/);coverage=true;
 assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[s.requestID])).rows[0].status,'requested');
 // Native pending is a real native request, NOT an automatically reversible
 // stand-in stop. The current canonical state machine has no cancelled state.
 await admin.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[s.apps[0].requestID,actor,epoch]);
 await assert.rejects(journal.cancel(s),/cancellation refused/);
 assert.equal((await admin.query('select state from maintenance_private.account_deletion_requests where id=$1',[s.apps[0].requestID])).rows[0].state,'pending');
 await admin.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '1 minute' where id=$1",[s.apps[0].requestID,randomUUID()]);
 await assert.rejects(journal.cancel(s),/cancellation refused/);
 assert.equal((await admin.query('select state from maintenance_private.account_deletion_requests where id=$1',[s.apps[0].requestID])).rows[0].state,'running');
 await admin.query('delete from maintenance_private.account_deletion_requests where id=$1',[s.apps[0].requestID]); // Synthetic guard-only test fixture; no worker/capture ever ran.
 await admin.query('update maintenance_private.household_principal_fences set stopped=true where user_id=$1',[actor]);
 await assert.rejects(journal.cancel(s),/cancellation refused/);
 assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[actor])).rows[0].stopped,true,'Port never guesses how to unfreeze');
 await admin.query('update maintenance_private.household_principal_fences set stopped=false where user_id=$1',[actor]);
 await admin.query('alter table maintenance_private.shared_native_cleanup_scopes rename to cancellation_hidden_cleanup_scope');
 try{await assert.rejects(journal.cancel(s),/cancellation refused/);}finally{await admin.query('alter table maintenance_private.cancellation_hidden_cleanup_scope rename to shared_native_cleanup_scopes');}
 lateRefusal=true;await assert.rejects(journal.cancel(s),/Current transaction verification/);coverage=true;lateRefusal=false;
 assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[s.requestID])).rows[0].status,'requested','Late coverage refusal rolls root cancellation back');
 assert.equal(await journal.cancel(s),true);assert.equal(await journal.cancel(s),false,'Repeated cancelled journal does not execute/release again');
 assert.equal(await transaction(coordinator,tx=>port.verifyCancelled(s,tx)),true);
 const next=makeScope();await root(next);
 assert.equal(await transaction(coordinator,tx=>port.verifyCancelled(s,tx)),true,'Old pristine cancellation does not mutate new requested root');
 assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[next.requestID])).rows[0].status,'requested');
 await admin.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[next.apps[0].requestID,actor,epoch]);
 await assert.rejects(transaction(coordinator,async tx=>{assert.equal(await port.verifyCancelled(s,tx),false);}),/Current transaction verification/,'New actual native preparation is never reopened by old cancellation');
 await assert.rejects(journal.cancel(next),/cancellation refused/);
 assert.equal((await admin.query('select state from maintenance_private.account_deletion_requests where id=$1',[next.apps[0].requestID])).rows[0].state,'pending');
 assert.deepEqual((await admin.query('select * from public.homes order by id')).rows,before.homes);
 assert.deepEqual((await admin.query('select * from public.products order by id')).rows,before.products);
 assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals order by request_id')).rows,before.originals);
 assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody order by request_id')).rows,before.manifest);
 assert.equal((await auth.request('/user',undefined,session.access_token)).id,actor);
 console.log('Requested cancellation guard: actual cancelled root + live Auth/enrollment + no native/preparation accepted; pending/running native request, stopped tombstone, missing schema and late coverage refuse without unfreeze/deletion. Old cancel/new root reservation safe, actual next native prep refuses reversal. All homes/products/real originals/manifests/Auth preserved. Current prepared owner intake cancellation remains unsupported; no restoration provenance invented.');
}
