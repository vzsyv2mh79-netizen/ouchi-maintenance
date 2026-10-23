import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {createReviewedFileFinalization} from '../lib/reviewed-file-cleanup.mjs';
import {createReviewedDeletionPrelude} from '../lib/reviewed-deletion-prelude.mjs';
import {rs} from './fixtures/home-handoff-identifiers.mjs';
const modules=new Map();function compile(name){if(name.endsWith('.mjs'))return import.meta.resolve('../lib/'+name);if(modules.has(name))return modules.get(name);let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;}
const {createClosureSubmissionProgressServer}=await import(compile('closure-submission-progress'));
const {closureSubmissionProgressDeployment}=await import(compile('closure-submission-progress-deployment'));
async function read(f,{user=f.scope.userID,session=rs,epoch=f.scope.epochID,submission=f.submission,claim=user}={}){
 await f.db.exec('begin;set local role ouchi_closure_progress_reader');try{
  await f.db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:claim}),claim]);
  const r=await f.db.query('select maintenance_private.read_closure_submission_progress($1,$2,$3,$4) receipt',[user,session,epoch,submission]);await f.db.exec('commit');return r.rows[0].receipt;
 }catch(e){await f.db.exec('rollback');throw e;}
}
test('saved submission discovers real job immediately after app closure without confusing review ID or granting app access',async()=>{
 const f=await reviewedCleanupReadyFixture();try{
  const r=await read(f);assert.equal(r.kind,'app-closure-progress/v1');assert.equal(r.requestID,f.execute.eventID);assert.notEqual(r.requestID,f.scope.reviewRequestID);assert.equal(r.submissionID,f.submission);assert.equal(r.state,'running');assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[f.scope.userID])).rows[0].enabled,false);
  for(const scope of [{submission:randomUUID()},{epoch:randomUUID()},{session:randomUUID()},{user:randomUUID()}])assert.equal(await read(f,scope),null);
  await assert.rejects(read(f,{claim:randomUUID()}),/Verified submission identity/);
 }finally{await f.db.close();}
});
test('bridge survives reviewed metadata erasure and follows finite receipt-session snapshot after identity mapping removal',async()=>{
 const f=await reviewedCleanupReadyFixture();try{
  const prelude=createReviewedDeletionPrelude({connect:f.cleanupConnect,cleanup:f.cleanupPort,finalization:createReviewedFileFinalization({connect:f.cleanupConnect})}),scope={requestID:f.execute.eventID,userID:f.scope.userID,epochID:f.scope.epochID,leaseToken:f.cleanupInput.leaseToken};await prelude.prepare(scope,f.signal);
  const args=Object.values(scope);await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) ok',args)).rows[0].ok,true);assert.equal((await f.db.query('select public.capture_maintenance_deletion_receipt_sessions($1,$2,$3,$4) ok',args)).rows[0].ok,true);assert.equal((await f.db.query('select public.erase_reviewed_retirement_metadata($1,$2,$3,$4) ok',args)).rows[0].ok,true);await f.db.exec('reset role');
  // Privileged fixture models subsequent scoped identity erasure. Actual worker
  // integration verifies canonical identity/completion in the service fixture.
  for(const table of ['account_closure_reviews','app_session_epochs','app_epochs','account_access'])await f.db.query('delete from maintenance_private.'+table+' where user_id=$1',[f.scope.userID]);
  assert.equal((await read(f)).requestID,f.execute.eventID);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_submission_jobs')).rows[0].n,1);
  await f.db.query('delete from maintenance_private.deletion_receipt_sessions where request_id=$1',[f.execute.eventID]);assert.equal(await read(f),null);
 }finally{await f.db.close();}
});
test('expired/revoked original sessions and unbound identities cannot read progress; minimum role has no raw table access',async()=>{
 const f=await reviewedCleanupReadyFixture();try{
  await f.db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[rs]);assert.equal(await read(f),null);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_progress_reader']){
   await f.db.exec('set role '+role);for(const table of ['maintenance_private.closure_submission_jobs',...(role==='ouchi_closure_progress_reader'?['auth.sessions','auth.users']:[])])await assert.rejects(f.db.exec('select * from '+table),/permission denied/);await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});
function request(body,token,method='POST'){return new Request('https://example.invalid/api/account/closure-review/progress',{method,headers:{'content-type':'application/json',authorization:'Bearer '+token},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
function bearer(user,session){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return enc({alg:'HS256'})+'.'+enc({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})+'.synthetic';}
test('handler derives actor/session only from fresh verified bearer and works after enrollment is disabled',async()=>{
 const f=await reviewedCleanupReadyFixture();try{
  let authCalls=0;const token=bearer(f.scope.userID,rs),handler=createClosureSubmissionProgressServer({enabled:true,connect:f.connect,getUser:async(value,signal)=>{assert.equal(value,token);signal.throwIfAborted();authCalls++;return {data:{user:{id:f.scope.userID}},error:null};}});
  const body={expectedEpochID:f.scope.epochID,submissionID:f.submission};const r=await handler(request(body,token));assert.equal(r.status,200);assert.equal((await r.json()).requestID,f.execute.eventID);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(authCalls,1);
  assert.equal((await handler(request({...body,userID:f.scope.userID},token))).status,400);
  const unavailable=await handler(request({...body,submissionID:randomUUID()},token));assert.equal(unavailable.status,404);assert.equal((await unavailable.json()).state,'progress_unavailable');
  assert.equal((await handler(request(body,token,'GET'))).status,405);
 }finally{await f.db.close();}
});
test('deployment requires separate read-only runtime credentials and explicit approval, never generic service fallback',()=>{
 const project='abcdefghijklmnopqrst',env={OUCHI_CLOSURE_PROGRESS_ENABLED:'true',OUCHI_CLOSURE_PROGRESS_DEPLOYMENT_APPROVED:'true',OUCHI_CLOSURE_PROGRESS_PROJECT_REF:project,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',NEXT_PUBLIC_SUPABASE_URL:`https://${project}.supabase.co`,OUCHI_CLOSURE_PROGRESS_DATABASE_URL:`postgres://ouchi_closure_progress_runtime:synthetic@db.${project}.supabase.co/postgres`};
 assert.equal(closureSubmissionProgressDeployment(env).database.ssl.rejectUnauthorized,true);
 for(const change of [{OUCHI_CLOSURE_PROGRESS_DEPLOYMENT_APPROVED:'false'},{OUCHI_CLOSURE_PROGRESS_DATABASE_URL:undefined,SUPABASE_SERVICE_ROLE_KEY:'synthetic'},{OUCHI_CLOSURE_PROGRESS_DATABASE_URL:`postgres://postgres:synthetic@db.${project}.supabase.co/postgres`},{NEXT_PUBLIC_SUPABASE_URL:'https://foreign.invalid'}])assert.equal(closureSubmissionProgressDeployment({...env,...change}),null);
});
