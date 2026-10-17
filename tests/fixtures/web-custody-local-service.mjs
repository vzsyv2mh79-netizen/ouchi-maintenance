/** Browser shipping vault/client -> loopback HTTP -> shipping custody handler
 * -> real disposable GoTrue/minimum-role PostgreSQL. HTTPS is intercepted only
 * inside this owned browser context: this is not deployed TLS or full React UI.
 * No production network request, credential, or customer record is permitted.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';

export async function startWebCustodyServiceFixture({handlers,scope,actor,db,fetcher}){
 assert.equal(process.env.OUCHI_WEB_CUSTODY_SERVICE_TEST,'true');
 const {chromium}=await import(process.env.OUCHI_TEST_PLAYWRIGHT_MODULE);
 const origin='https://ouchi-maintenance.vercel.app',calls=[],sources={};
 for(const name of ['web-closure-read-client','web-closure-read-vault','web-closure-read-types','web-closure-transport','pending-attachment-store']){
  const raw=readFileSync('lib/'+name+'.ts','utf8');
  sources['lib/'+name+'.ts']=createHash('sha256').update(raw).digest('hex');
 }
 let dropRegisterReply=true,browser,server;
 const compiled=new Map();
 const browserModule=name=>{
  if(!compiled.has(name)){
   assert.ok(Object.hasOwn(sources,'lib/'+name+'.ts'));
   const js=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
    .replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify('/lib/'+dep+'.js'));
   compiled.set(name,js);
  }
  return compiled.get(name);
 };
 const html=`<!doctype html><meta charset="utf-8"><title>Local custody service fixture</title><script type="module">
 import * as api from '/lib/web-closure-read-client.js';
 import {webClosureReadVault as vault} from '/lib/web-closure-read-vault.js';
 let session=null;
 window.fixture={cleanup:r=>api.cleanupWebClosurePendingFiles(options(),r),setSession:s=>{session=s;},list:()=>api.listWebClosureReads(options()),prepare:s=>api.prepareWebClosureRead(options(),s),read:r=>api.recoverWebClosureRead(options(),r),fingerprint:async s=>{
 const row=await vault.read(s);if(!row)return null;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Ouchi/closure-read/v1\\n'+row.token));
 return {credentialID:row.credentialID,expiresAt:row.expiresAt,hash:[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')};
 }};
 function options(){return {expectedAccount:session?.account??null,session:async()=>session,signal:new AbortController().signal};}
 </script>`;
 try{
  server=createServer(async(req,res)=>{
   try{
    assert.equal(req.socket.remoteAddress,'127.0.0.1');
    const url=new URL(req.url,origin);
    if(req.method==='GET'&&url.pathname==='/'){
     res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(html);return;
    }
    if(req.method==='GET'&&/^\/lib\/[a-z-]+\.js$/.test(url.pathname)){
     res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(browserModule(url.pathname.slice(5,-3)));return;
    }
    assert.equal(req.method,'POST');assert.equal(url.search,'');
    const op=url.pathname.split('/').at(-1);assert.ok(['describe','register','status'].includes(op));
    assert.equal(url.pathname,'/api/account/closure-review/custody/'+op);
    assert.equal(req.headers.origin,origin);assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.referer,undefined);
    if(op==='status')assert.equal(req.headers.authorization,undefined);
    const chunks=[];let size=0;for await(const c of req){size+=c.length;assert.ok(size<=4096);chunks.push(c);}
    const body=Buffer.concat(chunks),parsed=JSON.parse(body.toString());
    const response=await handlers[op](new Request(url,{method:'POST',headers:req.headers,body}));
    calls.push({op,status:response.status,requestID:parsed.requestID,credentialID:parsed.credentialID??null,authenticated:!!req.headers.authorization});
    if(op==='register'&&response.status===200&&dropRegisterReply){
     dropRegisterReply=false;await response.arrayBuffer();
     res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"synthetic lost committed reply"}');return;
    }
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"local fixture failed"}');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const local='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.OUCHI_TEST_BROWSER_EXECUTABLE,headless:true});
  const context=await browser.newContext();
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   assert.equal(url.origin,origin); // Never allow a request to the real hostname.
   const response=await fetcher(local+url.pathname+url.search,{method:request.method(),headers:request.headers(),body:request.postDataBuffer()??undefined,redirect:'error'});
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  const page=await context.newPage();
  const reload=async()=>{await page.goto(origin);await page.waitForFunction(()=>!!window.fixture);};
  await reload();await page.evaluate(s=>window.fixture.setSession(s),{account:actor.id,token:actor.token});
  const prepared=await page.evaluate(async scope=>{try{await window.fixture.prepare(scope);return false;}catch{return true;}},scope);
  assert.equal(prepared,true);assert.equal(dropRegisterReply,false);
  const fingerprint=await page.evaluate(s=>window.fixture.fingerprint(s),scope);
  assert.ok(fingerprint);
  const persisted=(await db.query('select c.token_hash,w.expires_at from maintenance_private.closure_read_credentials c join maintenance_private.closure_read_windows w using(request_id) where credential_id=$1',[fingerprint.credentialID])).rows[0];
  assert.equal(persisted.token_hash,fingerprint.hash);assert.equal(persisted.expires_at.toISOString(),fingerprint.expiresAt);
  await reload();await page.evaluate(s=>window.fixture.setSession(s),{account:actor.id,token:actor.token});
  const recovered=await page.evaluate(s=>window.fixture.prepare(s),scope);
  assert.equal(recovered.status.state,'pending');assert.equal(recovered.reference.credentialID,fingerprint.credentialID);
  assert.equal(calls.filter(c=>c.op==='register').length,1);assert.equal(calls.filter(c=>c.op==='describe').length,1);
  // Reload removes the test's in-memory Auth binding; it does not claim to
  // exercise Supabase SDK logout. Shipping browser read must need no bearer.
  await reload();
  const rows=await page.evaluate(()=>window.fixture.list());assert.equal(rows.length,1);
  assert.equal((await page.evaluate(r=>window.fixture.read(r),rows[0])).state,'pending');
  assert.deepEqual(await page.evaluate(s=>window.fixture.fingerprint(s),scope),fingerprint);
  return {
   reference:rows[0],sources,calls,driverSHA256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
   async verify(expected){
    await reload();const result=await page.evaluate(r=>window.fixture.read(r),rows[0]);
    assert.equal(result?.state??null,expected);
    if(expected==='complete'){
     const pending=await page.evaluate(async scope=>{
      const {browserPendingAttachments:files,browserPendingAttachmentRemovals:removals}=await import('/lib/pending-attachment-store.js');
      const base={account:scope.account,epoch:scope.epochID,product:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},newer={...base,epoch:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},other={...base,account:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
      for(const item of [base,newer,other])await files.stage({...item,blob:new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),mime:'image/png'});
      await removals.stage(base);localStorage.setItem('anonymous-record-sentinel','keep');
      return {base,newer,other};
     },scope);
     await page.evaluate(r=>window.fixture.cleanup(r),rows[0]);await page.evaluate(r=>window.fixture.cleanup(r),rows[0]);
     assert.deepEqual(await page.evaluate(async({base,newer,other})=>{
      const {browserPendingAttachments:files,browserPendingAttachmentRemovals:removals}=await import('/lib/pending-attachment-store.js');
      return {old:await files.read(base.account,base.epoch),oldRemoval:await removals.read(base.account,base.epoch),newer:(await files.read(newer.account,newer.epoch))?.id,other:(await files.read(other.account,other.epoch))?.id,anonymous:localStorage.getItem('anonymous-record-sentinel')};
     },pending),{old:null,oldRemoval:null,newer:pending.base.id,other:pending.base.id,anonymous:'keep'});
    }else if(expected===null){
     assert.equal(await page.evaluate(async r=>{try{await window.fixture.cleanup(r);return false;}catch{return true;}},rows[0]),true);
    }

    assert.deepEqual(await page.evaluate(s=>window.fixture.fingerprint(s),scope),fingerprint);
    assert.equal(calls.filter(c=>c.op==='register').length,1);assert.equal(calls.filter(c=>c.op==='describe').length,1);
    assert.ok(calls.filter(c=>c.op==='status').every(c=>!c.authenticated));
   },
   async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}
  };
 }catch(error){await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));throw error;}
}
