import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createOuchiFamilyPreparationGeneration,FAMILY_GENERATION_RESERVE_SQL as RESERVE,FAMILY_GENERATION_CANCEL_SQL as CANCEL,FAMILY_GENERATION_STATE_SQL as STATE} from '../lib/ouchi-family-preparation-generation.mjs';
function fixture(){
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]},controller=new AbortController(),hooks=new Map(),calls=[],state={coverage:true,pid:11,xid:'29',ok:true};
 const options={scope,generationID:randomUUID(),nativeLease:randomUUID(),homes:[{homeID:randomUUID(),successorID:randomUUID()}],verifyNoDispatch:async()=>state.coverage};
 const tx={signal:controller.signal,beforeCommit:(k,fn)=>hooks.set(k,fn),query:async(sql,args)=>{calls.push(sql);assert.deepEqual(args.slice(0,4),[scope.requestID,JSON.stringify(scope),options.generationID,options.nativeLease]);assert.equal(JSON.parse(args[4]).length,1);return {rows:sql===STATE?[{ok:state.ok,backend_pid:state.pid,transaction_id:state.xid}]:[{ok:state.ok}]};}};
 return {scope,options,state,tx,calls,controller,port:createOuchiFamilyPreparationGeneration(options),commit:async()=>{for(const fn of hooks.values())assert.equal(await fn(),true);}};
}
test('generation gate has only reservation/cancel methods, mandatory independent admission',async()=>{
 const f=fixture();assert.throws(()=>createOuchiFamilyPreparationGeneration({...f.options,verifyNoDispatch:null}),/coverage/);assert.deepEqual(Object.keys(f.port),['reserve','cancelRequested']);await f.port.reserve(f.scope,f.tx);assert.equal(f.calls[0],RESERVE);await f.commit();
});
test('empty, extra-field, duplicate roster and owner-as-successor refuse',()=>{
 const f=fixture();for(const homes of [[],[...f.options.homes,...f.options.homes],[{...f.options.homes[0],flag:true}],[{...f.options.homes[0],successorID:f.scope.userID}]])assert.throws(()=>createOuchiFamilyPreparationGeneration({...f.options,homes}));
});
test('cancel does not reserve/overwrite a generation; caught failed result poisons COMMIT',async()=>{
 const f=fixture();await f.port.cancelRequested(f.scope,f.tx);assert.equal(f.calls[0],CANCEL);assert.ok(!f.calls.includes(RESERVE));await f.commit();
 const g=fixture();g.state.ok=false;await assert.rejects(g.port.cancelRequested(g.scope,g.tx),/unconfirmed/);g.state.ok=true;await assert.rejects(g.commit());
});
test('late coverage and PID/XID drift refuse actual owning COMMIT',async()=>{
 for(const key of ['coverage','pid','xid']){const f=fixture();await f.port.reserve(f.scope,f.tx);f.state[key]=key==='coverage'?false:key==='pid'?12:'30';await assert.rejects(f.commit());}
});
test('repeated operation poisons; foreign root and unchecked/aborted transaction refuse',async()=>{
 const f=fixture();await f.port.reserve(f.scope,f.tx);await assert.rejects(f.port.cancelRequested(f.scope,f.tx),/already used/);await assert.rejects(f.commit());
 const g=fixture();await assert.rejects(g.port.reserve({...g.scope,requestID:randomUUID()},g.tx),/Foreign/);await assert.rejects(g.port.reserve(g.scope,{query:g.tx.query,signal:g.tx.signal}),/Checked/);g.controller.abort();await assert.rejects(g.port.reserve(g.scope,g.tx));
});
