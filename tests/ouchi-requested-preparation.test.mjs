import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOuchiRequestedPreparation,OUCHI_REQUESTED_PREPARE_SAVE_SQL as SAVE,OUCHI_REQUESTED_PREPARE_SQL as PREPARE,OUCHI_REQUESTED_PREPARATION_STATE_SQL as STATE,OUCHI_REQUESTED_PREPARATION_CANCEL_SQL as CANCEL} from '../lib/ouchi-requested-preparation.mjs';
function fixture(){
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'b'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]},nativeLease=randomUUID();
 const state={coverage:true,pid:19,xid:'23',saved:true,prepared:true,cancelled:true},hooks=new Map(),calls=[],controller=new AbortController();
 const options={scope,nativeLease,verifyCoverage:async()=>state.coverage};
 const tx={signal:controller.signal,beforeCommit:(k,fn)=>hooks.set(k,fn),query:async(sql,args)=>{
  assert.deepEqual(args.slice(0,3),[scope.requestID,JSON.stringify(scope),nativeLease]);calls.push(sql);
  if(sql===STATE)return {rows:[{ok:true,backend_pid:state.pid,transaction_id:state.xid}]};
  const key=sql===SAVE?'saved':sql===PREPARE?'prepared':sql===CANCEL?'cancelled':null;assert.ok(key);return {rows:[{[key]:state[key]}]};
 }};
 return {scope,options,state,tx,calls,hooks,controller,port:createOuchiRequestedPreparation(options),commit:async()=>{for(const fn of hooks.values())assert.equal(await fn(),true);}};
}
test('requires independent coverage and checked owning transaction; before-image precedes real prepare',async()=>{
 const f=fixture();assert.throws(()=>createOuchiRequestedPreparation({...f.options,verifyCoverage:undefined}),/coverage/);
 await assert.rejects(f.port.prepare(f.scope,{query:f.tx.query,signal:f.tx.signal}),/Checked/);
 assert.equal(await f.port.prepare(f.scope,f.tx),true);assert.deepEqual(f.calls.slice(0,2),[SAVE,PREPARE]);await f.commit();
});
test('missing snapshot cannot call prepare and caught failure poisons COMMIT',async()=>{
 const f=fixture();f.state.saved=false;await assert.rejects(f.port.prepare(f.scope,f.tx),/Original preparation/);
 assert.deepEqual(f.calls,[SAVE]);await assert.rejects(f.commit());
});
test('late coverage and physical transaction drift refuse owning COMMIT',async()=>{
 for(const kind of ['coverage','pid','xid']){
  const f=fixture();await f.port.prepare(f.scope,f.tx);
  if(kind==='coverage')f.state.coverage=false;else if(kind==='pid')f.state.pid++;else f.state.xid='24';
  await assert.rejects(f.commit());
 }
});
test('cancel never invents or saves a before-image; historical verify is read-only',async()=>{
 const f=fixture();assert.equal(await f.port.cancelRequested(f.scope,f.tx),true);assert.equal(f.calls[0],CANCEL);assert.ok(!f.calls.includes(SAVE));await f.commit();
 const g=fixture();assert.equal(await g.port.verifyCancelled(g.scope,g.tx),true);assert.deepEqual(g.calls,[STATE]);assert.equal(g.hooks.size,0);
});
test('second operation on same transaction poisons first even if caught',async()=>{
 const f=fixture();await f.port.prepare(f.scope,f.tx);await assert.rejects(f.port.cancelRequested(f.scope,f.tx),/already used/);await assert.rejects(f.commit());
});
test('foreign root, native lease reuse and aborted transport are refused',async()=>{
 const f=fixture();await assert.rejects(f.port.prepare({...f.scope,requestID:randomUUID()},f.tx),/Foreign/);assert.equal(f.calls.length,0);
 assert.throws(()=>createOuchiRequestedPreparation({...f.options,nativeLease:f.scope.leaseToken}),/scope/);
 f.controller.abort();await assert.rejects(f.port.prepare(f.scope,f.tx));
});
