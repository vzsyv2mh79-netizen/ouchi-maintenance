import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {composeSharedMaintenanceHandlers} from './fixtures/shared-maintenance-adapter-module.mjs';
function fixture(){
 const user=randomUUID(),native={requestID:randomUUID(),userID:user,epochID:randomUUID(),leaseToken:randomUUID()};
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:user,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:native.epochID},{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()}]};
 const controller=new AbortController(),checks=[],calls=[];
 const tx={query:async()=>{throw Error('Use the supplied stage ports');},signal:controller.signal,beforeCommit:(key,check)=>checks.push([key,check])};
 const check=name=>async(s,t,signal)=>{assert.deepEqual(s,scope);assert.equal(t,tx);assert.equal(signal,controller.signal);calls.push(name);return true;};
 const peer=Object.fromEntries(['handoffFamily','verifyFamily','verifySessions','verifyFamilyAfterAuth','verifySessionsAfterAuth','erase','verify'].map(name=>[name,check('peer:'+name)]));
 const ports={resolve:async()=>native,atomic:async(_,n,stage)=>{assert.deepEqual(n,native);calls.push('native:'+stage);return stage!=='completionAlreadyConfirmed';},verify:async()=>{calls.push('native:verify');return true;},...Object.fromEntries(['handoff','family','sessions','familyAfterAuth','sessionsAfterAuth'].map(name=>[name,async()=>{calls.push('native:'+name);return true;}]))};
 const makePorts=(s,t,signal)=>{assert.deepEqual(s,scope);assert.equal(t,tx);assert.equal(signal,controller.signal);return ports;};
 return {scope,native,controller,checks,calls,tx,peer,ports,makePorts,build:()=>composeSharedMaintenanceHandlers(makePorts,peer,controller.signal)};
}
test('composition preserves both apps pre/post Auth checks and dispatches the actual native worker',async()=>{
 const f=fixture(),handlers=f.build();
 for(const stage of ['handoff-family','verify-family-before','verify-sessions-before','verify-family','verify-sessions','verify-family-after-auth','verify-sessions-after-auth'])assert.equal(await handlers[stage](f.scope,f.tx),true);
 assert.deepEqual(f.calls,['peer:handoffFamily','native:handoff','peer:verifyFamily','native:family','peer:verifySessions','native:sessions','peer:verifyFamily','native:family','peer:verifySessions','native:sessions','peer:verifyFamilyAfterAuth','native:familyAfterAuth','peer:verifySessionsAfterAuth','native:sessionsAfterAuth']);
 f.calls.length=0;assert.equal(await handlers['erase:ouchi-maintenance'](f.scope,f.tx),true);
 assert.deepEqual(f.calls.filter(x=>!['native:completionAlreadyConfirmed','native:leaseCurrent'].includes(x)),['native:revokeAndCaptureInventory','native:eraseDeviceRegistrations','native:eraseAttachments','native:eraseRecords','native:finalizeIdentityAndRetention','native:markComplete','native:verify']);
 assert.equal(f.checks.length,1);assert.equal(await f.checks[0][1](),true);
 assert.equal('erase-auth' in handlers,false);assert.equal('prepare' in handlers,false);
});
test('failed peer/native readback and even swallowed failures poison the owning commit check',async()=>{
 for(const who of ['peer','native']){
  const f=fixture();if(who==='peer')f.peer.verifyFamily=async()=>false;else f.ports.family=async()=>false;
  const handlers=f.build();await assert.rejects(handlers['verify-family-before'](f.scope,f.tx),/unconfirmed/);
  assert.equal(await f.checks[0][1](),false);await assert.rejects(handlers['erase:ouchi-maintenance'](f.scope,f.tx),/changed or failed/);
  assert.equal(f.calls.includes('native:eraseRecords'),false);
 }
});
test('cancelled composition, changed inventory, or unreviewed transaction cannot proceed or commit',async()=>{
 const f=fixture(),handlers=f.build();await assert.rejects(handlers['verify-family'](f.scope,{query:f.tx.query}),/Checked/);
 await handlers['verify-family'](f.scope,f.tx);await assert.rejects(handlers['verify-family']({...f.scope,inventoryDigest:'b'.repeat(64)},f.tx),/changed or failed/);assert.equal(await f.checks[0][1](),false);
 const g=fixture(),h=g.build();await h['verify-family'](g.scope,g.tx);g.controller.abort();assert.equal(await g.checks[0][1](),false);await assert.rejects(h['erase:ouchi-maintenance'](g.scope,g.tx));
});
test('peer provider identities are snapshotted and every required provider is mandatory',async()=>{
 const f=fixture();for(const key of Object.keys(f.peer))assert.throws(()=>composeSharedMaintenanceHandlers(f.makePorts,{...f.peer,[key]:undefined},f.controller.signal));
 const handlers=f.build();f.peer.verifyFamilyAfterAuth=async()=>{throw Error('Replaced');};assert.equal(await handlers['verify-family-after-auth'](f.scope,f.tx),true);
});

test('current independent readbacks must still pass immediately before the owning commit',async()=>{
 const f=fixture();let allowed=true;f.peer.verifyFamily=async()=>allowed;
 const handlers=f.build();assert.equal(await handlers['verify-family'](f.scope,f.tx),true);
 allowed=false;assert.equal(await f.checks[0][1](),false,'earlier approval cannot stand in for current readback');
 allowed=true;assert.equal(await f.checks[0][1](),false,'a failed final readback poisons this transaction permanently');
});
