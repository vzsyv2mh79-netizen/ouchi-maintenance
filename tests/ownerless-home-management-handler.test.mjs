import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerlessHomeManagementResponse} from '../lib/ownerless-home-management-handler.mjs';
import {ManagementReauthenticationRequired} from '../lib/ownerless-home-management.mjs';
import {home,re,request,oe} from './fixtures/home-handoff-identifiers.mjs';
const origin='https://ouchi-maintenance.vercel.app',generation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const headers={'authorization':'Bearer synthetic','x-ouchi-app-epoch':re,'content-type':'application/json'};
const body={requestID:request,generation,confirmation:'CLAIM_HOME_MANAGEMENT'};
function fixture(patch={}){
 const calls=[];
 const management=Object.fromEntries(['readStatus','readClaim','claim'].map(name=>[name,async(input,bearer,signal)=>{
  calls.push({name,input,bearer,signal});
  return name==='readStatus'?{kind:'ownerless-home-status/v1',homeID:home,epochID:re,state:'awaiting_management',generation,canClaim:true}:{kind:'ownerless-home-claim/v1',homeID:home,epochID:re,requestID:request,generation,state:name==='readClaim'?'not_recorded':'claimed'};
 }]));
 return {calls,config:{origin,management:{...management,...patch}}};
}
const req=(method='GET',suffix='',value=body)=>new Request(origin+'/api/family/management/'+home+suffix,{method,headers,...(method==='POST'?{body:JSON.stringify(value)}:{})});
test('status and receipt recovery only invoke read ports; explicit claim has no caller-controlled account identity',async()=>{
 const {calls,config}=fixture();
 for(const request of [req(),req('GET','?requestID='+body.requestID+'&generation='+generation),req('POST')]){
  const response=await ownerlessHomeManagementResponse(request,config);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 assert.deepEqual(calls.map(x=>x.name),['readStatus','readClaim','claim']);assert.equal(calls[2].input.homeID,home);assert.equal(calls[2].input.epochID,re);assert.equal(calls[2].bearer,'synthetic');assert.equal('userID' in calls[2].input,false);
});
test('malformed, duplicated and identity-injected input never reaches a port',async()=>{
 const {calls,config}=fixture();
 for(const request of [req('GET','?requestID='+body.requestID),req('GET','?requestID='+body.requestID+'&requestID='+body.requestID),req('POST','',{...body,userID:oe}),req('POST','',{...body,confirmation:'yes'}),req('POST','?retry=true'),req('POST','',{...body,padding:'a'.repeat(3000)})])assert.equal((await ownerlessHomeManagementResponse(request,config)).status,400);
 assert.equal(calls.length,0);
});
test('missing authentication, wrong route/origin and unsupported method are refused',async()=>{
 const {calls,config}=fixture();const missing=new Request(origin+'/api/family/management/'+home);assert.equal((await ownerlessHomeManagementResponse(missing,config)).status,401);
 assert.equal((await ownerlessHomeManagementResponse(new Request('https://example.invalid/api/family/management/'+home,{headers}),config)).status,404);
 assert.equal((await ownerlessHomeManagementResponse(new Request(origin+'/api/family/management/'+home,{method:'DELETE',headers}),config)).status,405);assert.equal(calls.length,0);
});
test('unconfirmed provider content is withheld; recent-auth refusal has an exact private contract',async()=>{
 let f=fixture({claim:async()=>{throw new ManagementReauthenticationRequired();}});let response=await ownerlessHomeManagementResponse(req('POST'),f.config);assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'Additional verification required',code:'additional_verification_required'});
 for(const extra of [{epochID:oe},{debug:'private provider detail'},{state:'not_recorded'}]){
  f=fixture({claim:async()=>({kind:'ownerless-home-claim/v1',homeID:home,epochID:re,requestID:request,generation,state:'claimed',...extra})});response=await ownerlessHomeManagementResponse(req('POST'),f.config);assert.equal(response.status,503);assert.equal((await response.text()).includes('private provider detail'),false);
 }
});
test('deadline ends a hung operation and abort signal reaches its transaction port',async()=>{
 const hold=setTimeout(()=>{},1000);let seen;
 try{const f=fixture({readStatus:async(_input,_bearer,signal)=>{seen=signal;return new Promise(()=>{});}});const result=await ownerlessHomeManagementResponse(req(),{...f.config,timeoutMS:20});assert.equal(result.status,503);assert.equal(seen.aborted,true);}finally{clearTimeout(hold);}
});
