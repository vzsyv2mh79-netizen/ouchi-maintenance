import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccountClosureReviewHandler} from '../lib/account-closure-review-handler.mjs';
import {createAccountClosureReviewRPC} from '../lib/account-closure-review-rpc.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,oe,os} from './fixtures/home-handoff-identifiers.mjs';
const submission='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const who={userID:owner,sessionID:os,epochID:oe,email:'synthetic@example.test'};
const receipt={kind:'app-closure-review/v2',state:'review_required',reviewRequestID:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',epochID:oe,submissionID:submission};
function body(action){return{expectedEpochID:oe,submissionID:submission,...(action==='request'?{password:'synthetic-password',confirmation:'REQUEST_OUCHI_ACCOUNT_DELETION'}:action==='cancel'?{confirmation:'CANCEL_OUCHI_DELETION_REVIEW'}:{})};}
function request(action,patch={},options={}){return new Request('https://example.test/review',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-token'},body:JSON.stringify({...body(action),...patch}),...options});}
function setup(overrides={}){let calls=0;const port=Object.fromEntries(['request','read','cancel'].map(action=>[action,async(scope,signal)=>{calls++;assert.deepEqual(scope,{userID:owner,sessionID:os,epochID:oe,submissionID:submission});assert.equal(signal.aborted,false);return {...receipt,state:action==='cancel'?'cancelled':'review_required'};}]));return{handle:createAccountClosureReviewHandler({verify:async()=>who,reauthenticate:async()=>owner,port,...overrides}),calls:()=>calls};}
test('explicit request, read and cancel return review-only receipts with private cache policy',async()=>{
 const {handle,calls}=setup();for(const action of ['request','read','cancel']){const response=await handle(request(action),action);assert.equal(response.status,action==='request'?202:200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{...receipt,state:action==='cancel'?'cancelled':'review_required'});}assert.equal(calls(),3);
});
test('client identity, extra fields, wrong registration and failed reauthentication cannot submit',async()=>{
 const {handle,calls}=setup();for(const patch of [{userID:recipient},{submissionID:'flag'},{confirmation:'DELETE_ALL_ACCOUNTS'},{password:''}])assert.equal((await handle(request('request',patch),'request')).status,400);
 assert.equal((await handle(request('request',{expectedEpochID:submission}),'request')).status,409);assert.equal(calls(),0);
 const denied=setup({reauthenticate:async()=>recipient});assert.equal((await denied.handle(request('request'),'request')).status,403);assert.equal(denied.calls(),0);
 const expired=setup({verify:async()=>null});assert.equal((await expired.handle(request('read'),'read')).status,401);assert.equal(expired.calls(),0);
 let checks=0;const drift=setup({verify:async()=>++checks===1?who:{...who,userID:recipient}});assert.equal((await drift.handle(request('request'),'request')).status,409);assert.equal(drift.calls(),0);
});
test('bounded late reauthentication and already aborted requests never dispatch a mutation',async()=>{
 let resolve;const slow=setup({timeoutMS:20,reauthenticate:()=>new Promise(done=>{resolve=done;})});const keepAlive=setTimeout(()=>{},200);
 try{assert.equal((await slow.handle(request('request'),'request')).status,503);resolve(owner);await Promise.resolve();assert.equal(slow.calls(),0);}finally{clearTimeout(keepAlive);}
 const controller=new AbortController();controller.abort();const stopped=setup();assert.equal((await stopped.handle(request('request',{}, {signal:controller.signal}),'request')).status,400);assert.equal(stopped.calls(),0);
});
test('receipt mismatch and provider failure never advertise completion or leak credentials',async()=>{
 for(const result of [{...receipt,state:'complete'},{...receipt,submissionID:oe},{...receipt,requestID:submission},null]){const {handle}=setup({port:{request:async()=>result,read:async()=>result,cancel:async()=>result}});const response=await handle(request('request'),'request');assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/synthetic-password|synthetic-token|complete|cccccccc/);}
 const {handle}=setup({port:{request:async()=>{throw Error('secret-provider-data');},read:async()=>null,cancel:async()=>null}});assert.equal((await handle(request('request'),'request')).status,503);const missing=await handle(request('read'),'read');assert.equal(missing.status,404);assert.equal((await missing.json()).state,'review_not_found');
});
test('malformed transport and slow body are bounded before authentication',async()=>{
 let authCalls=0;const {handle}=setup({verify:async()=>{authCalls++;return who;},timeoutMS:20});
 assert.equal((await handle(request('read',{}, {method:'PUT'}),'read')).status,405);
 assert.equal((await handle(new Request('https://example.test/review?user=other',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-token'},body:JSON.stringify(body('read'))}),'read')).status,400);
 assert.equal((await handle(request('read',{padding:'x'.repeat(5000)}),'read')).status,400);
 const stream=new ReadableStream({start(){}});const keepAlive=setTimeout(()=>{},200);try{assert.equal((await handle(new Request('https://example.test/review',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic-token'},body:stream,duplex:'half'}),'read')).status,400);}finally{clearTimeout(keepAlive);}assert.equal(authCalls,0);
});
test('handler and real RPC contract recover a lost SQL acknowledgement then cancel the same stored submission',async()=>{
 const db=await seedHomeHandoffFullSchemaFixture();try{
  await db.exec('reset role');await db.exec(readFileSync('tests/fixtures/account-closure-review.sql','utf8'));await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
  let lost=true;
  const port=createAccountClosureReviewRPC({client:{rpc(name,args){return{retry(value){assert.equal(value,false);return this;},async abortSignal(signal){signal.throwIfAborted();const values=[args.target_user,args.verified_session,args.expected_epoch,args.expected_submission];const value=(await db.query(`select public.${name}($1,$2,$3,$4) as value`,values)).rows[0].value;if(lost){lost=false;throw Error('Lost durable SQL response');}return{data:value,error:null};}};}}});
  // Auth here is synthetic; this proves handler/SDK/full-schema composition, not real endpoint authentication.
  const handle=createAccountClosureReviewHandler({verify:async()=>who,reauthenticate:async()=>owner,port});
  assert.equal((await handle(request('request'),'request')).status,503);
  const recovered=await handle(request('read'),'read');assert.equal(recovered.status,200);const first=await recovered.json();assert.equal(first.submissionID,submission);
  const cancelled=await handle(request('cancel'),'cancel');assert.equal(cancelled.status,200);const final=await cancelled.json();assert.equal(final.state,'cancelled');assert.equal(final.reviewRequestID,first.reviewRequestID);
  const retry=await handle(request('request'),'request');assert.deepEqual(await retry.json(),final);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
