import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/account-deletion-worker-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import \{ eraseAccountDeletionObjects \} from [^;]+;/,"const eraseAccountDeletionObjects=()=>{throw Error('must not erase');};");
const {storedDeletionDependencies}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('stored adapter rejects missing finalization before database access',()=>{
 let calls=0;const db={rpc:()=>{calls++;throw Error('must not query');}};
 for(const missing of ['eraseNativeDevices','finalizeIdentityAndRetention','markComplete']){
  const tail={eraseNativeDevices:async()=>true,finalizeIdentityAndRetention:async()=>true,markComplete:async()=>true};delete tail[missing];
  assert.throws(()=>storedDeletionDependencies(db,tail),/not configured/);
 }
 assert.throws(()=>storedDeletionDependencies(db,null),/not configured/);
 assert.equal(calls,0);
});

test('record cleanup requires acknowledged recovery-job erasure and preserves request scope',async()=>{
 const scope={requestID:'request',userID:'user',epochID:'epoch',leaseToken:'lease'};
 const tail={eraseNativeDevices:async()=>true,finalizeIdentityAndRetention:async()=>true,markComplete:async()=>true};
 const steps=['erase_maintenance_deletion_records','erase_maintenance_deletion_reconciliation','erase_maintenance_deletion_reminder_schedule','erase_maintenance_deletion_notifications','capture_maintenance_deletion_receipt_sessions','erase_maintenance_deletion_enrollment_consents','minimize_maintenance_deletion_object_inventory'];
 for(const failed of [null,...steps]){
  const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name!==failed,error:null};}};
  assert.equal(await storedDeletionDependencies(db,tail).eraseRecords(scope),failed===null);
  assert.deepEqual(calls.map(c=>c.name),failed===null?steps:steps.slice(0,steps.indexOf(failed)+1));
  for(const c of calls)assert.deepEqual(c.args,{target_request:'request',target_user:'user',target_epoch:'epoch',target_lease:'lease'});
 }

});
test('cancellation after record acknowledgement prevents recovery cleanup',async()=>{
 const controller=new AbortController();const calls=[];
 const db={rpc:async(name)=>{calls.push(name);controller.abort();return {data:true,error:null};}};
 const tail={eraseNativeDevices:async()=>true,finalizeIdentityAndRetention:async()=>true,markComplete:async()=>true};
 assert.equal(await storedDeletionDependencies(db,tail,controller.signal).eraseRecords({requestID:'request',userID:'user',epochID:'epoch',leaseToken:'lease'}),false);
 assert.deepEqual(calls,['erase_maintenance_deletion_records']);
});

test('device erasure requires daily identity acknowledgement before native finalization',async()=>{
 const scope={requestID:'request',userID:'user',epochID:'epoch',leaseToken:'lease'};
 for(const failed of [null,'erase_maintenance_deletion_native_delivery_identities']){
  const calls=[];let native=0;const db={rpc:async(name,args)=>{calls.push(name);assert.equal(args.target_epoch,'epoch');return {data:name!==failed};}};
  const tail={eraseNativeDevices:async()=>{native++;return true;},finalizeIdentityAndRetention:async()=>true,markComplete:async()=>true};
  assert.equal(await storedDeletionDependencies(db,tail).eraseDeviceRegistrations(scope),failed===null);assert.equal(native,failed===null?1:0);assert.deepEqual(calls,['erase_maintenance_deletion_web_push','erase_maintenance_deletion_native_push','erase_maintenance_deletion_native_delivery_identities']);
 }
});
