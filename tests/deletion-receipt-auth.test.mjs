import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/deletion-receipt-auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {createDeletionReceiptGetUser}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const user='11111111-1111-4111-8111-111111111111';
test('request-scoped SDK getUser sends exact bearer with redirect, cache and cancellation bounds',async()=>{
 let calls=0;
 const getUser=createDeletionReceiptGetUser({supabaseURL:'https://auth.example.invalid',publishableKey:'synthetic-public-key',fetcher:async(input,init)=>{
  calls++;assert.equal(String(input),'https://auth.example.invalid/auth/v1/user');
  assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-bearer');
  assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);
  return Response.json({id:user});
 }});
 const result=await getUser('synthetic-bearer',new AbortController().signal);
 assert.equal(result.error,null);assert.equal(result.data.user.id,user);assert.equal(calls,1);
});
test('insecure and credential-bearing origins are rejected; loopback requires explicit isolation',()=>{
 for(const supabaseURL of ['http://example.invalid','https://user:password@example.invalid','https://example.invalid/path','https://example.invalid?query=1'])
  assert.throws(()=>createDeletionReceiptGetUser({supabaseURL,publishableKey:'synthetic-public-key'}));
 assert.throws(()=>createDeletionReceiptGetUser({supabaseURL:'http://127.0.0.1:54321',publishableKey:'synthetic-public-key'}));
 assert.doesNotThrow(()=>createDeletionReceiptGetUser({supabaseURL:'http://127.0.0.1:54321',publishableKey:'synthetic-public-key',isolatedDevelopment:true}));
});
test('pre-cancelled Auth request performs no network call',async()=>{
 const controller=new AbortController();controller.abort();let called=false;
 const getUser=createDeletionReceiptGetUser({supabaseURL:'https://auth.example.invalid',publishableKey:'synthetic-public-key',fetcher:async()=>{called=true;throw Error('unexpected network');}});
 await assert.rejects(getUser('synthetic-bearer',controller.signal));assert.equal(called,false);
});
test('missing or malformed bearer performs no network call',async()=>{
 let calls=0;const getUser=createDeletionReceiptGetUser({supabaseURL:'https://auth.example.invalid',publishableKey:'synthetic-public-key',fetcher:async()=>{calls++;throw Error('unexpected request');}});
 for(const bearer of ['', 'has whitespace', 'x'.repeat(16385)])await assert.rejects(getUser(bearer,new AbortController().signal));
 assert.equal(calls,0);
});
test('cancellation during stalled response cancels the body and refuses identity',async()=>{
 const controller=new AbortController();let entered,cancelled=false;
 const ready=new Promise(resolve=>{entered=resolve;});
 const getUser=createDeletionReceiptGetUser({supabaseURL:'https://auth.example.invalid',publishableKey:'synthetic-public-key',fetcher:async()=>new Response(new ReadableStream({
  pull(){entered();},cancel(){cancelled=true;},
 }))});
 const pending=getUser('synthetic-bearer',controller.signal);
 await ready;controller.abort();await assert.rejects(pending);assert.equal(cancelled,true);
});
test('oversized or redirected Auth response cannot yield verified user',async()=>{
 for(const mode of ['oversized','redirected']){
  const getUser=createDeletionReceiptGetUser({supabaseURL:'https://auth.example.invalid',publishableKey:'synthetic-public-key',fetcher:async()=>{
   const response=new Response('x'.repeat(mode==='oversized'?65537:1));
   if(mode==='redirected')Object.defineProperty(response,'redirected',{value:true});return response;
  }});
  const result=await getUser('synthetic-bearer',new AbortController().signal);
  assert.ok(result.error);assert.equal(result.data.user,null);
 }
});
