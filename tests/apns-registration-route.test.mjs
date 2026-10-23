import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = path => ts.transpileModule(readFileSync(path,'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const sessionModule = moduleURL(compile('lib/verified-app-session.ts'));
const bindingModule = moduleURL(compile('lib/billing-account.ts').replace("'./verified-app-session'", JSON.stringify(sessionModule)));
const bodyModule = moduleURL(compile('lib/billing-body.ts'));
const stub = moduleURL(`export function createClient(url,key){ const h=globalThis.apnsRouteHarness;h.clients++;return {auth:{getUser:async token=>{h.authTokens.push(token);return {data:{user:h.authError?null:{id:h.user}},error:h.authError};}},rpc:async(name,args)=>{h.calls.push({name,args});if(h.databaseError)return {data:null,error:Error('synthetic')};return {error:null,data:name==='current_maintenance_purchase_account'?h.epoch:name==='disable_maintenance_apns'?h.disabled:h.id};}};}`);
const code = compile('app/api/development/apns-registration/route.ts')
 .replace("'@supabase/supabase-js'",JSON.stringify(stub))
 .replace("'@/lib/verified-app-session'",JSON.stringify(sessionModule))
 .replace("'@/lib/billing-account'",JSON.stringify(bindingModule))
 .replace("'@/lib/billing-body'",JSON.stringify(bodyModule));
const { POST, DELETE } = await import(moduleURL(code));
test('actual APNs route enforces isolated configuration and verified identity before writes',async()=>{
 const user='11111111-1111-4111-8111-111111111111', session='22222222-2222-4222-8222-222222222222', epoch='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
 const env={NODE_ENV:'development',VERCEL_ENV:'development',OUCHI_APNS_TEST_MODE:'true',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',OUCHI_APNS_TEST_SERVICE_KEY:'synthetic-test-only',APPLE_BUNDLE_ID:'jp.ouchi.maintenance'};
 const original=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const token=`a.${Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')}.b`;
 const h=globalThis.apnsRouteHarness={user,epoch,id,disabled:true,clients:0,authTokens:[],calls:[],authError:null,databaseError:false};
 const request=(body,authorization=`Bearer ${token}`)=>new Request('http://localhost/api/development/apns-registration',{method:'POST',headers:{authorization},body:JSON.stringify(body)});
 try {
  for(const change of [{NODE_ENV:'production'},{VERCEL_ENV:'production'},{NEXT_PUBLIC_SUPABASE_URL:'https://shared.supabase.co'},{OUCHI_APNS_TEST_MODE:'false'},{OUCHI_APNS_TEST_SERVICE_KEY:''}]){
   Object.assign(process.env,env,change);assert.equal((await POST(request({deviceToken:'AB'.repeat(32)}))).status,503);
  }
  assert.equal(h.clients,0);Object.assign(process.env,env);
  assert.equal((await POST(request({},'Bearer invalid extra'))).status,401);assert.equal(h.clients,0);
  h.authError=Error('synthetic');assert.equal((await POST(request({deviceToken:'ab'.repeat(32)}))).status,401);assert.equal(h.calls.length,0);h.authError=null;
  h.epoch=null;assert.equal((await POST(request({deviceToken:'ab'.repeat(32)}))).status,403);h.epoch=epoch;
  for(const body of [{deviceToken:'../secret'},{deviceToken:'ab'.repeat(32),userId:user},{deviceToken:'a'}])assert.equal((await POST(request(body))).status,400);
  assert.equal(h.calls.filter(c=>c.name==='register_maintenance_apns').length,0);
  const response=await POST(request({deviceToken:'AB'.repeat(32)}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{environment:'Sandbox',registrationId:id});assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(h.calls.at(-1),{name:'register_maintenance_apns',args:{target_user:user,verified_session:session,expected_epoch:epoch,token:'ab'.repeat(32),bundle_topic:env.APPLE_BUNDLE_ID}});
  const disabled=await DELETE(request({registrationId:id}));assert.deepEqual(await disabled.json(),{environment:'Sandbox',disabled:true});
  h.disabled=false;assert.equal((await (await DELETE(request({registrationId:id}))).json()).disabled,false);
  h.id='not-an-id';assert.equal((await POST(request({deviceToken:'ab'.repeat(32)}))).status,503);h.id=id;
  h.databaseError=true;assert.equal((await POST(request({deviceToken:'ab'.repeat(32)}))).status,503);
  assert.ok(h.authTokens.every(value=>value===token));
 }finally{delete globalThis.apnsRouteHarness;for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
