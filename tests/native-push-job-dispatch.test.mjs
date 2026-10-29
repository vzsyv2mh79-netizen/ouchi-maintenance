import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const dispatchURL='data:text/javascript;base64,'+Buffer.from(compile(readFileSync('lib/native-push-dispatch.ts','utf8'))).toString('base64');
const js=compile(readFileSync('lib/native-push-job-dispatch.ts','utf8').replace("'./native-push-dispatch'",JSON.stringify(dispatchURL)));
const {countedNativePushDispatch:counted}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333';
test('job dispatch obtains count from fenced server scope and refuses invalid or zero counts',async()=>{
 let scope=id,amount=2,sent=0;const calls=[];
 const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='read_maintenance_native_push_job_claim'?scope:amount,error:null};}};
 const destination={read:async()=>({id,environment:'Sandbox',deviceToken:'ab'.repeat(32),topic:'jp.ouchi.maintenance',registeredAt:100}),allowed:async()=>true,send:async value=>{sent++;assert.equal(value.dueCount,2);return 'accepted';}};
 const dispatch=counted(db,destination,()=>200);
 assert.equal(await dispatch(id,job,lease),'accepted');assert.equal(sent,1);
 assert.deepEqual(calls[1],['count_maintenance_native_job_due',{target_job:job,target_lease:lease}]);
 for(const value of [null,'2',-1,100001,1.5]){amount=value;assert.equal(await dispatch(id,job,lease),'inspect');}
 amount=0;assert.equal(await dispatch(id,job,lease),'skipped');
 scope=job;assert.equal(await dispatch(id,job,lease),'inspect');assert.equal(sent,1);
 const controller=new AbortController();controller.abort();assert.equal(await dispatch(id,job,lease,controller.signal),'skipped');
});
