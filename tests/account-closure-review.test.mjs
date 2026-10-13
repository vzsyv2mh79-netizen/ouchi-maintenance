import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,oe,os,rs} from './fixtures/home-handoff-identifiers.mjs';
import {createAccountClosureReviewRPC} from '../lib/account-closure-review-rpc.mjs';
const sql=readFileSync('tests/fixtures/account-closure-review.sql','utf8');
const args=[owner,os,oe];
const call=(db,verb='request',values=args)=>db.query(`select public.${verb==='request'?'request':'read'}_maintenance_closure_review($1,$2,$3) as value`,values);
async function fixture(){const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');await db.exec(sql);return db;}
async function family(db){
 const result={};for(const table of ['homes','home_members','products','maintenance_tasks','maintenance_history'])result[table]=(await db.query(`select to_jsonb(t) as value from public.${table} t order by to_jsonb(t)::text`)).rows;
 result.access=(await db.query('select * from maintenance_private.account_access order by user_id')).rows;
 result.jobs=(await db.query('select id,user_id,app_epoch_id,state from maintenance_private.account_deletion_requests order by id')).rows;
 return result;
}
test('shared owner can durably initiate review without family consent, closing access, enqueuing deletion or erasing records',async()=>{
 const db=await fixture();try{
  const before=await family(db);
  await db.exec('set role service_role');await assert.rejects(call(db),/Review intake unavailable/);
  await db.exec('reset role;update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
  const first=(await call(db)).rows[0].value;assert.equal(first.kind,'app-closure-review/v1');assert.equal(first.state,'review_required');assert.equal(first.epochID,oe);assert.ok(first.reviewRequestID);assert.equal(first.requestID,undefined);
  const stored=(await db.query('select review_request_id,requested_at from maintenance_private.account_closure_reviews')).rows[0];
  assert.deepEqual((await call(db)).rows[0].value,first);assert.deepEqual((await call(db,'read')).rows[0].value,first);
  await db.exec('reset role;update maintenance_private.account_closure_review_policy set enabled=false;set role service_role');
  assert.deepEqual((await call(db)).rows[0].value,first);assert.deepEqual((await call(db,'read')).rows[0].value,first);
  assert.deepEqual((await db.query('select review_request_id,requested_at from maintenance_private.account_closure_reviews')).rows[0],stored);
  await db.exec('reset role');assert.deepEqual(await family(db),before);
 }finally{await db.close();}
});
test('review scope cannot substitute another member, epoch, expired session, browser role or change its enabling policy',async()=>{
 const db=await fixture();try{
  await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
  for(const values of [[owner,rs,oe],[recipient,os,oe],[owner,os,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],[null,os,oe]])await assert.rejects(call(db,'request',values),/Current app session required|Invalid review identity/);
  await assert.rejects(db.query('update maintenance_private.account_closure_review_policy set enabled=false'),/permission denied/);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);await assert.rejects(call(db),/permission denied/);await assert.rejects(db.query('select * from maintenance_private.account_closure_reviews'),/permission denied/);
  }
  await db.exec("reset role;update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='"+os+"';set role service_role");
  await assert.rejects(call(db),/Current app session required/);await assert.rejects(call(db,'read'),/Current app session required/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews')).rows[0].n,0);
 }finally{await db.close();}
});
test('a real deletion job supersedes review intake and is never reported as review-only or complete',async()=>{
 const db=await fixture();try{
  await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');await call(db);
  // Disposable authoritative race witness: an independent reviewed dispatcher
  // has persisted a real job. This does not implement that dispatcher.
  await db.query('insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id) values($1,$2)',[owner,oe]);
  await assert.rejects(call(db),/Deletion already requested/);await assert.rejects(call(db,'read'),/Deletion already requested/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews')).rows[0].n,1);
 }finally{await db.close();}
});
test('RPC intake uses exact verified scopes, bounded non-retrying transport and distinct truthful review receipts',async()=>{
 const scope={userID:owner,sessionID:os,epochID:oe},signal=new AbortController().signal,calls=[];
 let data={kind:'app-closure-review/v1',state:'review_required',reviewRequestID:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',epochID:oe};
 const port=createAccountClosureReviewRPC({client:{rpc(name,args){calls.push(name);assert.deepEqual(args,{target_user:owner,verified_session:os,expected_epoch:oe});return{retry(value){assert.equal(value,false);return this;},abortSignal(value){assert.ok(value instanceof AbortSignal);assert.equal(value.aborted,false);return Promise.resolve({data,error:null});}};}}});
 const first=await port.request(scope,signal);assert.equal(Object.isFrozen(first),true);assert.equal(first.requestID,undefined);assert.deepEqual(await port.read(scope,signal),first);
 data=null;assert.equal(await port.read(scope,signal),null);await assert.rejects(port.request(scope,signal),/unconfirmed/);
 for(const patch of [{state:'complete'},{epochID:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},{requestID:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}]){data={...first,...patch};await assert.rejects(port.request(scope,signal),/unconfirmed/);}
 const before=calls.length;await assert.rejects(port.request({...scope,userID:'client-flag'},signal),/scope required/);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(port.request(scope,cancelled.signal));assert.equal(calls.length,before);
});
test('a late response cannot acknowledge a changed identity and no automatic retry is dispatched',async()=>{
 const scope={userID:owner,sessionID:os,epochID:oe};let resolve,calls=0;
 const port=createAccountClosureReviewRPC({client:{rpc(name,args){calls++;assert.equal(args.target_user,owner);return{retry(){return this;},abortSignal(){return new Promise(done=>{resolve=done;});}};}}});
 const pending=port.request(scope,new AbortController().signal);scope.userID=recipient;
 resolve({data:{kind:'app-closure-review/v1',state:'review_required',reviewRequestID:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',epochID:oe},error:null});
 await assert.rejects(pending,/identity changed/);assert.equal(calls,1);
});
test('deadline and caller cancellation bound an uncooperative RPC without confirming absence or completion',async()=>{
 for(const manual of [false,true]){
  const controller=new AbortController();let sdkSignal,calls=0,resolve;
  const port=createAccountClosureReviewRPC({timeoutMS:30,client:{rpc(){calls++;return{retry(){return this;},abortSignal(signal){sdkSignal=signal;return new Promise(done=>{resolve=done;});}};}}});
  const pending=port.read({userID:owner,sessionID:os,epochID:oe},controller.signal);
  if(manual)controller.abort();
  // Keep the test alive independently of AbortSignal.timeout's unref timer.
  const keepAlive=setTimeout(()=>{},200);
  try{await assert.rejects(pending);assert.equal(sdkSignal.aborted,true);assert.equal(calls,1);resolve({data:null,error:null});}
  finally{clearTimeout(keepAlive);}
 }
});
