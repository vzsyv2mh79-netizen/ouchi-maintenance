import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {createReviewedDeletionPrelude} from '../lib/reviewed-deletion-prelude.mjs';
import {createReviewedFileFinalization} from '../lib/reviewed-file-cleanup.mjs';
import {snapshot} from './fixtures/retirement-rpc-cases.mjs';
const modules=new Map();
function compile(name){
 if(name.endsWith('.mjs'))return import.meta.resolve('../lib/'+name);
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');
 source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
}
const {createAccountDeletionDispatcher}=await import(compile('account-deletion-dispatcher'));
const storage={from:()=>{throw Error('No ordinary Storage operation expected');}};

test('dispatcher refuses missing configuration, ambiguous/malformed/expired claims and concurrent claims before any erasure',async()=>{
 assert.throws(()=>createAccountDeletionDispatcher({clientForRun:()=>({})}),/Complete explicit/);
 for(const data of [undefined,{}, {requestID:'bad'}, {requestID:'11111111-1111-4111-8111-111111111111',userID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',leaseToken:'44444444-4444-4444-8444-444444444444',leaseUntil:'2000-01-01T00:00:00Z'}]){
  const calls=[];
  const d=createAccountDeletionDispatcher({clientForRun:()=>({storage,rpc:async name=>{calls.push(name);return {data};}}),prepareReviewedAttachments:async()=>{throw Error('Must not prepare');}});
  assert.deepEqual(await d.runNext(AbortSignal.timeout(10000)),{state:'unavailable'});assert.deepEqual(calls,['claim_maintenance_account_deletion']);
 }
 let release,calls=0;
 const d=createAccountDeletionDispatcher({clientForRun:()=>({storage,rpc:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return {data:null};}}),prepareReviewedAttachments:async()=>false});
 const first=d.runNext(AbortSignal.timeout(10000));assert.deepEqual(await d.runNext(AbortSignal.timeout(10000)),{state:'busy'});release();assert.deepEqual(await first,{state:'idle'});assert.equal(calls,1);
 const aborted=new AbortController();aborted.abort();assert.deepEqual(await d.runNext(aborted.signal),{state:'unavailable'});assert.equal(calls,1);
});

test('real SQL claimed reviewed job defers on missing retention, resumes once, recovers lost completion and preserves shared Auth/family',async()=>{
 const f=await reviewedCleanupReadyFixture();
 try{
  // The compact file-cleanup fixture predates the Auth-proof lifecycle. Add
  // the established matching candidates before exercising the complete tail.
  for(const name of ['20261014061630_ouchi_closure_reauth_markers.sql','20261014061641_ouchi_closure_reauth_lifecycle.sql','20261014064119_ouchi_closure_review_erasure.sql','20261014231227_ouchi_closure_actor_context_compatibility.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  const original=await snapshot(f.db),calls=[],errors=[];
  // Only the disposable fixture's running lease is expired to make it ready.
  await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.cleanupInput.requestID]);
  let loseCompletion=false;
  const db={storage,rpc:async(name,args={})=>{
   assert.match(name,/^[a-z_]+$/);calls.push(name);
   const values=name==='claim_maintenance_account_deletion'?[]:[args.target_request,args.target_user,args.target_epoch,args.target_lease];
   if(values.length)assert.deepEqual(Object.keys(args).sort(),['target_epoch','target_lease','target_request','target_user']);
   await f.db.exec('set role service_role');
   try{
    const result=await f.db.query('select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') value',values);
    if(name==='complete_maintenance_account_deletion'&&loseCompletion){assert.equal(result.rows[0].value,true);loseCompletion=false;throw Error('Synthetic lost committed completion reply');}
    return {data:result.rows[0].value,error:null};
   }catch(error){errors.push({name,message:error.message});throw error;}finally{await f.db.exec('reset role');}
  }};
  const prelude=createReviewedDeletionPrelude({connect:f.cleanupConnect,cleanup:f.cleanupPort,finalization:createReviewedFileFinalization({connect:f.cleanupConnect})});
  const d=createAccountDeletionDispatcher({clientForRun:()=>db,prepareReviewedAttachments:(scope,signal)=>prelude.prepare(scope,signal)});
  assert.deepEqual(await d.runNext(AbortSignal.timeout(60000)),{state:'pending'});
  const requestID=f.cleanupInput.requestID;
  let job=(await f.db.query('select state,attempts,lease_token from maintenance_private.account_deletion_requests where id=$1',[requestID])).rows[0];
  assert.equal(job.state,'pending');assert.equal(job.attempts,1);assert.equal(job.lease_token,null);
  assert.equal(calls.includes('complete_maintenance_account_deletion'),false);
  assert.equal(f.cleanupCalls(),1);
  // Explicit synthetic sealed retention evidence is a test prerequisite only.
  // The dispatcher has no checker privilege and never writes this table.
  await f.db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-dispatch-test-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[requestID]);
  await f.db.query("update maintenance_private.account_deletion_requests set available_at=clock_timestamp()-interval '1 second' where id=$1",[requestID]);
  loseCompletion=true;const before=calls.length;
  assert.deepEqual(await d.runNext(AbortSignal.timeout(60000)),{state:'complete'},JSON.stringify({calls,errors}));
  assert.equal(calls.slice(before).filter(n=>n==='complete_maintenance_account_deletion').length,1);
  assert.equal(calls.at(-1),'maintenance_deletion_completion_is_confirmed');
  assert.equal(f.cleanupCalls(),1,'No repeated physical cleanup after durable finalization');
  job=(await f.db.query('select state,attempts,lease_token from maintenance_private.account_deletion_requests where id=$1',[requestID])).rows[0];
  assert.deepEqual(job,{state:'complete',attempts:2,lease_token:null});
  assert.deepEqual(await d.runNext(AbortSignal.timeout(60000)),{state:'idle'});
  const after=await snapshot(f.db);
  for(const table of ['auth.users','auth.sessions','public.homes','public.products','public.maintenance_tasks','public.maintenance_history'])assert.equal(after[table],original[table],table);
  assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
 }finally{await f.db.close();}
});
