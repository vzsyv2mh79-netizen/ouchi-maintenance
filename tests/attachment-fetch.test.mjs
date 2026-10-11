import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const code=ts.transpileModule(readFileSync('lib/attachment-fetch.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createAttachmentFetch:create}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('actual HTTP attachment transport bounds headers and streamed body, cancels and refuses redirects',async()=>{
 let redirected=0;
 const server=createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{location:'/destination'}).end();return;}
  if(req.url==='/destination'){redirected++;res.end('unexpected');return;}
  if(req.url==='/headers')return;
  if(req.url==='/body'){res.writeHead(200,{'content-type':'image/png'});res.write('partial');return;}
  if(req.url==='/declared'){res.writeHead(200,{'content-length':'65'}).end('x'.repeat(65));return;}
  if(req.url==='/streamed'){res.writeHead(200,{'content-type':'image/png'});res.write('x'.repeat(65));return;}
  res.writeHead(200,{'content-type':'image/png'}).end('x'.repeat(64));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const boundary=await create(undefined,1000,64)(origin+'/ok');assert.equal((await boundary.arrayBuffer()).byteLength,64);assert.equal(boundary.headers.get('content-type'),'image/png');
  await assert.rejects(()=>create(undefined,50,64)(origin+'/headers'));
  await assert.rejects(()=>create(undefined,50,64)(origin+'/body'));
  await assert.rejects(()=>create(undefined,1000,64)(origin+'/declared'),/too large/);
  await assert.rejects(()=>create(undefined,1000,64)(origin+'/streamed'),/too large/);
  await assert.rejects(()=>create(undefined,1000,64)(origin+'/redirect'));assert.equal(redirected,0);
  const caller=new AbortController(),pending=create(caller.signal,1000,64)(origin+'/body');caller.abort();await assert.rejects(()=>pending);
  const requestSignal=new AbortController();requestSignal.abort();await assert.rejects(()=>create(undefined,1000,64)(new Request(origin+'/ok',{signal:requestSignal.signal})));
  assert.throws(()=>create(undefined,0),/Invalid/);assert.throws(()=>create(undefined,30001),/Invalid/);assert.throws(()=>create(undefined,10,5242881),/Invalid/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('actual Supabase Storage download reports bounded transport failures without a file',async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'image/png'});res.write('x'.repeat(65));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const db=createClient('http://127.0.0.1:'+server.address().port,'synthetic-isolated-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:create(undefined,1000,64)}});
  const result=await db.storage.from('synthetic-bucket').download('synthetic-file.png');assert.equal(result.data,null);assert.ok(result.error);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
