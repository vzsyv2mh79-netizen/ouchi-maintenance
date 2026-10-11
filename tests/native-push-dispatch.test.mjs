import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/native-push-dispatch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {dispatchRegisteredSandboxPush:dispatch}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('sandbox dispatch reads exact destination and checks current registration immediately before send',async()=>{
 const id='11111111-1111-4111-8111-111111111111',row={id,environment:'Sandbox',deviceToken:'ab'.repeat(32),topic:'jp.ouchi.maintenance',registeredAt:100};let sent=0;const order=[];
 const deps={read:async value=>{assert.equal(value,id);order.push('read');return row;},allowed:async value=>{assert.equal(value,id);order.push('guard');return true;},send:async value=>{order.push('send');sent++;assert.deepEqual(value,{deviceToken:row.deviceToken,bundleId:row.topic,registeredAt:100,dueCount:1,now:200});return 'accepted';}};
 assert.equal(await dispatch(id,1,200,deps),'accepted');assert.deepEqual(order,['read','guard','send']);
 assert.equal(await dispatch(id,1,200,{...deps,allowed:async()=>false}),'skipped');
 assert.equal(await dispatch(id,1,200,{...deps,allowed:async()=>{throw Error('offline');}}),'retry');
 for(const change of [{environment:'Production'},{id:'22222222-2222-4222-8222-222222222222'},{topic:'other.app'},{deviceToken:'../invalid'}])assert.equal(await dispatch(id,1,200,{...deps,read:async()=>({...row,...change})}),'inspect');
 const controller=new AbortController();assert.equal(await dispatch(id,1,200,{...deps,allowed:async()=>{controller.abort();return true;}},controller.signal),'skipped');assert.equal(sent,1);
});
test('dispatch forwards cancellation to sender and does not publish a late acceptance',async()=>{
 const id='11111111-1111-4111-8111-111111111111',controller=new AbortController();
 const row={id,environment:'Sandbox',deviceToken:'ab'.repeat(32),topic:'jp.ouchi.maintenance',registeredAt:100};
 const result=await dispatch(id,1,200,{read:async()=>row,allowed:async()=>true,send:async(_,signal)=>{
  assert.equal(signal,controller.signal);controller.abort();return 'accepted';
 }},controller.signal);
 assert.equal(result,'skipped');
});
