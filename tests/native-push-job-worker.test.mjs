import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/native-push-job-worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {runNativePushJob:run}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const job='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222',registration='33333333-3333-4333-8333-333333333333';
test('native worker persists known acceptance after cancellation and never retries a lost acknowledgement',async()=>{
 const controller=new AbortController(),order=[];
 const deps={claim:async()=>({lease,registration}),start:async()=>{order.push('start');return true;},dispatch:async(id,signal)=>{assert.equal(id,registration);assert.equal(signal,controller.signal);order.push('send');controller.abort();return 'accepted';},finish:async(id,key,result)=>{assert.equal(id,job);assert.equal(key,lease);assert.equal(result,'accepted');order.push('finish');return true;}};
 assert.deepEqual(await run(job,deps,controller.signal),{status:'recorded',outcome:'accepted'});assert.deepEqual(order,['start','send','finish']);
 let sent=0;
 assert.deepEqual(await run(job,{...deps,dispatch:async()=>{sent++;return 'accepted';},finish:async()=>{throw Error('lost');}}),{status:'unconfirmed',outcome:'accepted'});assert.equal(sent,1);
});
test('native worker refuses missing claims and uncertain starts without sending',async()=>{
 const deps={claim:async()=>({lease,registration}),start:async()=>{throw Error('lost start');},dispatch:async()=>assert.fail('must not send'),finish:async(_,__,result)=>{assert.equal(result,'delivery-unknown');return true;}};
 assert.deepEqual(await run(job,deps),{status:'recorded',outcome:'delivery-unknown'});
 assert.deepEqual(await run(job,{...deps,claim:async()=>null}),{status:'unclaimed'});
 assert.deepEqual(await run(job,{...deps,claim:async()=>({lease:'bad',registration})}),{status:'unconfirmed'});
});
