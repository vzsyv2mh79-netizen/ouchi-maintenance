import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync('lib/account-deletion-request.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {handleAccountDeletionRequest:handle}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('deletion request requires identity, explicit confirmation, reauthentication and durable enqueue',async()=>{
 const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
 let reauth=user,ack=id,identity={userID:user,sessionID:session,epochID:epoch,email:'synthetic@example.invalid'},writes=0;
 const deps={verify:async()=>identity,reauthenticate:async(email,password)=>{assert.equal(email,identity.email);assert.equal(password,'synthetic');return reauth;},enqueue:async scope=>{assert.deepEqual(scope,identity);assert.ok(Object.isFrozen(scope));writes++;return ack;}};
 const send=(body={confirmation:'DELETE_OUCHI_ACCOUNT',password:'synthetic'},auth='Bearer synthetic')=>handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:auth},body:JSON.stringify(body)}),deps);
 assert.equal((await send({},'')).status,401);assert.equal((await send({confirmation:'DELETE_OUCHI_ACCOUNT',password:'synthetic',userID:user})).status,400);assert.equal(writes,0);
 reauth=epoch;assert.equal((await send()).status,403);assert.equal(writes,0);reauth=user;
 identity={...identity,epochID:'invalid'};assert.equal((await send()).status,401);assert.equal(writes,0);identity={...identity,epochID:epoch};
 ack=null;assert.equal((await send()).status,503);ack=id;const response=await send();assert.equal(response.status,202);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{state:'pending',requestID:id});
});
test('cancelled partial stream cannot be treated as a confirmed deletion request',async()=>{
 const controller=new AbortController();let verified=0;
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',password:'synthetic'})));}});
 const request=new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body,duplex:'half',signal:controller.signal});
 const pending=handle(request,{verify:async()=>{verified++;return null;},reauthenticate:async()=>null,enqueue:async()=>null});controller.abort();assert.equal((await pending).status,400);assert.equal(verified,0);
});

test('cancellation at each remote boundary stops later stages or requires durable status recovery',async()=>{
 const identity={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',email:'synthetic@example.invalid'};
 const id='44444444-4444-4444-8444-444444444444';
 for(const boundary of ['verify','reauthenticate','enqueue']){
  const controller=new AbortController();const calls=[];
  const finish=(name,value)=>{calls.push(name);if(name===boundary)controller.abort();return value;};
  const response=await handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',password:'synthetic'}),signal:controller.signal}),{
   verify:async()=>finish('verify',identity),reauthenticate:async()=>finish('reauthenticate',identity.userID),enqueue:async()=>finish('enqueue',id),
  });
  assert.equal(response.status,boundary==='reauthenticate'?409:503);
  assert.deepEqual(calls,['verify','reauthenticate','enqueue'].slice(0,['verify','reauthenticate','enqueue'].indexOf(boundary)+1));
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.state,undefined);assert.equal(body.requestID,undefined);
  if(boundary==='enqueue')assert.match(body.error,/Check status before retrying/);
 }
});
