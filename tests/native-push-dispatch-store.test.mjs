import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {storedNativePushDispatch}=await load('lib/native-push-dispatch-store.ts');const {dispatchRegisteredSandboxPush:dispatch}=await load('lib/native-push-dispatch.ts');
test('stored dispatch uses service RPC destination and refuses incomplete or failed guard',async()=>{
 const id='11111111-1111-4111-8111-111111111111';const row={id,environment:'Sandbox',deviceToken:'ab'.repeat(32),topic:'jp.ouchi.maintenance',registeredAt:100};const calls=[];let allowed=true,error=null,sent=0;
 const db={rpc:async(name,args)=>{calls.push(name);assert.deepEqual(args,{registration_id:id});return {data:name==='read_maintenance_native_sandbox_destination'?row:allowed,error};}};
 const deps=storedNativePushDispatch(db,async()=>{sent++;return 'accepted';});
 assert.equal(await dispatch(id,1,200,deps),'accepted');assert.deepEqual(calls,['read_maintenance_native_sandbox_destination','maintenance_native_push_allowed']);
 allowed=false;assert.equal(await dispatch(id,1,200,deps),'skipped');
 allowed=null;assert.equal(await dispatch(id,1,200,deps),'skipped');
 error=Error('synthetic');assert.equal(await dispatch(id,1,200,deps),'retry');assert.equal(sent,1);
});
