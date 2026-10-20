import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createOuchiAuthRecreationExclusion} from '../../lib/ouchi-auth-recreation-exclusion.mjs';

// Local real PG/Auth proof only. Earlier other-app erasure, Storage inventory,
// retention and all privileged Auth/DDL coverage remain explicit fixtures.
export async function verifyOwnerTerminal({admin,coordinator,auth,scope,socket,transaction,postOptions,terminalModule,createAfterAuth,stages,journal,original,manifest,nativeSeal,nativeID}){
 await admin.query(readFileSync('tests/fixtures/ouchi-owner-terminal-consent.sql','utf8'));
 await admin.query('grant execute on function maintenance_private.read_ouchi_owner_terminal_original(uuid,uuid,jsonb,uuid),maintenance_private.close_ouchi_owner_terminal(uuid,uuid,jsonb,uuid),maintenance_private.verify_ouchi_owner_terminal_root(uuid,uuid,jsonb) to shared_retirement_backend');
 const exclusion=createOuchiAuthRecreationExclusion({target:{kind:'isolated-fixture',socket},verifyRemainingPaths:(tx,s,signal)=>postOptions.verifyReadAuthority(tx,s,signal)});
 const signal=()=>AbortSignal.timeout(15000);
 const terminal=async(held,tx)=>{
  const binding=await held.bindTerminal(tx,scope,tx.signal);assert.ok(binding);
  const opts={...postOptions,verifyAuthRecreationFence:binding.verify};
  return {binding,reader:terminalModule.createOuchiOwnerTerminalConsent(opts),closure:terminalModule.createOuchiOwnerTerminalClosure(opts)};
 };
 await exclusion.withScope(scope,signal(),async held=>{
  // Existing processing readers retain their contract. Complete missing last
  // independent post-Auth stage proofs through their original processing bind.
  for(const stage of ['verify-family-after-auth','verify-sessions-after-auth'])stages[stage]=async(s,tx)=>{
   const b=await held.bind(tx,s,tx.signal);assert.ok(b);
   return !!await createAfterAuth({...postOptions,verifyAuthRecreationFence:b.verify}).readSnapshot(tx);
  };
  await journal.perform(scope,'verify-family-after-auth');await journal.perform(scope,'verify-sessions-after-auth');
  const full=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts;
  assert.equal(Object.keys(full).length,14,'Actual two-app scope must have all fourteen pre-complete receipts');
  // A close cannot commit by itself. The deferred check also applies if a
  // caller catches its reader error; ordinary positive history grants nothing.
  await assert.rejects(transaction(coordinator,async tx=>{const {closure}=await terminal(held,tx);assert.equal(await closure.close(tx),true);}),/Current transaction/);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.ouchi_owner_terminal_closures')).rows[0].n,0);
  assert.equal((await admin.query('select state from maintenance_private.household_stop_bindings where user_id=$1',[scope.userID])).rows[0].state,'processing');
  await assert.rejects(transaction(coordinator,tx=>tx.query(terminalModule.OUCHI_OWNER_TERMINAL_CLOSE_SQL,[scope.requestID,scope.leaseToken,JSON.stringify(scope),postOptions.completionLease])),/same-transaction owner-zero global COMPLETE/,'Actual deferred constraint refuses raw metadata close COMMIT without COMPLETE, even without JS hook');
 });
 // Fresh holder after the refused scope; no old failed binding is reused.
 let lateCoverage=true;
 const checkedExclusion=createOuchiAuthRecreationExclusion({target:{kind:'isolated-fixture',socket},verifyRemainingPaths:async(tx,s,signal)=>lateCoverage&&await postOptions.verifyReadAuthority(tx,s,signal)});
 await assert.rejects(checkedExclusion.withScope(scope,signal(),async held=>transaction(coordinator,async tx=>{
  const {closure}=await terminal(held,tx);assert.equal(await closure.close(tx),true);
  const fixed={...scope};delete fixed.leaseToken;
  await tx.query("update private.kb_shared_deletion_journal set status='complete',lease_token=null,lease_until=null,receipts=receipts||$2::jsonb where request_id=$1",[scope.requestID,{complete:{...fixed,durable:true,stage:'complete'}}]);
  lateCoverage=false;
 })),/Current transaction|Auth exclusion/);lateCoverage=true;
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.ouchi_owner_terminal_closures')).rows[0].n,0,'Late current coverage loss rolls closure, binding close and root COMPLETE back together');
 await exclusion.withScope(scope,signal(),async held=>{
  // Root adapter's complete handler owns the metadata close. Journal stamps
  // exact COMPLETE and clears lease on this SAME physical transaction.
  stages.complete=async(s,tx)=>{assert.deepEqual(s,scope);const {closure}=await terminal(held,tx);return closure.close(tx);};
  stages['after-complete']=async(s,tx)=>{
   const {reader}=await terminal(held,tx);const historical=await reader.readSnapshot(tx);assert.ok(historical);
   assert.deepEqual(historical.payload,original.payload);assert.equal(historical.signature,original.signature);return true;
  };
  const receipt=await journal.perform(scope,'complete');assert.equal(receipt.stage,'complete');
  assert.equal((await admin.query('select (select count(*)::int from jsonb_object_keys(receipts)) as n from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].n,15);
 });
 await assert.rejects(exclusion.withScope(scope,signal(),held=>transaction(coordinator,async tx=>{
  assert.equal(await held.bind(tx,scope,tx.signal),null,'Old processing bind still refuses completed root');
 })),/Auth exclusion/);
 // A failed processing bind poisons only that holder scope; exact committed
 // terminal evidence remains. Use a NEW separate terminal binding for reads.
 await exclusion.withScope(scope,signal(),async held=>transaction(coordinator,async tx=>{
  const {reader,closure}=await terminal(held,tx);const r=await reader.read(tx);assert.ok(r);assert.deepEqual(r.payload,original.payload);
  assert.equal(await closure.close(tx),true,'Exact completed closure replay is read-only');
 }));
 // Actual transport fault AFTER final completed-root verification: old
 // processing lease is already gone; only bindTerminal and same xact key apply.
 await assert.rejects(exclusion.withScope(scope,signal(),held=>transaction(coordinator,async tx=>{
  const {binding,reader}=await terminal(held,tx);assert.ok(await reader.read(tx));
  await tx.query('insert into private.owner_history_marker values(13)');
  tx.beforeCommit('terminal:last-check-transport-loss',async()=>{
   assert.equal(await binding.verify(tx,scope,tx.signal),true);
   const p=(await admin.query("select pid from pg_stat_activity where usename='ouchi_auth_exclusion_backend' and application_name like 'OuchiAuthExclusion/%'")).rows;assert.equal(p.length,1);
   assert.equal((await admin.query('select pg_terminate_backend($1) stopped',[p[0].pid])).rows[0].stopped,true);
   assert.equal((await auth.attemptFixtureUserCreate(scope.userID,scope.userID+'@fixture.invalid','synthetic-password-never-real')).status,500,'Terminal owning shared xact key survives last-check holder death');
   return true;
  });
 })),/Auth exclusion|connection|terminated/i);
 assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker where id=13')).rows[0].n,1);
 await admin.query('delete from private.owner_history_marker where id=13');
 // Separate finite result authorization is a TEST provider, not a claimed
 // production credential/Keychain connection. It is rechecked at COMMIT.
 let credentialLive=true;
 await exclusion.withScope(scope,signal(),held=>transaction(coordinator,async tx=>{
  const {binding}=await terminal(held,tx);
  const result=terminalModule.createOuchiOwnerTerminalResultReader({...postOptions,verifyAuthRecreationFence:binding.verify,authorizeResult:async(t,s,check)=>credentialLive&&t===tx&&check===tx.signal&&JSON.stringify(s)===JSON.stringify(scope)});
  assert.deepEqual(await result(tx),{state:'complete',notification:'unconfirmed',retention:'unconfirmed'});
 }));
 await assert.rejects(exclusion.withScope(scope,signal(),held=>transaction(coordinator,async tx=>{
  const {binding}=await terminal(held,tx);
  const result=terminalModule.createOuchiOwnerTerminalResultReader({...postOptions,verifyAuthRecreationFence:binding.verify,authorizeResult:async()=>credentialLive});
  assert.equal((await result(tx)).state,'complete');await tx.query('insert into private.owner_history_marker values(14)');credentialLive=false;
 })),/Current transaction/);credentialLive=true;
 assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker where id=14')).rows[0].n,0,'Result credential expiry/revocation cannot be caught and committed');
 const correctReceipts=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts;
 // Deliberate corruption fixtures bypass ONLY the existing immutable journal receipt and its deferred
 // checkpoint constraint triggers for the synthetic update, then restore it BEFORE reading.
 const setReceipts=async value=>{
  await admin.query('alter table private.kb_shared_deletion_journal disable trigger immutable_shared_family_stage_receipt;alter table private.kb_shared_deletion_journal disable trigger shared_family_stage_receipt_commit');
  try{await admin.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[scope.requestID,value]);}
  finally{await admin.query('alter table private.kb_shared_deletion_journal enable trigger immutable_shared_family_stage_receipt;alter table private.kb_shared_deletion_journal enable trigger shared_family_stage_receipt_commit');}
 };
 const noAuthority=terminalModule.createOuchiOwnerTerminalConsent({...postOptions,verifyAuthRecreationFence:async()=>{throw Error('SQL must reject bad terminal facts before runtime authority');}});
 for(const stage of Object.keys(correctReceipts)){
  const changed={...correctReceipts};delete changed[stage];
  await setReceipts(changed);
  assert.equal(await transaction(coordinator,tx=>noAuthority.readSnapshot(tx)),null,'Every typed terminal stage is mandatory: '+stage);
 }
 for(const changed of [{...correctReceipts,extra:{durable:true}}, {...correctReceipts,'handoff-family':{...correctReceipts['handoff-family'],familyCoverageDigest:'0'.repeat(64)}}]){
  await setReceipts(changed);
  assert.equal(await transaction(coordinator,tx=>noAuthority.readSnapshot(tx)),null,'Extra/mismatched empty-family checkpoint refuses');
 }
 await setReceipts(correctReceipts);
 await admin.query('update maintenance_private.household_principal_fences set stopped=false where user_id=$1',[scope.userID]);
 assert.equal(await transaction(coordinator,tx=>noAuthority.readSnapshot(tx)),null,'Closed-user tombstone cannot be cleared');
 await admin.query('update maintenance_private.household_principal_fences set stopped=true where user_id=$1',[scope.userID]);
 await admin.query('alter table maintenance_private.ouchi_owner_terminal_closures disable trigger immutable_owner_terminal_closure');
 assert.equal(await transaction(coordinator,tx=>noAuthority.readSnapshot(tx)),null,'Disabled closure immutability refuses');
 await admin.query('alter table maintenance_private.ouchi_owner_terminal_closures enable always trigger immutable_owner_terminal_closure');
 const root=(await admin.query('select * from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0];
 assert.equal(root.status,'complete');assert.equal(root.lease_token,null);assert.equal(root.lease_until,null);
 assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[scope.userID])).rows[0].stopped,true,'Closed-user tombstone is retained; old JWT writers are not reopened');
 assert.equal((await admin.query('select state from maintenance_private.household_stop_bindings where user_id=$1',[scope.userID])).rows[0].state,'closed');
 await assert.rejects(coordinator.query('select * from maintenance_private.ouchi_owner_terminal_closures'),/permission denied/);
 await assert.rejects(admin.query('update maintenance_private.ouchi_owner_terminal_closures set root_lease=$1 where request_id=$2',[randomUUID(),scope.requestID]),/Immutable/);
 assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original);
 assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows,manifest);
 assert.deepEqual((await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0],nativeSeal);
 console.log('Owner-zero terminal: actual 14 -> 15 receipts, metadata-only closed binding plus retained stopped tombstone, same-transaction deferred COMPLETE, late-coverage rollback, fresh terminal read/replay, terminal last-check holder death still excludes recreation through COMMIT, independent result-credential loss rolls back; original HMAC/session manifest/native seal/expiry unchanged. No family release bypass, real notification/retention/result-token delivery or production adoption.');
}
