import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compiled=new Map();
function compile(name){if(compiled.has(name))return compiled.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>'from '+JSON.stringify(compile(dependency)));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');compiled.set(name,url);return url;}
const {readWebClosureProgress:run}=await import(compile('web-closure-progress-client'));
const account='11111111-1111-4111-8111-111111111111',epochID='22222222-2222-4222-8222-222222222222',submissionID='33333333-3333-4333-8333-333333333333',requestID='44444444-4444-4444-8444-444444444444';
const saved={account,epochID,submissionID},receipt={kind:'app-closure-progress/v1',epochID,submissionID,requestID,state:'complete'};
function fixture(transform=(r)=>r){
 const controller=new AbortController();let current={account,token:'synthetic-only'},calls=0;
 const options={saved:{...saved},session:async()=>current,signal:controller.signal,origin:'https://example.invalid',fetcher:async(url,init)=>{
  calls++;assert.equal(String(url),'https://example.invalid/api/account/closure-review/progress');assert.equal(init.method,'POST');
  assert.equal(init.headers.Authorization,'Bearer synthetic-only');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  assert.deepEqual(JSON.parse(init.body),{expectedEpochID:epochID,submissionID});
  const result=Response.json(receipt,{headers:{'Cache-Control':'no-store'}});Object.defineProperty(result,'url',{value:String(url)});
  return transform(result,{controller,change:value=>{current=value;},options});
 }};return {options,controller,calls:()=>calls,change:value=>{current=value;}};
}
test('existing submission read returns only exact canonical progress without enrollment or new IDs',async()=>{
 for(const state of ['pending','running','complete','failed']){
  const f=fixture(r=>{const result=Response.json({...receipt,state},{headers:{'cache-control':'no-store'}});Object.defineProperty(result,'url',{value:r.url});return result;});
  const result=await run(f.options);assert.deepEqual(result,{...receipt,state});assert.ok(Object.isFrozen(result));assert.equal(f.calls(),1);assert.deepEqual(f.options.saved,saved);
 }
});
test('HTTP uncertainty, wrong identity, redirected/cached or malformed responses never confirm completion',async()=>{
 for(const status of [401,403,404,409,500,503]){
  const f=fixture(r=>{const result=Response.json({state:'complete'},{status,headers:{'cache-control':'no-store'}});Object.defineProperty(result,'url',{value:r.url});return result;});
  await assert.rejects(()=>run(f.options));assert.equal(f.calls(),1);
 }
 for(const altered of [{epochID:requestID},{submissionID:requestID},{requestID:account.toUpperCase()},{state:'retirement_queued'},{account},{state:null},{kind:'deletion-receipt/v2'}]){
  // Use an alphabetic UUID for a genuinely non-canonical uppercase identifier.
  if('requestID' in altered)altered.requestID='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const f=fixture(r=>{const result=Response.json({...receipt,...altered},{headers:{'cache-control':'no-store'}});Object.defineProperty(result,'url',{value:r.url});return result;});
  await assert.rejects(()=>run(f.options));assert.equal(f.calls(),1);
 }
 for(const mode of ['redirect','cache','type','length','large','json','utf8']){
  const f=fixture(r=>{
   if(mode==='redirect'){Object.defineProperty(r,'redirected',{value:true});return r;}
   if(mode==='cache'){r.headers.set('cache-control','public');return r;}
   if(mode==='type'){r.headers.set('content-type','text/html');return r;}
   if(mode==='length'){r.headers.set('content-length','1');return r;}
   const result=new Response(mode==='large'?'x'.repeat(4097):mode==='utf8'?new Uint8Array([255]):'{', {headers:{'cache-control':'no-store','content-type':'application/json'}});Object.defineProperty(result,'url',{value:r.url});return result;
  });await assert.rejects(()=>run(f.options));
 }
});
test('late completion after account/token changes, cancellation or mutated caller scope cannot be applied',async()=>{
 for(const mode of ['account','token','logout','abort','mutate-input']){
  const f=fixture((r,ctx)=>{
   if(mode==='account')ctx.change({account:requestID,token:'synthetic-only'});
   if(mode==='token')ctx.change({account,token:'replacement-synthetic'});
   if(mode==='logout')ctx.change(null);
   if(mode==='abort')ctx.controller.abort();
   if(mode==='mutate-input')ctx.options.saved.submissionID=requestID;
   return r;
  });
  if(mode==='mutate-input')assert.deepEqual(await run(f.options),receipt);else await assert.rejects(()=>run(f.options));
  assert.equal(f.calls(),1);
 }
 const f=fixture();f.controller.abort();await assert.rejects(()=>run(f.options));assert.equal(f.calls(),0);
 const other=fixture();other.change({account:requestID,token:'synthetic-only'});await assert.rejects(()=>run(other.options));assert.equal(other.calls(),0);
});
test('abort bounds a hung session provider or response stream without any retry or write',async()=>{
 const f=fixture();f.options.session=()=>new Promise(()=>{});const promise=run(f.options);f.controller.abort();await assert.rejects(promise);assert.equal(f.calls(),0);
 let opened;const waiting=new Promise(resolve=>{opened=resolve;});
 const g=fixture(r=>{const result=new Response(new ReadableStream({start(){opened();}}),{headers:{'cache-control':'no-store','content-type':'application/json'}});Object.defineProperty(result,'url',{value:r.url});return result;});
 const reading=run(g.options);await waiting;g.controller.abort();await assert.rejects(reading);assert.equal(g.calls(),1);
});
