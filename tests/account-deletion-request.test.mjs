import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync('lib/account-deletion-request.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {handleAccountDeletionRequest:handle,DeletionFamilyHandoffRequiredError}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('wrong method and query refuse deletion before authentication or reauthentication',async()=>{
 let calls=0;const unused=async()=>{calls++;throw Error('must not call');};
 const deps={verify:unused,reauthenticate:unused,enqueue:unused};
 for(const method of ['GET','PUT','DELETE'])assert.equal((await handle(new Request('https://example.invalid/deletion',{method}),deps)).status,405);
 assert.equal((await handle(new Request('https://example.invalid/deletion?retry=1',{method:'POST',body:'{}'}),deps)).status,400);
 assert.equal(calls,0);
});
test('deletion request requires identity, explicit confirmation, reauthentication and durable enqueue',async()=>{
 const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
 let reauth=user,ack=id,identity={userID:user,sessionID:session,epochID:epoch,email:'synthetic@example.invalid'},writes=0;
 const deps={verify:async()=>identity,reauthenticate:async(email,password)=>{assert.equal(email,identity.email);assert.equal(password,'synthetic');return reauth;},enqueue:async scope=>{assert.deepEqual(scope,identity);assert.ok(Object.isFrozen(scope));writes++;return ack;}};
 const send=(body={confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:'33333333-3333-4333-8333-333333333333',password:'synthetic'},auth='Bearer synthetic')=>handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:auth},body:JSON.stringify(body)}),deps);
 assert.equal((await send({},'')).status,401);assert.equal((await send({confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:'33333333-3333-4333-8333-333333333333',password:'synthetic',userID:user})).status,400);assert.equal(writes,0);
 reauth=epoch;assert.equal((await send()).status,403);assert.equal(writes,0);reauth=user;
 identity={...identity,epochID:'invalid'};assert.equal((await send()).status,401);assert.equal(writes,0);identity={...identity,epochID:epoch};
 ack=null;assert.equal((await send()).status,503);ack=id;const response=await send();assert.equal(response.status,202);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{state:'pending',requestID:id,epochID:epoch});
});
test('cancelled partial stream cannot be treated as a confirmed deletion request',async()=>{
 const controller=new AbortController();let verified=0;
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:'33333333-3333-4333-8333-333333333333',password:'synthetic'})));}});
 const request=new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body,duplex:'half',signal:controller.signal});
 const pending=handle(request,{verify:async()=>{verified++;return null;},reauthenticate:async()=>null,enqueue:async()=>null});controller.abort();assert.equal((await pending).status,400);assert.equal(verified,0);
});

test('cancellation at each remote boundary stops later stages or requires durable status recovery',async()=>{
 const identity={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',email:'synthetic@example.invalid'};
 const id='44444444-4444-4444-8444-444444444444';
 for(const boundary of ['verify','reauthenticate','enqueue']){
  const controller=new AbortController();const calls=[];
  const finish=(name,value)=>{calls.push(name);if(name===boundary)controller.abort();return value;};
  const response=await handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:'33333333-3333-4333-8333-333333333333',password:'synthetic'}),signal:controller.signal}),{
   verify:async()=>finish('verify',identity),reauthenticate:async()=>finish('reauthenticate',identity.userID),enqueue:async()=>finish('enqueue',id),
  });
  assert.equal(response.status,boundary==='reauthenticate'?409:503);
  assert.deepEqual(calls,['verify','reauthenticate','enqueue'].slice(0,['verify','reauthenticate','enqueue'].indexOf(boundary)+1));
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.state,undefined);assert.equal(body.requestID,undefined);
  if(boundary==='enqueue')assert.match(body.error,/Check status before retrying/);
 }
});

test('stale epoch refuses reauthentication and enqueue; missing epoch is not accepted',async()=>{
 const userID='11111111-1111-4111-8111-111111111111',sessionID='22222222-2222-4222-8222-222222222222';
 let later=0;
 const deps={verify:async()=>({userID,sessionID,email:'synthetic@example.invalid',epochID:'44444444-4444-4444-8444-444444444444'}),reauthenticate:async()=>{later++;return userID;},enqueue:async()=>{later++;return userID;}};
 const send=body=>handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(body)}),deps);
 assert.equal((await send({confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:'33333333-3333-4333-8333-333333333333',password:'synthetic'})).status,409);
 assert.equal((await send({confirmation:'DELETE_OUCHI_ACCOUNT',password:'synthetic'})).status,400);assert.equal(later,0);
});
test('verified identity is snapshotted before asynchronous reauthentication',async()=>{
 const identity={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',email:'synthetic@example.invalid',epochID:'33333333-3333-4333-8333-333333333333'};
 const original={...identity};let enqueued=false;
 const response=await handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:identity.epochID,password:'synthetic'})}),{
 verify:async()=>identity,reauthenticate:async()=>{identity.epochID='44444444-4444-4444-8444-444444444444';return identity.userID;},enqueue:async fixed=>{assert.deepEqual(fixed,original);assert.ok(Object.isFrozen(fixed));enqueued=true;return null;}});
 assert.equal(response.status,503);assert.equal(enqueued,true); // Adapter must recheck the original epoch; never submit the new one.
});

test('family handoff refusal is reported only by a verified enqueue, without implying acceptance',async()=>{
 const identity={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',email:'synthetic@example.invalid',epochID:'33333333-3333-4333-8333-333333333333'};
 for(const stage of ['verify','enqueue','generic','aborted']){
  const controller=new AbortController(),calls=[];
  const response=await handle(new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',expectedEpochID:identity.epochID,password:'synthetic'}),signal:controller.signal}),{
   verify:async()=>{calls.push('verify');if(stage==='verify')throw new DeletionFamilyHandoffRequiredError();return identity;},
   reauthenticate:async()=>{calls.push('reauthenticate');return identity.userID;},
   enqueue:async()=>{calls.push('enqueue');if(stage==='aborted')controller.abort();if(stage==='generic')throw Error('Family handoff required');throw new DeletionFamilyHandoffRequiredError();},
  });
  assert.equal(response.status,stage==='enqueue'?409:503);const result=await response.json();
  assert.equal(result.requestID,undefined);assert.equal(result.state,undefined);assert.equal(response.headers.get('cache-control'),'no-store');
  if(stage==='enqueue'){assert.equal(result.code,'family_handoff_required');assert.deepEqual(calls,['verify','reauthenticate','enqueue']);}
  else assert.equal(result.code,undefined);
 }
});
