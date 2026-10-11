import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/web-report-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {loadWebReport,checkedWebReport,reportLeaseCurrent}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const account='11111111-1111-4111-8111-111111111111',home='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',product='44444444-4444-4444-8444-444444444444';
const report={homeId:home,homeName:'Synthetic home',today:'2026-10-10',generatedAt:'2026-10-10T00:00:00Z',productCount:1,taskCount:2,overdue:1,dueToday:1,explanation:'Recorded history',months:[5,6,7,8,9,10].map(month=>({month:`2026-${String(month).padStart(2,'0')}`,completed:month===10?1:0})),perProduct:[{productId:product,name:'Purifier',completedThisMonth:1,overdue:1,dueToday:1}]};
function setup(change=()=>{}){
 const controller=new AbortController(),requests=[],session={account,token:'synthetic'},rights={plan:'premium',environment:'Production',expiresAt:2_000_000,productId:'ouchi.premium.monthly',purchaseAccountToken:epoch,salesEnabled:false};
 const options={account,home,environment:'Production',origin:'https://ouchi-maintenance.vercel.app',signal:controller.signal,session:async()=>session,now:()=>1_000_000,clock:()=>500};
 options.fetcher=async(url,init)=>{requests.push({url:url.href,init});const isReport=url.pathname==='/api/maintenance-report';const value=isReport?{environment:'Production',purchaseAccountToken:epoch,report:structuredClone(report)}:{...rights};change({value,isReport,requests,session,rights,controller});const response=new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':'no-store'}});Object.defineProperty(response,'url',{value:url.href});return response;};
 return {options,requests,controller,session,rights};
}
test('formal web flow pins home and epoch, reads server rights twice, retains no sales flag and caps transient display',async()=>{
 const {options,requests}=setup(),lease=await loadWebReport(options);
 assert.equal(requests.length,3);assert.match(requests[1].url,/\/api\/maintenance-report\?homeId=/);assert.equal(requests[1].init.headers['X-Ouchi-App-Epoch'],epoch);for(const {init} of requests){assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer synthetic');}
 assert.equal(lease.deadline,1_300_000);assert.equal(lease.clockDeadline,300_500);assert.ok(reportLeaseCurrent(lease,1_000_000,500));assert.equal(reportLeaseCurrent(lease,999_999,500),false);assert.equal(reportLeaseCurrent(lease,1_300_000,500),false);assert.equal(reportLeaseCurrent(lease,1_000_000,300_500),false);
});
test('account, enrollment, expiry and environment changes refuse report at each boundary',async()=>{
 const changes=[({value,isReport})=>{if(!isReport)value.plan='free';},({value,isReport})=>{if(isReport)value.environment='Sandbox';},({value,isReport})=>{if(isReport)value.purchaseAccountToken=account;},({value,isReport})=>{if(isReport)value.report.homeId=account;},({value,requests})=>{if(requests.length===3)value.expiresAt=1_000_000;},({value,requests})=>{if(requests.length===3)value.purchaseAccountToken=account;},({session,isReport})=>{if(isReport)session.account=home;},({session,isReport})=>{if(isReport)session.token='replacement';},({controller,isReport})=>{if(isReport)controller.abort();}];
 for(const change of changes)await assert.rejects(loadWebReport(setup(change).options));
});
test('malformed, cross-home and inconsistent report content is refused before display',()=>{
 for(const patch of [{today:'2026-02-31'},{homeId:account},{productCount:2},{overdue:2},{months:[]},{perProduct:[{...report.perProduct[0],completedThisMonth:0}]}])assert.throws(()=>checkedWebReport({...report,...patch},home));
});
test('bounded stream, declared length, redirect URL, MIME/cache policy and precancellation refuse unsafe responses',async()=>{
 for(const kind of ['stream','declared','foreign','mime','cache']){
  const fixture=setup();fixture.options.fetcher=async(url)=>{const response=new Response(kind==='stream'?new Uint8Array(2_000_001):'{}',{headers:{'content-type':kind==='mime'?'text/html':'application/json','cache-control':kind==='cache'?'public':'no-store',...(kind==='declared'?{'content-length':'2000001'}:{})}});Object.defineProperty(response,'url',{value:kind==='foreign'?'https://foreign.example/':url.href});return response;};await assert.rejects(loadWebReport(fixture.options));
 }
 const fixture=setup();fixture.controller.abort();await assert.rejects(loadWebReport(fixture.options));assert.equal(fixture.requests.length,0);
});
