import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();function compile(name){if(modules.has(name))return modules.get(name);let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;}
const {storedDeletionFinalization}=await import(compile('account-deletion-finalization-store'));
const scope={requestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),leaseToken:randomUUID()};
test('real tail adapter reads registration/identity/retention checkpoints and canonical completion with exact immutable scope',async()=>{
 const calls=[],db={rpc:async(name,args)=>{calls.push(name);assert.deepEqual(args,{target_request:scope.requestID,target_user:scope.userID,target_epoch:scope.epochID,target_lease:scope.leaseToken});return {data:true};}};
 const tail=storedDeletionFinalization(db,new AbortController().signal);assert.equal(await tail.eraseNativeDevices(scope),true);assert.equal(await tail.finalizeIdentityAndRetention(scope),true);assert.equal(await tail.markComplete(scope),true);
 assert.deepEqual(calls,['maintenance_deletion_registrations_are_erased','erase_maintenance_deletion_identity','maintenance_deletion_retention_is_confirmed','complete_maintenance_account_deletion']);assert.equal(Object.isFrozen(tail),true);
});
test('missing retention never creates evidence or completes, and identity refusal prevents retention lookup',async()=>{
 for(const denied of ['erase_maintenance_deletion_identity','maintenance_deletion_retention_is_confirmed']){
  const calls=[],tail=storedDeletionFinalization({rpc:async name=>{calls.push(name);return {data:name!==denied};}},new AbortController().signal);
  assert.equal(await tail.finalizeIdentityAndRetention(scope),false);assert.deepEqual(calls,denied==='erase_maintenance_deletion_identity'?['erase_maintenance_deletion_identity']:['erase_maintenance_deletion_identity','maintenance_deletion_retention_is_confirmed']);
 }
});
test('malformed acknowledgements and cancellation never become successful erasure',async()=>{
 for(const response of [{data:null},{data:'true'},{data:1},{data:true,error:{message:'unavailable'}}]){
  const tail=storedDeletionFinalization({rpc:async()=>response},new AbortController().signal);await assert.rejects(tail.eraseNativeDevices(scope),/acknowledgement unavailable/);await assert.rejects(tail.finalizeIdentityAndRetention(scope),/acknowledgement unavailable/);
 }
 const controller=new AbortController();let calls=0;const tail=storedDeletionFinalization({rpc:async()=>{calls++;controller.abort();return {data:true};}},controller.signal);assert.equal(await tail.finalizeIdentityAndRetention(scope),false);assert.equal(calls,1);assert.equal(await tail.eraseNativeDevices(scope),false);assert.equal(calls,1);
});
test('explicit transport, bounded signal and exact scope are required before an RPC',async()=>{
 let calls=0;const db={rpc:async()=>{calls++;return {data:true};}},signal=new AbortController().signal;
 assert.throws(()=>storedDeletionFinalization(db),/Explicit bounded/);assert.throws(()=>storedDeletionFinalization(db,signal,true),/Explicit bounded/);
 const tail=storedDeletionFinalization(db,signal);await assert.rejects(tail.eraseNativeDevices({...scope,approved:true}),/Exact deletion/);await assert.rejects(tail.finalizeIdentityAndRetention({...scope,userID:randomUUID()+'bad'}),/Exact deletion/);assert.equal(calls,0);
});
