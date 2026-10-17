import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {captureSharedMaintenanceInventory as capture} from '../lib/shared-maintenance-inventory-capture.mjs';
function fixture(){
 const native={requestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),leaseToken:randomUUID()};
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:native.userID,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:native.epochID}]};
 const c=new AbortController(),checks=[],calls=[];let allowed=true,current=true,confirmed=true,hook=async()=>{};
 const tx={signal:c.signal,beforeCommit:(key,fn)=>checks.push(fn),query:async(sql,args)=>{assert.deepEqual(args,[scope,native.leaseToken]);calls.push(sql);await hook(sql);return {rows:[sql.includes('capture_shared_native_deletion_objects')?{captured:confirmed}:{current}]};}};
 const verify=async(t,s,n,signal)=>{assert.equal(t,tx);assert.deepEqual(s,scope);assert.deepEqual(n,native);assert.equal(signal,c.signal);calls.push('independent-gates');return allowed;};
 return {native,scope,c,checks,calls,tx,verify,allow:v=>{allowed=v;},current:v=>{current=v;},confirmed:v=>{confirmed=v;},hook:f=>{hook=f;}};
}
test('capture repeats mandatory independent gates and captured readback at owning COMMIT without remote effects',async()=>{
 const f=fixture();assert.equal(await capture(f.tx,f.scope,f.native,f.verify),true);assert.equal(f.checks.length,1);assert.equal(await f.checks[0](),true);
 assert.equal(f.calls.filter(x=>x==='independent-gates').length,3);assert.equal(f.calls.filter(x=>x.includes('capture_shared_native_deletion_objects')).length,1);
 f.allow(false);assert.equal(await f.checks[0](),false);f.allow(true);assert.equal(await f.checks[0](),false);
});
test('exact mapping, distinct native nonce and checked transaction are mandatory',async()=>{
 const f=fixture();
 for(const native of [{...f.native,requestID:randomUUID()},{...f.native,userID:randomUUID()},{...f.native,epochID:randomUUID()},{...f.native,leaseToken:f.scope.leaseToken},{...f.native,extra:true}])await assert.rejects(capture(f.tx,f.scope,native,f.verify));
 await assert.rejects(capture(f.tx,f.scope,f.native));await assert.rejects(capture({...f.tx,beforeCommit:null},f.scope,f.native,f.verify));assert.equal(f.calls.length,0);
});
test('failed current authority or canonical result never permits completion',async()=>{
 for(const kind of ['gate','scope','capture']){
  const f=fixture();if(kind==='gate')f.allow(false);if(kind==='scope')f.current(false);if(kind==='capture')f.confirmed(false);
  await assert.rejects(capture(f.tx,f.scope,f.native,f.verify));assert.equal(f.checks.length,1);assert.equal(await f.checks[0](),false);
 }
});
test('a swallowed later failure or changed provider poisons the original commit check',async()=>{
 for(const kind of ['provider','scope']){
  const f=fixture();await capture(f.tx,f.scope,f.native,f.verify);
  await assert.rejects(capture(f.tx,kind==='scope'?{...f.scope,inventoryDigest:'b'.repeat(64)}:f.scope,f.native,kind==='provider'?async()=>true:f.verify));
  assert.equal(await f.checks[0](),false);
 }
});
test('cancellation during canonical SQL cannot return success or commit',async()=>{
 const f=fixture();f.hook(async sql=>{if(sql.includes('capture_shared_native_deletion_objects'))f.c.abort();});
 await assert.rejects(capture(f.tx,f.scope,f.native,f.verify));assert.equal(f.checks.length,1);assert.equal(await f.checks[0](),false);
});

test('lost first successful capture readback cannot commit even if its rejection is swallowed',async()=>{
 const f=fixture();f.hook(async sql=>{if(sql.includes('capture_shared_native_deletion_objects'))throw Error('Committed statement reply lost');});
 await assert.rejects(capture(f.tx,f.scope,f.native,f.verify));assert.equal(f.checks.length,1);assert.equal(await f.checks[0](),false);
});
