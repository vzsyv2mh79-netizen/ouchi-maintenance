import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createServer} from 'node:http';import {createClient} from '@supabase/supabase-js';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-fetch.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createBillingFetch:create}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('actual local HTTP preserves requests and aborts stalled headers/body or caller cancellation',async()=>{
 const requests=[];const server=createServer((req,res)=>{requests.push({path:req.url,method:req.method,marker:req.headers['x-fixture-marker']});if(req.url==='/body'){res.writeHead(200,{'content-type':'application/json'});res.write('{');return;}if(req.url==='/hang')return;res.end('ok');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal(await (await create(1000)(origin+'/ok',{method:'POST',headers:{'x-fixture-marker':'synthetic'}})).text(),'ok');assert.deepEqual(requests[0],{path:'/ok',method:'POST',marker:'synthetic'});
  await assert.rejects(()=>create(30)(origin+'/hang'),error=>error.name==='TimeoutError');
  const response=await create(100)(origin+'/body');await assert.rejects(()=>response.text(),error=>error.name==='AbortError'||error.name==='TimeoutError');
  const c=new AbortController();const pending=create(1000)(origin+'/hang',{signal:c.signal});c.abort();await assert.rejects(()=>pending,error=>error.name==='AbortError');
  const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>create(1000)(new Request(origin+'/ok',{signal:cancelled.signal})),error=>error.name==='AbortError');
  assert.throws(()=>create(0),/Invalid/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('actual Supabase RPC reports transport timeout as error without successful acknowledgement',async()=>{
 const server=createServer(()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const db=createClient('http://127.0.0.1:'+server.address().port,'synthetic-isolated-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:create(30)}});const result=await db.rpc('synthetic_finish');assert.ok(result.error);assert.equal(result.data,null);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
