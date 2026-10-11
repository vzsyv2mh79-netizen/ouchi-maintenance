import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
function module(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(module(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const {handleReminderSettings:handle,freeReminderSchedule:free,ReminderSettingsError:E}=await import(module('reminder-settings'));
const scope={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333'};
const chosen={minuteOfDay:1230,weekdays:[7],leadDays:1,includeOverdue:false};
const state=(saved=null,premium=false,revision=0)=>({environment:'Sandbox',revision,saved,effective:premium?(saved??free):free,premiumActive:premium});
function req(method='GET',body,headers={}){return new Request('https://synthetic.example.invalid/settings',{method,headers:{authorization:'Bearer synthetic','content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});}
test('settings auth scope, exact saved acknowledgement and expired retained preferences',async()=>{
 let writes=0;const deps={verify:async()=>scope,read:async()=>state(chosen,false,1),save:async(s,r,value)=>{writes++;assert.deepEqual(s,scope);assert.ok(Object.isFrozen(s));assert.equal(r,0);assert.deepEqual(value,chosen);return state(value,true,1);}};
 let result=await handle(req(),deps);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual((await result.json()).effective,free);
 result=await handle(req('PUT',{revision:0,schedule:chosen}),deps);assert.equal(result.status,200);assert.equal(writes,1);
 for(const value of [state(chosen,true,2),state(free,true,1),state(chosen,false,0),{...state(),environment:'Production'},{...state(),effective:chosen}]){
  assert.equal((await handle(req('PUT',{revision:0,schedule:chosen}),{...deps,save:async()=>value})).status,503);
 }
 for(const [reason,status] of [['conflict',409],['premium',403],['identity',403]])assert.equal((await handle(req('PUT',{revision:0,schedule:chosen}),{...deps,save:async()=>{throw new E(reason);}})).status,status);
});
test('disabled, malformed and unauthorized settings never reach reads or writes',async()=>{
 let calls=0;const deps={verify:async()=>{calls++;return scope;},read:async()=>state(),save:async()=>{calls++;throw Error('unexpected');}};
 assert.equal((await handle(req(),null)).status,503);
 assert.equal((await handle(req('POST',{}),deps)).status,405);
 for(const body of [{revision:-1,schedule:chosen},{revision:0,schedule:{...chosen,weekdays:[1,1]}},{revision:0,schedule:chosen,premium:true},{revision:0,schedule:{...chosen,userID:scope.userID}},{revision:0,schedule:{...chosen,leadDays:2}}])assert.equal((await handle(req('PUT',body),deps)).status,400);
 assert.equal((await handle(req('PUT',{}, {'content-type':'text/plain'}),deps)).status,415);
 assert.equal((await handle(req('GET',undefined,{authorization:'Bearer injected token'}),deps)).status,401);assert.equal(calls,0);
 assert.equal((await handle(req(),{...deps,verify:async()=>null})).status,401);
});
