import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createAccountClosureReviewHandler} from '../../lib/account-closure-review-handler.mjs';
import {createAccountClosureReviewRPC} from '../../lib/account-closure-review-rpc.mjs';

/** Disposable GoTrue/PostgREST/PostgreSQL + real loopback HTTP witness only.
 * Existing fixture owns explicit Auth policy and synthetic accounts. This does
 * not provide production effective-policy acquisition, shipping routes or erasure.
 */
export async function verifyDisposableClosureReviewHTTP({db,actor,admin,origin,options,createAttachmentFetch,sessionAfterAuthVerification,portForBearer,handlerFactory}) {
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');
 assert.equal(origin,'http://127.0.0.1:54321');
 const original=(await actor.client.auth.getSession()).data.session.access_token;
 const baselineSessions=(await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows;
 let temporaryCleanups=0,dropReply=false,acceptedDroppedReply=false;
 const reauthenticate=async(email,password,signal)=>{
   const transport=async(input,init)=>{
    const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const cleanup=target.origin===origin&&target.pathname==='/auth/v1/logout'&&target.search==='?scope=local'&&init?.method==='POST';
    return createAttachmentFetch(cleanup?AbortSignal.timeout(5000):signal,5000,65536)(input,init);
   };
   const client=createClient(origin,'synthetic-public-key',{...options,global:{fetch:transport}});
   try {
    const {data,error}=await client.auth.signInWithPassword({email,password});
    return error||!data.session?null:data.user?.id??null;
   } finally {
    // Cleanup uses its own finite budget even when the request is cancelled.
    // Never revoke the original user's other sessions.
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)throw Error('Synthetic reauthentication session cleanup failed');
    temporaryCleanups++;
   }
 };
 const composedHandler=handlerFactory?handlerFactory(reauthenticate):null;
 const handlerForBearer=bearer=>{
  const providers=portForBearer?portForBearer(bearer,reauthenticate):{port:createAccountClosureReviewRPC({client:admin}),reauthenticate};
  return createAccountClosureReviewHandler({
  verify:async(token,signal)=>{
   const client=createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(signal,5000,65536)}});
   const {data,error}=await client.auth.getUser(token);
   if(error||!data.user?.email)return null;
   const bound=sessionAfterAuthVerification(token,data.user.id);
   if(!bound)return null;
   // This disposable instance has explicit no-timebox/no-inactivity/single=false
   // policy. GetUser alone is not a proof of production session-policy validity.
   const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2)::text as epoch',[bound.userID,bound.sessionID])).rows[0]?.epoch;
   if(!epoch)return null;
   return {...bound,epochID:epoch,email:data.user.email};
  },
  reauthenticate:providers.reauthenticate,
  port:providers.port,
 });};
 const server=createServer(async(req,res)=>{
  const action=/^\/api\/account\/closure-review\/(request|read|cancel)$/.exec(req.url??'')?.[1];
  if(!action){res.writeHead(404).end();return;}
  const abort=new AbortController();
  req.once('aborted',()=>abort.abort());
  res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  try {
   const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,
    body:Readable.toWeb(req),duplex:'half',signal:abort.signal});
   const response=await (composedHandler??handlerForBearer(request.headers.get('authorization')?.slice(7)??'synthetic-invalid-token'))(request,action);
   if(action==='request'&&dropReply&&response.status===202){
    dropReply=false;acceptedDroppedReply=true;
    await response.arrayBuffer();res.destroy();return;
   }
   res.writeHead(response.status,Object.fromEntries(response.headers));
   res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();assert.ok(address&&typeof address==='object');
 const base='http://127.0.0.1:'+address.port+'/api/account/closure-review/';
 const submission=randomUUID();
 const post=(action,extra={},token=original)=>fetch(base+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify({expectedEpochID:actor.epoch,submissionID:submission,...extra}),signal:AbortSignal.timeout(10000),redirect:'error'});
 const input={confirmation:'REQUEST_OUCHI_ACCOUNT_DELETION',password:actor.password};
 try {
  if(!portForBearer&&!handlerFactory){
  await db.query("notify pgrst,'reload schema'");
  let ready=false;
  for(let attempt=0;attempt<20;attempt++){
   const result=await admin.rpc('read_maintenance_closure_review',{target_user:actor.user,verified_session:actor.session,expected_epoch:actor.epoch,expected_submission:submission}).retry(false).abortSignal(AbortSignal.timeout(5000));
   if(!result.error){assert.equal(result.data,null);ready=true;break;}
   assert.equal(result.error.code,'PGRST202','Only schema-cache readiness may be retried');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true,'Read route must be available before mutation tests');
  }
  assert.equal((await post('read',{},'synthetic-invalid-token')).status,401);
  assert.equal((await post('request',{...input,password:'wrong-synthetic-password'})).status,403);
  dropReply=true;
  await assert.rejects(post('request',input));
  assert.equal(acceptedDroppedReply,true,'Loss must happen after an actual accepted response, not before Auth or persistence');
  const restored=await post('read');assert.equal(restored.status,200);
  assert.equal(restored.headers.get('cache-control'),'no-store');
  const receipt=await restored.json();assert.equal(receipt.state,'review_required');assert.equal(receipt.kind,'app-closure-review/v2');
  assert.equal(receipt.epochID,actor.epoch);assert.equal(receipt.submissionID,submission);
  const cancelled=await post('cancel',{confirmation:'CANCEL_OUCHI_DELETION_REVIEW'});assert.equal(cancelled.status,200);
  const cancelledReceipt=await cancelled.json();assert.equal(cancelledReceipt.state,'cancelled');
  assert.equal(cancelledReceipt.reviewRequestID,receipt.reviewRequestID);
  const replay=await post('request',input);assert.equal(replay.status,202);assert.deepEqual(await replay.json(),cancelledReceipt);
  const status=await post('read');assert.deepEqual(await status.json(),cancelledReceipt);
  if(!handlerFactory)assert.ok(temporaryCleanups>=3);
  assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baselineSessions,'Temporary Auth sessions must be removed and original session retained');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1 and app_epoch_id=$2 and submission_id=$3',[actor.user,actor.epoch,submission])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests where user_id=$1 and app_epoch_id=$2',[actor.user,actor.epoch])).rows[0].n,0);
  console.log(handlerFactory?'closure-review actual HTTP/Auth/server composition: verified dynamic identity, bound reauthentication, accepted lost reply, reread, cancel, nonce replay, temporary-session cleanup; no deletion job':portForBearer?'closure-review actual HTTP/Auth/pinned transaction: accepted lost reply, reread, cancel, nonce replay, temporary-session cleanup; no deletion job':'closure-review actual HTTP/Auth/RPC: accepted lost reply, reread, cancel, nonce replay, temporary-session cleanup; no deletion job');
  return {reauthenticate};
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
}
