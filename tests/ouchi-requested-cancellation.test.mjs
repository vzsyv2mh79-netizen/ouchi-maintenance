import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOuchiRequestedCancellation,OUCHI_REQUESTED_CANCELLATION_SQL} from '../lib/ouchi-requested-cancellation.mjs';
function fixture(){
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]};
 const state={rows:[{ok:true,backend_pid:19,transaction_id:'25'}],coverage:true,queries:0},controller=new AbortController(),hooks=new Map();
 const tx={signal:controller.signal,beforeCommit:(key,fn)=>hooks.set(key,fn),query:async(sql,args)=>{assert.equal(sql,OUCHI_REQUESTED_CANCELLATION_SQL);assert.deepEqual(args,[scope.requestID,JSON.stringify(scope)]);state.queries++;return {rows:state.rows};}};
 const options={signal:controller.signal,verifyCoverage:async()=>state.coverage};return {scope,state,controller,tx,options,hooks,port:createOuchiRequestedCancellation(options),commit:async()=>{for(const fn of hooks.values())assert.equal(await fn(),true);}};
}
test('independent bounded coverage required; no mutation or assumed release in app port',async()=>{
 assert.throws(()=>createOuchiRequestedCancellation({}),/coverage/);const f=fixture();
 assert.deepEqual(Object.keys(f.port),['cancelRequested','verifyCancelled']);assert.equal(await f.port.cancelRequested(f.scope,f.tx),true);assert.equal(await f.port.verifyCancelled(f.scope,f.tx),true);await f.commit();
});
test('absent/unsafe native state returns false and poisons caught owning COMMIT',async()=>{
 const f=fixture();f.state.rows=[];assert.equal(await f.port.cancelRequested(f.scope,f.tx),false);await assert.rejects(f.commit());
});
test('late refused coverage or SQL state cannot recover within same transaction',async()=>{
 for(const kind of ['coverage','sql']){
  const f=fixture();assert.equal(await f.port.cancelRequested(f.scope,f.tx),true);
  if(kind==='coverage')f.state.coverage=false;else f.state.rows=[];
  assert.equal(await f.port.verifyCancelled(f.scope,f.tx),false);f.state.coverage=true;f.state.rows=[{ok:true,backend_pid:19,transaction_id:'25'}];
  assert.equal(await f.port.verifyCancelled(f.scope,f.tx),false);await assert.rejects(f.commit());
 }
});
test('physical transaction change and scope replacement refuse',async()=>{
 const f=fixture();assert.equal(await f.port.cancelRequested(f.scope,f.tx),true);f.state.rows[0].transaction_id='26';assert.equal(await f.port.verifyCancelled(f.scope,f.tx),false);await assert.rejects(f.commit());
 const g=fixture();assert.equal(await g.port.cancelRequested(g.scope,g.tx),true);assert.equal(await g.port.verifyCancelled({...g.scope,requestID:randomUUID()},g.tx),false);await assert.rejects(g.commit());
});
test('explicit raw root transaction transport is supported, cancellation remains externally owned',async()=>{
 const f=fixture(),raw={query:f.tx.query};assert.equal(await f.port.cancelRequested(f.scope,raw),true);assert.equal(f.hooks.size,0);
 f.controller.abort();await assert.rejects(f.port.verifyCancelled(f.scope,raw));
});
