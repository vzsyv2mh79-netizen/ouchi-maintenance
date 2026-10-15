import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSharedMaintenanceAdapter} from './fixtures/shared-maintenance-adapter-module.mjs';
function fixture(){
 const native={requestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),leaseToken:randomUUID()};
 const shared={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:native.userID,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:native.epochID}]};
 const controller=new AbortController(),calls=[];
 const ports={resolve:async()=>native,atomic:async(mapping,value,phase)=>{assert.ok(Object.isFrozen(mapping.shared.apps));assert.ok(Object.isFrozen(value));calls.push(phase);return phase!=='completionAlreadyConfirmed';},verify:async()=>{calls.push('verify');return true;},handoff:async()=>true,family:async()=>true,sessions:async()=>true,familyAfterAuth:async()=>true,sessionsAfterAuth:async()=>true};
 return {native,shared,controller,calls,ports,adapter:()=>createSharedMaintenanceAdapter(ports,controller.signal)};
}
test('application bridge runs the actual canonical worker in order and requires final readback',async()=>{
 const f=fixture();assert.equal(await f.adapter().erase(f.shared),true);
 assert.deepEqual(f.calls,['completionAlreadyConfirmed','leaseCurrent','revokeAndCaptureInventory','leaseCurrent','eraseDeviceRegistrations','leaseCurrent','eraseAttachments','leaseCurrent','eraseRecords','leaseCurrent','finalizeIdentityAndRetention','leaseCurrent','markComplete','verify']);
});
test('missing ports, foreign mapping, malformed or shared native lease cannot start native work',async()=>{
 const f=fixture();for(const key of Object.keys(f.ports))assert.throws(()=>createSharedMaintenanceAdapter({...f.ports,[key]:undefined},f.controller.signal));
 const faults=[g=>({leaseToken:g.shared.leaseToken}),g=>({leaseToken:g.shared.leaseToken.toUpperCase()}),
  ()=>({leaseToken:'invalid'}),()=>({leaseToken:'00000000-0000-0000-0000-000000000000'}),
  ()=>({userID:randomUUID()}),()=>({epochID:randomUUID()}),()=>({requestID:randomUUID()}),()=>({extra:'untrusted'})];
 for(const fault of faults){
  const g=fixture();g.ports.resolve=async()=>({...g.native,...fault(g)});
  assert.equal(await g.adapter().erase(g.shared),false);assert.deepEqual(g.calls,[]);
 }
 const g=fixture();assert.equal(await g.adapter().erase({...g.shared,apps:[]}),false);assert.deepEqual(g.calls,[]);
});
test('unknown native outcome stays pending; retry reads committed completion and never repeats erasure',async()=>{
 const f=fixture();let committed=false;
 f.ports.atomic=async(_,native,phase)=>{assert.equal(native.leaseToken,f.native.leaseToken);f.calls.push(phase);if(phase==='completionAlreadyConfirmed')return committed;if(phase==='markComplete'){committed=true;throw Error('Reply lost');}return true;};
 const adapter=f.adapter();assert.equal(await adapter.erase(f.shared),false);f.calls.length=0;
 assert.equal(await adapter.erase(f.shared),true);assert.deepEqual(f.calls,['completionAlreadyConfirmed','verify']);
});
test('cancellation after resolve, a mutation, or final readback never reports completion',async()=>{
 for(const when of ['resolve','eraseRecords','verify']){
  const f=fixture(),key=when==='resolve'?'resolve':when==='verify'?'verify':'atomic',original=f.ports[key];
  f.ports[key]=async(...args)=>{const result=await original(...args);if(key!=='atomic'||args[2]===when)f.controller.abort();return result;};
  assert.equal(await f.adapter().erase(f.shared),false);
  if(when==='resolve')assert.deepEqual(f.calls,[]);
  if(when==='eraseRecords')assert.equal(f.calls.includes('finalizeIdentityAndRetention'),false);
 }
});
test('nonboolean acknowledgements and failed final verification do not grant app completion',async()=>{
 for(const value of [false,null,'true',1]){const f=fixture();f.ports.verify=async()=>value;assert.equal(await f.adapter().erase(f.shared),false);}
 const f=fixture();f.ports.atomic=async()=>undefined;assert.equal(await f.adapter().erase(f.shared),false);
});
test('provider identities and native bindings stay fixed while callbacks suspend',async()=>{
 const f=fixture();let release,started;const ready=new Promise(resolve=>{started=resolve;});
 f.ports.atomic=async(_,native,phase)=>{f.calls.push(phase);if(phase==='completionAlreadyConfirmed'){started();await new Promise(resolve=>{release=resolve;});return false;}assert.notEqual(native.leaseToken,f.shared.leaseToken);return true;};
 const adapter=f.adapter(),pending=adapter.erase(f.shared);await ready;
 f.native.leaseToken=f.shared.leaseToken;f.ports.verify=async()=>{throw Error('Replaced verifier');};f.ports.atomic=async()=>{throw Error('Replaced transport');};release();
 assert.equal(await pending,true);assert.equal(f.calls.at(-1),'verify');
});
test('family/session checks preserve independent post-Auth requirements and fail closed after cancellation',async()=>{
 const f=fixture();for(const name of ['handoff','verifyFamily','verifySessions','verifyFamilyAfterAuth','verifySessionsAfterAuth'])assert.equal(await f.adapter()[name](f.shared),true);
 f.ports.familyAfterAuth=async()=>{f.controller.abort();return true;};assert.equal(await f.adapter().verifyFamilyAfterAuth(f.shared),false);assert.equal(await f.adapter().verifySessionsAfterAuth(f.shared),false);
});
