import test from 'node:test';
import assert from 'node:assert/strict';
import {homeHandoffResponse,HomeHandoffRefusal,HomeHandoffAdditionalVerificationRequired} from '../lib/home-handoff-handler.mjs';
const origin='https://ouchi-maintenance.vercel.app',requestID='66666666-6666-4666-8666-666666666666',homeID='44444444-4444-4444-8444-444444444444';
const userID='11111111-1111-4111-8111-111111111111',recipientID='22222222-2222-4222-8222-222222222222',epochID='99999999-9999-4999-8999-999999999999',sessionID='77777777-7777-4777-8777-777777777777';
const status=state=>({requestID,homeID,state,expiresAt:'2099-01-01T00:00:00Z'});
const req=(method='GET',value,options={})=>new Request(origin+'/api/family/handoff/'+requestID+(options.query??''),{method,headers:{authorization:'Bearer synthetic','X-Ouchi-App-Epoch':epochID,'content-type':'application/json',...options.headers},body:value===undefined?undefined:JSON.stringify(value),signal:options.signal});
const ports=(changes={})=>({origin,verifyCurrent:async()=>({userID,sessionID,epochID}),read:async()=>status('pending'),create:async()=>status('pending'),decide:async()=>status('completed'),...changes});

test('verified session/epoch scope alone reaches ports; readback is no-store and GET never mutates',async()=>{
 const seen=[];const config=ports({verifyCurrent:async(token,signal)=>{assert.equal(token,'synthetic');assert.equal(signal.aborted,false);return{userID,sessionID,epochID};},read:async scope=>{seen.push(scope);return status('pending');},create:async scope=>{seen.push(scope);return status('pending');},decide:async scope=>{seen.push(scope);return status('completed');}});
 for(const [method,value] of [['GET',undefined],['POST',{homeID,recipientID}],['PUT',{accept:true}]]){
  const response=await homeHandoffResponse(req(method,value),config);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).requestID,requestID);
 }
 assert.deepEqual(seen,[{requestID,userID,sessionID,epochID},{requestID,userID,sessionID,epochID,homeID,recipientID},{requestID,userID,sessionID,epochID,accept:true}]);
});

test('unverified identity, wrong epoch, malformed scope/body and query never reach a mutation',async()=>{
 let writes=0;const create=async()=>{writes++;return status('pending');};
 for(const [request,config,expected] of [
  [req('POST',{homeID,recipientID,userID}),ports({create}),400],
  [req('POST',{homeID,recipientID}),ports({create,verifyCurrent:async()=>null}),401],
  [req('POST',{homeID,recipientID}),ports({create,verifyCurrent:async()=>({userID,sessionID,epochID:recipientID})}),401],
  [req('POST',{homeID,recipientID},{query:'?userID='+recipientID}),ports({create}),404],
  [req('POST',{homeID,recipientID},{headers:{authorization:'Bearer synthetic, foreign'}}),ports({create}),401],
  [req('POST',{homeID,recipientID:userID}),ports({create}),400],
  [req('PUT',{accept:'yes'}),ports({decide:create}),400],
 ])assert.equal((await homeHandoffResponse(request,config)).status,expected);
 assert.equal(writes,0);
});

test('lost decision acknowledgement stays unconfirmed; read recovers original committed result without another mutation',async()=>{
 let state='pending',writes=0;
 const config=ports({read:async()=>status(state),decide:async()=>{writes++;state='completed';throw Error('Lost acknowledgement');}});
 const lost=await homeHandoffResponse(req('PUT',{accept:true}),config);assert.equal(lost.status,503);assert.deepEqual(await lost.json(),{error:'Handoff result unconfirmed'});
 const recovered=await homeHandoffResponse(req(),config);assert.equal(recovered.status,200);assert.equal((await recovered.json()).state,'completed');assert.equal(writes,1);
});

test('foreign/unavailable read and malformed success never claim completion; attachment refusal is operation-only',async()=>{
 assert.equal((await homeHandoffResponse(req(),ports({read:async()=>null}))).status,404);
 for(const result of [{...status('completed'),homeID:recipientID},{...status('pending'),extra:true},status('unknown')])assert.equal((await homeHandoffResponse(req('POST',{homeID,recipientID}),ports({create:async()=>result}))).status,503);
 assert.equal((await homeHandoffResponse(req('PUT',{accept:true}),ports({decide:async()=>status('pending')}))).status,503);
 const refusal=()=>{throw new HomeHandoffRefusal('attachment_handoff_required');};
 const rejected=await homeHandoffResponse(req('PUT',{accept:true}),ports({decide:refusal}));assert.equal(rejected.status,409);assert.equal((await rejected.json()).code,'attachment_handoff_required');
 assert.equal((await homeHandoffResponse(req('PUT',{accept:true}),ports({verifyCurrent:refusal}))).status,503);
});

test('abort during identity or body read cannot start a mutation',async()=>{
 const controller=new AbortController();let writes=0;
 const config=ports({verifyCurrent:async()=>{controller.abort();return{userID,sessionID,epochID};},create:async()=>{writes++;return status('pending');}});
 assert.equal((await homeHandoffResponse(req('POST',{homeID,recipientID},{signal:controller.signal}),config)).status,503);assert.equal(writes,0);
 const bodyController=new AbortController();let cancelled=false;
 const stream=new ReadableStream({start(){},cancel(){cancelled=true;}});
 const streaming=new Request(origin+'/api/family/handoff/'+requestID,{method:'POST',headers:{authorization:'Bearer synthetic','X-Ouchi-App-Epoch':epochID,'content-type':'application/json'},body:stream,duplex:'half',signal:bodyController.signal});
 const result=homeHandoffResponse(streaming,ports({create:async()=>{writes++;return status('pending');}}));bodyController.abort();
 assert.equal((await result).status,503);assert.equal(cancelled,true);assert.equal(writes,0);
});

test('identity deadline returns unconfirmed without entering the mutation port',async()=>{
 let writes=0,observed;
 const keepAlive=setTimeout(()=>{},100);
 try{
  const result=await homeHandoffResponse(req('POST',{homeID,recipientID}),ports({timeoutMS:5,verifyCurrent:async(token,signal)=>{observed=signal;return await new Promise(()=>{});},create:async()=>{writes++;return status('pending');}}));
  assert.equal(result.status,503);assert.equal(observed.aborted,true);assert.equal(writes,0);
 }finally{clearTimeout(keepAlive);}
});

test('trusted identity MFA refusal never mutates; an operation failure cannot masquerade as an MFA refusal',async()=>{
 let writes=0;const refusal=async()=>{throw new HomeHandoffAdditionalVerificationRequired();};
 const denied=await homeHandoffResponse(req('POST',{homeID,recipientID}),ports({verifyCurrent:refusal,create:async()=>{writes++;return status('pending');}}));
 assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{error:'Additional verification required',code:'additional_verification_required'});assert.equal(writes,0);
 assert.equal((await homeHandoffResponse(req('POST',{homeID,recipientID}),ports({create:refusal}))).status,503);
});
