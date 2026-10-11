import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const cache=new Map();function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(compile(name))}`).replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}
const {reportDeployment,reportServiceResponse}=await import(compile('report-service-handler'));
const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',home='44444444-4444-4444-8444-444444444444';
const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.sig';
const deployment={url:'https://synthetic.supabase.co/',key:'synthetic-service',storage:'verified-ledger',environment:'Production'};
const config=reportDeployment(deployment,'true','sb_publishable_synthetic');
const request=(query='?homeId='+home,headers={})=>new Request('https://example.invalid/api/maintenance-report'+query,{headers:{Authorization:'Bearer '+token,'X-Ouchi-App-Epoch':epoch,...headers}});
function fixture(options={}){
 const calls=[];let authReads=0,bindings=0,rights=0;
 const factories={service:()=>{calls.push('service');return {auth:{getUser:async value=>{assert.equal(value,token);authReads++;return {data:{user:options.authLost&&authReads>1?null:{id:user}},error:null};}},rpc:async(name,args)=>{
  calls.push(name);assert.equal(args.target_user,user);assert.equal(args.verified_session,session);
  if(name==='current_maintenance_purchase_account'){bindings++;return {data:options.epochLost&&bindings>1?home:epoch,error:null};}
  assert.equal(name,'read_maintenance_verified_entitlement');assert.equal(args.target_epoch,epoch);assert.equal(args.target_environment,'Production');rights++;
  if(options.ledgerOutage)return {data:null,error:Error('outage')};
  return {data:options.free||options.rightsLost&&rights>1?{plan:'free',environment:'Production'}:{plan:'premium',environment:'Production',productId:'ouchi.premium.monthly',expiresAt:Date.now()+(options.expired?-1000:60000)},error:null};
 }};},caller:(value,bearer,signal)=>{calls.push('caller');assert.equal(value.publishableKey,'sb_publishable_synthetic');assert.equal(bearer,token);assert.equal(signal.aborted,false);return {rpc:async name=>{assert.equal(name,'load_household');calls.push('load');return {data:{homes:[{id:options.missingHome?user:home,name:'Synthetic home',kind:'home'}],products:[],tasks:[],history:[]},error:null};},from:table=>{assert.equal(table,'homes');return {select:columns=>{assert.equal(columns,'id');return {eq:(column,id)=>{assert.equal(column,'id');assert.equal(id,home);return {maybeSingle:async()=>{calls.push('membership');return {data:options.membershipLost?null:{id:home},error:null};}};}};}};}};}};
 return {calls,factories};
}
test('formal report deployment is disabled without explicit flag, verified ledger, HTTPS and publishable key',async()=>{
 for(const [value,flag,key] of [[deployment,undefined,'sb_publishable_synthetic'],[{...deployment,storage:'sandbox-legacy'},'true','sb_publishable_synthetic'],[{...deployment,url:'http://127.0.0.1:3000'},'true','sb_publishable_synthetic'],[deployment,'true',undefined],[deployment,'true','synthetic-service']])assert.equal(reportDeployment(value,flag,key),null);
 const f=fixture();assert.equal((await reportServiceResponse(request(),null,f.factories)).status,503);assert.deepEqual(f.calls,[]);
});
test('ambiguous query, missing epoch and invalid bearer fail before database construction',async()=>{
 for(const r of [request('?homeId='+home+'&homeId='+user),request('?homeId='+home+'&unknown=true'),request('?homeId=00000000-0000-0000-0000-000000000000'),request(undefined,{'X-Ouchi-App-Epoch':'bad'}),request(undefined,{Authorization:'Bearer bad token'}),new Request(request(),{method:'POST'})]){
  const f=fixture();assert.notEqual((await reportServiceResponse(r,config,f.factories)).status,200);assert.deepEqual(f.calls,[]);
 }
});
test('formal paid report checks exact production ledger scope and rechecks RLS, Auth, epoch and rights',async()=>{
 const f=fixture(),response=await reportServiceResponse(request(),config,f.factories);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.environment,'Production');assert.equal(body.purchaseAccountToken,epoch);assert.equal(body.report.homeId,home);assert.equal(body.report.productCount,0);
 assert.equal(f.calls.filter(name=>name==='current_maintenance_purchase_account').length,2);assert.equal(f.calls.filter(name=>name==='read_maintenance_verified_entitlement').length,2);assert.ok(f.calls.includes('membership'));
});
test('free/expired rights deny private load; changed auth, membership, epoch or rights discard loaded data',async()=>{
 for(const [options,status] of [[{free:true},403],[{expired:true},403],[{authLost:true},403],[{epochLost:true},403],[{membershipLost:true},404],[{rightsLost:true},403],[{missingHome:true},404],[{ledgerOutage:true},503]]){
  const f=fixture(options),response=await reportServiceResponse(request(),config,f.factories);assert.equal(response.status,status);assert.equal((await response.json()).report,undefined);if(options.free||options.expired||options.ledgerOutage)assert.ok(!f.calls.includes('caller'));
 }
 const f=fixture();assert.equal((await reportServiceResponse(request(undefined,{'X-Ouchi-App-Epoch':home}),config,f.factories)).status,403);assert.ok(!f.calls.includes('caller'));
});
