import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const encoded=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const core=encoded(compile('lib/account-closure.ts'));const {handleTestAccountClosure}=await import(core);
const id='11111111-1111-4111-8111-111111111111';
const request=(body={confirmation:'DELETE_OUCHI_MAINTENANCE',password:'synthetic'},token='Bearer synthetic')=>new Request('http://localhost/api/development/account-closure',{method:'POST',headers:{authorization:token},body:JSON.stringify(body)});
test('cleanup derives identity from verified auth and reauth, rejects client-selected identity',async()=>{
 let closed=0;const deps={verify:async token=>{assert.equal(token,'synthetic');return {id,email:'synthetic@example.invalid'};},reauthenticate:async(email,password)=>{assert.equal(email,'synthetic@example.invalid');assert.equal(password,'synthetic');return id;},close:async user=>{assert.equal(user,id);closed++;return true;}};
 let result=await handleTestAccountClosure(request(),deps);assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.deepEqual(await result.json(),{appAccessClosed:true,cleanupApplied:true,sharedIdentityPreserved:true});assert.equal(closed,1);
 for(const body of [{password:'synthetic'},{confirmation:'DELETE_OUCHI_MAINTENANCE',password:'synthetic',userId:id},[],{confirmation:'DELETE_OUCHI_MAINTENANCE',password:'x'.repeat(5000)}])assert.equal((await handleTestAccountClosure(request(body),deps)).status,400);
 assert.equal(closed,1);
 for(const verify of [async()=>null,async()=>{throw new Error('expired');}])assert.notEqual((await handleTestAccountClosure(request(),{...deps,verify})).status,200);
 assert.equal((await handleTestAccountClosure(request(),{...deps,reauthenticate:async()=>null})).status,403);assert.equal((await handleTestAccountClosure(request(),{...deps,reauthenticate:async()=>'22222222-2222-4222-8222-222222222222'})).status,403);assert.equal(closed,1);
 assert.equal((await handleTestAccountClosure(request(),{...deps,close:async()=>{throw new Error('synthetic failure');}})).status,503);
 result=await handleTestAccountClosure(request(),{...deps,close:async()=>false});assert.equal((await result.json()).cleanupApplied,false);
});
test('actual development route refuses Production and non-local DB before constructing clients',async()=>{
 const stub=encoded('export function createClient(){throw new Error("MUST NOT CALL")}');
 const source=compile('app/api/development/account-closure/route.ts').replace(/from ['"]@supabase\/supabase-js['"]/g,`from '${stub}'`).replace(/from ['"]@\/lib\/account-closure['"]/g,`from '${core}'`);
 const {POST}=await import(encoded(source));const keys=['NODE_ENV','OUCHI_CLOSURE_TEST_MODE','OUCHI_CLOSURE_TEST_URL','OUCHI_CLOSURE_TEST_PUBLISHABLE_KEY','OUCHI_CLOSURE_TEST_SERVICE_KEY'];const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{Object.assign(process.env,{NODE_ENV:'production',OUCHI_CLOSURE_TEST_MODE:'true',OUCHI_CLOSURE_TEST_URL:'http://127.0.0.1:54321',OUCHI_CLOSURE_TEST_PUBLISHABLE_KEY:'synthetic',OUCHI_CLOSURE_TEST_SERVICE_KEY:'synthetic'});assert.equal((await POST(request())).status,503);process.env.NODE_ENV='development';process.env.OUCHI_CLOSURE_TEST_URL='https://hphifiqyypwyxkzfanod.supabase.co';assert.equal((await POST(request())).status,503);}finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
