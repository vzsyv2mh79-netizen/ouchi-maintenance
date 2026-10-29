import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

// Fixture-only bridge to actual READ ONLY PostgreSQL, not credential issuance
// or a shipping HTTP route. No execution/terminal binding is used for projection.
export async function verifyOwnerReadonlyProjection({admin,coordinator,scope,postOptions,module,nativeID}){
 await admin.query(readFileSync('tests/fixtures/ouchi-owner-readonly-terminal-projection.sql','utf8'));
 await admin.query('grant execute on function maintenance_private.read_ouchi_owner_terminal_projection(uuid,uuid,jsonb,uuid) to shared_retirement_backend');
 const reader=module.createOuchiOwnerReadonlyTerminalProjection(postOptions);
 const ro=async(work)=>{
  await coordinator.query('begin read only');
  try{
   const value=await work(Object.freeze({signal:AbortSignal.timeout(5000),query:(...args)=>coordinator.query(...args)}));
   await coordinator.query('commit');return value;
  }catch(error){await coordinator.query('rollback');throw error;}
 };
 const snapshot=async()=>({
  original:(await admin.query('select * from maintenance_private.ouchi_owner_originals where request_id=$1',[scope.requestID])).rows,
  native:(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows,
  manifest:(await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows,
  closure:(await admin.query('select * from maintenance_private.ouchi_owner_terminal_closures where request_id=$1',[scope.requestID])).rows,
 });
 const before=await snapshot();
 await ro(async tx=>{
  assert.equal((await tx.query('select pg_current_xact_id_if_assigned()::text as xid')).rows[0].xid,null);
  assert.deepEqual(await reader.read(tx),{state:'complete',notification:'unconfirmed',retention:'unconfirmed'});
  assert.equal((await tx.query('select pg_current_xact_id_if_assigned()::text as xid')).rows[0].xid,null,'Projection allocates no transaction ID');
  assert.equal((await tx.query("select count(*)::int n from pg_locks where pid=pg_backend_pid() and (locktype in('advisory','tuple') or (locktype='relation' and mode<>'AccessShareLock'))")).rows[0].n,0,'No advisory, tuple or mutation relation lock');
 });
 assert.deepEqual(await snapshot(),before,'Read-only projection never changes originals, native expiry, session manifest or closure');
 assert.equal((await coordinator.query(module.OUCHI_OWNER_READONLY_TERMINAL_SQL,[scope.requestID,scope.leaseToken,JSON.stringify(scope),postOptions.completionLease])).rows.length,0,'READ WRITE transaction is not accepted as read-only projection');
 await assert.rejects(ro(tx=>tx.query('insert into private.owner_history_marker values(16)')),e=>e.code==='25006','Actual server READ ONLY rejects mutation');
 await assert.rejects(ro(tx=>tx.query('select * from maintenance_private.read_ouchi_owner_terminal_original($1,$2,$3,$4)',[scope.requestID,scope.leaseToken,JSON.stringify(scope),postOptions.completionLease])),e=>e.code==='25006','Old locking terminal reader stays unchanged and cannot run on read-only transport');
 for(const override of [{scope:{...scope,requestID:randomUUID()}},{scope:{...scope,leaseToken:randomUUID()}},{completionLease:randomUUID()}]){
  assert.deepEqual(await ro(tx=>module.createOuchiOwnerReadonlyTerminalProjection({...postOptions,...override}).read(tx)),{state:'unconfirmed'});
 }
 const receipts=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts;
 const setReceipts=async value=>{
  // Corruption injection only; restore both original guards BEFORE observation.
  await admin.query('alter table private.kb_shared_deletion_journal disable trigger immutable_shared_family_stage_receipt;alter table private.kb_shared_deletion_journal disable trigger shared_family_stage_receipt_commit');
  try{await admin.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[scope.requestID,value]);}
  finally{await admin.query('alter table private.kb_shared_deletion_journal enable trigger immutable_shared_family_stage_receipt;alter table private.kb_shared_deletion_journal enable trigger shared_family_stage_receipt_commit');}
 };
 try{
  for(const stage of Object.keys(receipts)){
   const changed={...receipts};delete changed[stage];await setReceipts(changed);
   assert.deepEqual(await ro(tx=>reader.read(tx)),{state:'unconfirmed'},'Projection requires exact terminal stage '+stage);
  }
  for(const changed of [{...receipts,extra:{durable:true}}, {...receipts,'handoff-family':{...receipts['handoff-family'],familyCoverageDigest:'0'.repeat(64)}}]){
   await setReceipts(changed);assert.deepEqual(await ro(tx=>reader.read(tx)),{state:'unconfirmed'});
  }
 }finally{await setReceipts(receipts);}
 await admin.query('update maintenance_private.household_principal_fences set stopped=false where user_id=$1',[scope.userID]);
 try{assert.deepEqual(await ro(tx=>reader.read(tx)),{state:'unconfirmed'});}finally{await admin.query('update maintenance_private.household_principal_fences set stopped=true where user_id=$1',[scope.userID]);}
 await admin.query('alter table maintenance_private.ouchi_owner_terminal_closures disable trigger immutable_owner_terminal_closure');
 try{assert.deepEqual(await ro(tx=>reader.read(tx)),{state:'unconfirmed'});}finally{await admin.query('alter table maintenance_private.ouchi_owner_terminal_closures enable always trigger immutable_owner_terminal_closure');}
 assert.deepEqual(await ro(tx=>reader.read(tx)),{state:'complete',notification:'unconfirmed',retention:'unconfirmed'});
 assert.deepEqual(await snapshot(),before);
 await assert.rejects(coordinator.query('select * from maintenance_private.ouchi_owner_originals'),/permission denied/);
 console.log('Owner-zero read-only projection: actual BEGIN READ ONLY succeeds; STABLE SELECT-only private fact RPC, no row/advisory locks or XID allocation, all15/extra/digest/wrong-scope/tombstone/guard refusals; original HMAC/custody/native expiry unchanged; old locking reader and writes still refused. Credential custody/HTTP authorization and delivery/retention remain independent.');
}
