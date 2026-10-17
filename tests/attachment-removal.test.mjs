import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/attachment-removal.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {removeProductAttachment:remove}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const id='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333';
const scope={id,user,epoch,path:`${user}/${epoch}/${id}.png`,mime:'image/png'};
const request=signal=>new Request('https://example.invalid/file',{method:'DELETE',signal});
test('removal never releases quota before definitive absence and durable completion',async()=>{
 for(const scenario of ['missing','badScope','timeoutPresent','absentError','completeError','normal','timeoutAbsent']){
  const calls=[],services={begin:async()=>{calls.push('begin');return scenario==='missing'?null:scenario==='badScope'?{...scope,path:'unrelated/file'}:scope;},remove:async s=>{assert.ok(Object.isFrozen(s));calls.push('remove');if(scenario.startsWith('timeout'))throw Error('timeout');},absent:async()=>{calls.push('absent');if(scenario==='absentError')throw Error('transport');return scenario!=='timeoutPresent';},complete:async()=>{calls.push('complete');return scenario!=='completeError';}};
  const response=await remove(request(),id,services);assert.equal(response.status,scenario==='missing'?404:['normal','timeoutAbsent'].includes(scenario)?200:503);
  if(['badScope','missing'].includes(scenario))assert.deepEqual(calls,['begin']);
  if(['timeoutPresent','absentError'].includes(scenario))assert.ok(!calls.includes('complete'));
  if(response.status===200){assert.deepEqual(await response.json(),{removed:true,attachmentId:id});assert.deepEqual(calls,['begin','remove','absent','complete']);}
 }
});
test('cancellation at each stage prevents later work or success despite a possible committed result',async()=>{
 for(const stop of ['begin','remove','absent','complete']){
  const controller=new AbortController(),calls=[];const stage=name=>{calls.push(name);if(name===stop)controller.abort();};
  const services={begin:async()=>{stage('begin');return scope;},remove:async()=>stage('remove'),absent:async()=>{stage('absent');return true;},complete:async()=>{stage('complete');return true;}};
  assert.equal((await remove(request(controller.signal),id,services)).status,503);assert.deepEqual(calls,['begin','remove','absent','complete'].slice(0,['begin','remove','absent','complete'].indexOf(stop)+1));
 }
});
