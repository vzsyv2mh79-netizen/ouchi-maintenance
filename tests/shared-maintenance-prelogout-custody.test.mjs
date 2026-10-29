import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSharedMaintenancePrelogoutCustody,PRELOGOUT_FRAME_SQL,PRELOGOUT_CAPTURE_SQL} from '../lib/shared-maintenance-prelogout-custody.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

// Deliberately synthetic SQL port. Real LOGIN, canonical schema, family
// checkpoint, session custody and row locks are covered by the native test.
function fixture(){
 const native={requestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),leaseToken:randomUUID()};
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:native.userID,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:native.epochID}]};
 let captured=false,pid=21,digest='b'.repeat(64),live=true,lie=false;
 const calls=[];
 const raw={query:async(sql,args)=>{
  calls.push(sql);assert.deepEqual(args.slice(0,2),[JSON.stringify(scope),native.leaseToken]);
  if(sql===PRELOGOUT_FRAME_SQL)return {rows:[{backend_pid:pid,transaction_id:'30',session_digest:digest,captured}]};
  if(sql===PRELOGOUT_CAPTURE_SQL){if(!lie)captured=true;return {rows:[{captured:true}]};}
  throw Error('Unexpected SQL');
 }};
 const gates=async tx=>{assert.equal(typeof tx.beforeCommit,'function');assert.ok(calls.at(-1)===PRELOGOUT_FRAME_SQL);return live;};
 const api=createSharedMaintenancePrelogoutCustody({verifyCurrentGates:gates});
 const run=work=>runWithTransactionCommitChecks(raw,new AbortController().signal,work);
 return {api,scope,native,calls,gates,run,set live(v){live=v;},set pid(v){pid=v;},set digest(v){digest=v;},set lie(v){lie=v;}};
}
test('fixed capture, readbacks and COMMIT use only root-first SQL; repeated capture registers once',async()=>{
 const f=fixture();await f.run(async tx=>{
  assert.equal(await f.api.capture(tx,f.scope,f.native),true);
  assert.equal(await f.api.capture(tx,f.scope,f.native),true);
  tx.beforeCommit('hook-free-verify',()=>f.api.verify(tx,f.scope,f.native));
 });
 assert.equal(f.calls[0],PRELOGOUT_FRAME_SQL);
 assert.equal(f.calls.filter(s=>s===PRELOGOUT_CAPTURE_SQL).length,1);
 assert.ok(f.calls.every(s=>[PRELOGOUT_FRAME_SQL,PRELOGOUT_CAPTURE_SQL].includes(s)));
});
test('late current authority, connection or exact session-set drift refuses owning COMMIT',async()=>{
 for(const change of [f=>{f.live=false;},f=>{f.pid=22;},f=>{f.digest='c'.repeat(64);}]){
  const f=fixture();await assert.rejects(f.run(async tx=>{await f.api.capture(tx,f.scope,f.native);change(f);}),/Current transaction verification/);
 }
});
test('lying capture acknowledgment cannot replace persisted exact snapshot',async()=>{
 const f=fixture();f.lie=true;await assert.rejects(f.run(tx=>f.api.capture(tx,f.scope,f.native)),/Unknown prelogout frame/);
});
test('caught scope/provider replacement stays poisoned until owning rollback',async()=>{
 for(const replacement of ['scope','provider']){
  const f=fixture();await assert.rejects(f.run(async tx=>{
   await f.api.capture(tx,f.scope,f.native);
   const other=createSharedMaintenancePrelogoutCustody({verifyCurrentGates:async()=>true});
   await assert.rejects(replacement==='scope'?f.api.capture(tx,{...f.scope,inventoryDigest:'d'.repeat(64)},f.native):other.capture(tx,f.scope,f.native),/replacement/);
  }),/Current transaction verification/);
 }
});
test('query-only context, wrong native mapping and cross-transaction verification cannot authorize',async()=>{
 const f=fixture();await assert.rejects(f.api.capture({query:async()=>{throw Error('Must not query');},signal:new AbortController().signal},f.scope,f.native),/Checked owning/);
 await assert.rejects(f.run(tx=>f.api.capture(tx,f.scope,{...f.native,requestID:randomUUID()})),/mapping/);
 await f.run(tx=>f.api.capture(tx,f.scope,f.native));
 assert.equal(await f.run(tx=>f.api.verify(tx,f.scope,f.native)),false);
});
test('cancellation after capture cannot confirm COMMIT',async()=>{
 const f=fixture(),controller=new AbortController();
 await assert.rejects(f.run(async tx=>{
  const cancelled={...tx,signal:controller.signal};await f.api.capture(cancelled,f.scope,f.native);controller.abort(Error('fixture cancel'));
 }),/Current transaction verification/);
});
