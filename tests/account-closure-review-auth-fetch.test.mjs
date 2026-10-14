import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=name=>ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const {closureReviewAuthFetch}=await import(url(compile('account-closure-review-auth-fetch').replace("'./attachment-fetch'",JSON.stringify(url(compile('attachment-fetch'))))));
const origin='https://abcdefghijklmnopqrst.supabase.co',agent='OuchiMaintenance/closure-reauth/v1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('foreign origins/non-Auth paths never reach transport; SDK cannot change owned marker agent',async()=>{
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async(input,init)=>{calls.push({input,init});return Response.json({ok:true});};
 try{
  const transport=closureReviewAuthFetch(origin,new AbortController().signal,agent);
  for(const target of ['https://foreign.invalid/auth/v1/user',origin+'/rest/v1/homes',origin+'/auth/v1/../../rest/v1/homes'])await assert.rejects(()=>transport(target),/Configured Auth/);
  assert.equal(calls.length,0);await transport(origin+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'User-Agent':'changed-by-sdk'}});
  assert.equal(new Headers(calls[0].init.headers).get('user-agent'),agent);assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.cache,'no-store');
 }finally{globalThis.fetch=saved;}
});
test('cancelled Auth grant is refused while independent cleanup logout remains available',async()=>{
 const saved=globalThis.fetch,controller=new AbortController();let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;init.signal.throwIfAborted();return Response.json({ok:true});};
 try{
  const transport=closureReviewAuthFetch(origin,controller.signal,agent);controller.abort();
  await assert.rejects(()=>transport(origin+'/auth/v1/token?grant_type=password',{method:'POST'}));
  assert.equal((await transport(origin+'/auth/v1/logout?scope=local',{method:'POST'})).status,200);assert.equal(calls,2);
 }finally{globalThis.fetch=saved;}
});
