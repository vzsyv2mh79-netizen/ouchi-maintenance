import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const compiled=new Map();
function compile(name){if(compiled.has(name))return compiled.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(compile(n)));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');compiled.set(name,url);return url;}
const {requestWebClosure:request,refreshWebClosure:refresh,cancelWebClosure:cancel,prepareWebClosureRequest:prepare,prepareWebClosureRetry:prepareRetry,retryWebClosure:retry}=await import(compile('web-closure-review-client'));
const account='11111111-1111-4111-8111-111111111111',epochID='22222222-2222-4222-8222-222222222222',sessionID='33333333-3333-4333-8333-333333333333',reviewID='44444444-4444-4444-8444-444444444444',jobID='55555555-5555-4555-8555-555555555555';
const token='e30.'+Buffer.from(JSON.stringify({sub:account,session_id:sessionID,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
function fixture(){
 const rows=new Map(),reviews=new Map(),progress=new Map(),pointers=new Map(),calls=[];let current={account,token},mode='ok',reserves=0;
 const controller=new AbortController();
 const vault={list:async a=>[...rows.values()].filter(r=>r.account===a),current:async(a,e)=>rows.get(pointers.get(a+'/'+e))??null,
  reserve:async(a,e,prior)=>{reserves++;if(mode==='storage-failure')throw Error('unavailable');assert.equal(pointers.get(a+'/'+e),prior);const r=Object.freeze({kind:'ouchi-web-closure-reference/v1',account:a,epochID:e,submissionID:crypto.randomUUID(),retirementObserved:false});rows.set(r.submissionID,r);pointers.set(a+'/'+e,r.submissionID);if(mode==='abort-after-save')controller.abort();if(mode==='switch-after-save')current=null;return r;},
  markRetirement:async saved=>{if(mode==='mark-failure')throw Error('unavailable');const r=rows.get(saved.submissionID);const next=Object.freeze({...r,retirementObserved:true});rows.set(saved.submissionID,next);return next;}};
 const reply=(url,value,status=200)=>{const r=Response.json(value,{status,headers:{'cache-control':'no-store'}});Object.defineProperty(r,'url',{value:String(url)});return r;};
 const options={account,signal:controller.signal,session:async()=>current,origin:'https://example.invalid',vault,fetcher:async(url,init)=>{
  const path=new URL(url).pathname.split('/').at(-1),body=init.body?JSON.parse(init.body):null;calls.push({path,body,method:init.method});assert.equal(init.headers.Authorization,'Bearer '+token);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  if(path==='enrollment'){assert.equal(init.method,'GET');return reply(url,{userID:account,sessionID,epochID,enrolled:true});}
  assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(body.expectedEpochID,epochID);assert.ok(rows.has(body.submissionID),'Original reference must be saved before any closure request');
  const scope={epochID,submissionID:body.submissionID};
  if(mode==='read-failure'&&path==='progress')return reply(url,{error:'unavailable'},503);
  if(path==='progress')return progress.has(body.submissionID)?reply(url,{kind:'app-closure-progress/v1',...scope,requestID:jobID,state:progress.get(body.submissionID)}):reply(url,{kind:'app-closure-progress/v1',...scope,state:'progress_unavailable'},404);
  if(path==='read')return reviews.has(body.submissionID)?reply(url,{kind:'app-closure-review/v2',...scope,reviewRequestID:reviewID,state:reviews.get(body.submissionID)}):reply(url,{kind:'app-closure-review/v2',...scope,state:'review_not_found'},404);
  if(path==='request'){
   assert.equal(body.confirmation,'REQUEST_OUCHI_ACCOUNT_DELETION');assert.equal(body.password,'synthetic-only-password');if(mode==='auth-rejected')return reply(url,{error:'not confirmed'},503);reviews.set(body.submissionID,'review_required');
   if(mode==='lost-ack')throw Error('reply lost after acceptance');if(mode==='switch-after-write')current=null;
   return reply(url,{kind:'app-closure-review/v2',...scope,reviewRequestID:mode==='wrong-request'?null:reviewID,state:'review_required'},202);
  }
  assert.equal(path,'cancel');assert.equal(body.confirmation,'CANCEL_OUCHI_DELETION_REVIEW');reviews.set(body.submissionID,'cancelled');return reply(url,{kind:'app-closure-review/v2',...scope,reviewRequestID:reviewID,state:mode==='wrong-cancel'?'review_required':'cancelled'});
 }};
 return {options,rows,reviews,progress,calls,controller,mode:v=>{mode=v;},change:v=>{current=v;},reserves:()=>reserves,writeCount:()=>calls.filter(c=>c.path==='request').length};
}
const submit=f=>request({...f.options,password:'synthetic-only-password'});
test('opening form reads existing enrollment only; explicit request persists original scope before its one write',async()=>{
 const f=fixture();assert.equal((await prepare(f.options)).canRequest,true);assert.equal(f.reserves(),0);assert.equal(f.writeCount(),0);
 const {reference,state}=await submit(f);assert.equal(state.receipt.state,'review_required');assert.equal(reference.retirementObserved,false);assert.equal(f.writeCount(),1);assert.equal(f.rows.size,1);
 assert.ok(Object.isFrozen(state.receipt));assert.equal((await prepare(f.options)).canRequest,false);assert.equal(f.writeCount(),1);
});
test('lost acknowledgement is recovered only by reading saved scope; fresh cancellation permits one explicit new submission',async()=>{
 const f=fixture();f.mode('lost-ack');await assert.rejects(()=>submit(f));const original=[...f.rows.values()][0];assert.equal(f.writeCount(),1);
 f.mode('ok');assert.equal((await refresh(f.options,original)).receipt.state,'review_required');await assert.rejects(()=>submit(f));assert.equal(f.writeCount(),1);
 assert.equal((await cancel(f.options,original)).receipt.state,'cancelled');const next=await submit(f);assert.notEqual(next.reference.submissionID,original.submissionID);assert.equal(f.rows.size,2);assert.equal(f.writeCount(),2);
 assert.deepEqual(Object.keys(f.rows.get(original.submissionID)).sort(),['account','epochID','kind','retirementObserved','submissionID']);
});
test('unknown status never repeats a write; observed retirement remains sticky across a reconstructed caller',async()=>{
 const f=fixture();const {reference}=await submit(f);f.reviews.clear();assert.equal((await refresh(f.options,reference)).kind,'unconfirmed');await assert.rejects(()=>submit(f));await assert.rejects(()=>cancel(f.options,reference));assert.equal(f.writeCount(),1);
 f.progress.set(reference.submissionID,'running');assert.equal((await refresh(f.options,reference)).progress.state,'running');assert.equal(f.rows.get(reference.submissionID).retirementObserved,true);
 f.progress.clear();f.reviews.set(reference.submissionID,'review_required');const before=f.calls.filter(c=>c.path==='read').length;
 await assert.rejects(()=>refresh({...f.options},f.rows.get(reference.submissionID)));await assert.rejects(()=>cancel(f.options,reference));await assert.rejects(()=>submit(f));assert.equal(f.calls.filter(c=>c.path==='read').length,before);assert.equal(f.writeCount(),1);
});
test('storage failure, cancellation/account switch after storage, and late switched replies cannot confirm or create another request',async()=>{
 for(const mode of ['storage-failure','abort-after-save','switch-after-save','wrong-request','switch-after-write']){
  const f=fixture();f.mode(mode);await assert.rejects(()=>submit(f),undefined,mode);assert.equal(f.writeCount(),['wrong-request','switch-after-write'].includes(mode)?1:0,mode);
  if(mode!=='storage-failure')assert.equal(f.rows.size,1,mode);
 }
 const f=fixture();f.change(null);await assert.rejects(()=>submit(f));assert.equal(f.calls.length,0);
});
test('cancel rechecks progress first and refuses queued work or an unconfirmed cancel receipt',async()=>{
 const f=fixture();const {reference}=await submit(f);f.progress.set(reference.submissionID,'pending');await assert.rejects(()=>cancel(f.options,reference));assert.equal(f.calls.filter(c=>c.path==='cancel').length,0);
 const g=fixture();const r=(await submit(g)).reference;g.mode('wrong-cancel');await assert.rejects(()=>cancel(g.options,r));assert.equal(g.calls.filter(c=>c.path==='cancel').length,1);
});
test('competing callers cannot reserve two submissions; durable retirement marking failure does not return completion',async()=>{
 const f=fixture();const results=await Promise.allSettled([submit(f),submit(f)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.writeCount(),1);assert.equal(f.rows.size,1);
 const r=[...f.rows.values()][0];f.progress.set(r.submissionID,'complete');f.mode('mark-failure');await assert.rejects(()=>refresh(f.options,r));assert.equal(f.rows.get(r.submissionID).retirementObserved,false);
});

test('rejected authentication can recover explicitly with the same saved number, without another reserve or automatic write',async()=>{
 const f=fixture();f.mode('auth-rejected');await assert.rejects(()=>submit(f));const saved=[...f.rows.values()][0];assert.equal(f.reserves(),1);assert.equal(f.reviews.size,0);assert.equal(f.writeCount(),1);
 f.mode('ok');const prepared=await prepareRetry(f.options,saved);assert.equal(prepared.canRetry,true);assert.equal(prepared.state.kind,'unconfirmed');assert.equal(f.writeCount(),1);assert.equal(f.reserves(),1);
 const result=await retry({...f.options,password:'synthetic-only-password'},saved);assert.equal(result.reference.submissionID,saved.submissionID);assert.equal(result.state.receipt.state,'review_required');assert.equal(f.reserves(),1);assert.equal(f.rows.size,1);assert.equal(f.writeCount(),2);
 assert.equal(new Set(f.calls.filter(c=>c.path==='request').map(c=>c.body.submissionID)).size,1);assert.equal((await prepareRetry(f.options,saved)).canRetry,false);await assert.rejects(()=>retry({...f.options,password:'synthetic-only-password'},saved));assert.equal(f.writeCount(),2);
});
test('same-number recovery refuses changed pointer, retired scope, failed reads and changed login; lost acceptance is read-only',async()=>{
 for(const scenario of ['pointer','retired','failed-read','session']){
  const f=fixture();f.mode('auth-rejected');await assert.rejects(()=>submit(f));const saved=[...f.rows.values()][0];f.mode('ok');
  if(scenario==='pointer')f.options.vault.current=async()=>({...saved,submissionID:jobID});
  if(scenario==='retired')await f.options.vault.markRetirement(saved);
  if(scenario==='failed-read')f.mode('read-failure');
  if(scenario==='session')f.change(null);
  await assert.rejects(()=>retry({...f.options,password:'synthetic-only-password'},saved),undefined,scenario);assert.equal(f.writeCount(),1);assert.equal(f.reserves(),1);
 }
 const f=fixture();f.mode('lost-ack');await assert.rejects(()=>submit(f));const saved=[...f.rows.values()][0];f.mode('ok');assert.equal((await prepareRetry(f.options,saved)).canRetry,false);await assert.rejects(()=>retry({...f.options,password:'synthetic-only-password'},saved));assert.equal(f.writeCount(),1);
});
