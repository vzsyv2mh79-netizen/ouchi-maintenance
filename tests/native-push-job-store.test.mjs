import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/native-push-job-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {storedNativePushJob:store}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const job='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222',registration='33333333-3333-4333-8333-333333333333';
test('native job adapter fences destination read and requires exact RPC acknowledgements',async()=>{
 const calls=[];let response={data:lease,error:null},row={data:registration,error:null};
 const db={rpc:async(name,args)=>{calls.push([name,args]);return name==='read_maintenance_native_push_job_claim'?row:response;}};
 const dispatch=async()=> 'accepted',deps=store(db,dispatch);
 assert.deepEqual(await deps.claim(job),{lease,registration});assert.deepEqual(calls.at(-1),['read_maintenance_native_push_job_claim',{target_job:job,target_lease:lease}]);assert.equal(deps.dispatch,dispatch);
 response={data:true,error:null};assert.equal(await deps.start(job,lease),true);assert.equal(await deps.finish(job,lease,'accepted'),true);
 assert.deepEqual(calls.at(-1),['finish_maintenance_native_push_job',{target_job:job,target_lease:lease,outcome:'accepted'}]);
 response={data:'true',error:null};assert.equal(await deps.start(job,lease),false);
 response={data:lease,error:null};row={data:null,error:null};await assert.rejects(()=>deps.claim(job));
 response={data:null,error:null};assert.equal(await deps.claim(job),null);
 response={data:null,error:{message:'synthetic'}};await assert.rejects(()=>deps.claim(job));await assert.rejects(()=>deps.start(job,lease));await assert.rejects(()=>deps.finish(job,lease,'accepted'));
});
