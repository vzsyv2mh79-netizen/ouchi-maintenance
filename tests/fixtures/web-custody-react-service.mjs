/** Actual shipping CloudAccount + Supabase SDK + custody UI, served by a
 * disposable Next app. All browser HTTPS is intercepted into owned loopback
 * services. Actual GoTrue/PostgreSQL are disposable; never production proof.
 * Setup saves a credential through the shipping client in a fixture bridge;
 * retirement/operator work remains the parent real-service driver, not this UI.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

export async function startWebCustodyServiceFixture({handlers,scope,actor,db,authPort,fetcher,beforeRegistration}){
 assert.equal(process.env.OUCHI_WEB_CUSTODY_REACT_TEST,'true');
 assert.ok(actor.email.endsWith('@example.invalid')&&actor.password);
 const {chromium}=await import(process.env.OUCHI_TEST_PLAYWRIGHT_MODULE);
 const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'ouchi-custody-react-')),origin='https://ouchi-maintenance.vercel.app',authOrigin='https://abcdefghijklmnopqrst.supabase.co';
 const sources={},calls=[],authCalls=[];let child,browser,server,logs='',dropReply=true,page;
 const output=process.env.OUCHI_TEST_REACT_OUTPUT;if(output)mkdirSync(output,{recursive:true});
 const write=(p,content)=>{mkdirSync(join(dir,p,'..'),{recursive:true});writeFileSync(join(dir,p),content);};
 try{
  for(const path of ['components/cloud-account.tsx','components/closure-saved-read-controls.tsx','components/account-closure-controls.tsx','components/enrollment-controls.tsx','components/attachment-removal-recovery.tsx','lib/supabase.ts','lib/web-closure-read-types.ts','lib/web-closure-read-client.ts','lib/web-closure-read-vault.ts','lib/web-closure-transport.ts','lib/web-closure-progress-client.ts','lib/web-closure-review-client.ts','lib/web-closure-reference-store.ts','lib/web-enrollment-client.ts','lib/attachment-auth-lifecycle.ts','lib/pending-attachment-store.ts','lib/attachment-client.ts','lib/attachment-removal-flow.ts','lib/attachment-upload-flow.ts','app/globals.css','postcss.config.mjs']){
   mkdirSync(join(dir,path,'..'),{recursive:true});copyFileSync(join(root,path),join(dir,path));sources[path]=createHash('sha256').update(readFileSync(join(dir,path))).digest('hex');
  }
  symlinkSync(join(root,'node_modules'),join(dir,'node_modules'),'dir');
  write('package.json',JSON.stringify({name:'disposable-real-auth-custody',private:true,type:'module'}));
  write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',jsx:'preserve',module:'ESNext',moduleResolution:'bundler',esModuleInterop:true,strict:true,paths:{'@/*':['./*']}}}));
  write('app/layout.tsx','import "./globals.css";export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}');
  write('app/page.tsx',`"use client";import {useEffect} from 'react';import {CloudAccount} from '@/components/cloud-account';import {getSupabase} from '@/lib/supabase';import {prepareWebClosureRead} from '@/lib/web-closure-read-client';import {webClosureReadVault} from '@/lib/web-closure-read-vault';import {browserPendingAttachments,browserPendingAttachmentRemovals} from '@/lib/pending-attachment-store';export default function Page(){useEffect(()=>{const options=async()=>{const reader=async()=>{const r=await getSupabase()!.auth.getSession();if(r.error)throw r.error;const s=r.data.session;return s?{account:s.user.id,token:s.access_token}:null;};return {expectedAccount:(await reader())?.account??null,session:reader,signal:new AbortController().signal};};(window as any).fixture={session:()=>getSupabase()!.auth.getSession(),prepare:async(scope:any)=>prepareWebClosureRead(await options(),scope),fingerprint:async(scope:any)=>{const r=await webClosureReadVault.read(scope);if(!r)return null;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Ouchi/closure-read/v1\\n'+r.token));return {credentialID:r.credentialID,expiresAt:r.expiresAt,hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};},pending:async(values:any[])=>Promise.all(values.map(async v=>({file:(await browserPendingAttachments.read(v.account,v.epoch))?.id??null,removal:(await browserPendingAttachmentRemovals.read(v.account,v.epoch))?.id??null}))) };},[]);return <main style={{maxWidth:430,margin:'auto',padding:16}}><p>実認証と退会画面の確認用・仮データのみ</p><CloudAccount disabled={false}/></main>;}`);
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:dir,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_owned_fixture_only',NEXT_PUBLIC_OUCHI_ACCOUNT_REVIEW_ENABLED:'true',NEXT_PUBLIC_OUCHI_CLOSURE_READ_CUSTODY_ENABLED:'true',NEXT_PUBLIC_OUCHI_ATTACHMENTS_ENABLED:'true',NEXT_PUBLIC_OUCHI_EXPLICIT_ENROLLMENT_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',v=>{logs+=v;});child.stderr.on('data',v=>{logs+=v;});
  const frontend='http://127.0.0.1:'+port;
  let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Local Next exited');try{if((await fetcher(frontend,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,'Local Next readiness');
  server=createServer(async(req,res)=>{
   try{
    assert.equal(req.socket.remoteAddress,'127.0.0.1');const url=new URL(req.url,origin),op=url.pathname.split('/').at(-1);
    assert.equal(url.pathname,'/api/account/closure-review/custody/'+op);assert.ok(['describe','register','status'].includes(op));assert.equal(req.method,'POST');assert.equal(req.headers.origin,origin);assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.referer,undefined);assert.equal(url.search,'');if(op==='status')assert.equal(req.headers.authorization,undefined);
    const chunks=[];let size=0;for await(const c of req){size+=c.length;assert.ok(size<=4096);chunks.push(c);}const bytes=Buffer.concat(chunks),b=JSON.parse(bytes.toString());
    const response=await handlers[op](new Request(url,{method:'POST',headers:req.headers,body:bytes}));calls.push({op,status:response.status,credentialID:b.credentialID??null,authenticated:!!req.headers.authorization});
    if(op==='register'&&response.status===200&&dropReply){dropReply=false;await response.arrayBuffer();res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"synthetic lost committed reply"}');return;}
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"local custody adapter failed"}');}
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const backend='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.OUCHI_TEST_BROWSER_EXECUTABLE,headless:true});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());assert.ok([origin,authOrigin].includes(url.origin),'No external network');
   if(url.origin===authOrigin){
    assert.ok(url.pathname.startsWith('/auth/v1/'));assert.ok(['/auth/v1/token','/auth/v1/user','/auth/v1/logout'].includes(url.pathname));
    const cors={'access-control-allow-origin':origin,'access-control-allow-headers':req.headers()['access-control-request-headers']??'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    if(url.pathname.endsWith('/logout'))assert.equal(url.searchParams.get('scope'),'local');
    const response=await fetcher('http://127.0.0.1:'+authPort+url.pathname.slice('/auth/v1'.length)+url.search,{method:req.method(),headers:req.headers(),body:req.postDataBuffer()??undefined,redirect:'error'});
    authCalls.push({path:url.pathname,method:req.method(),scope:url.searchParams.get('scope'),status:response.status});await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),...cors},body:Buffer.from(await response.arrayBuffer())});return;
   }
   assert.ok(!url.pathname.startsWith('/api/')||url.pathname.startsWith('/api/account/closure-review/custody/'),'Unexpected application write or API call');
   const target=url.pathname.startsWith('/api/')?backend:frontend;
   const response=await fetcher(target+url.pathname+url.search,{method:req.method(),headers:req.headers(),body:req.postDataBuffer()??undefined,redirect:'error'});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('dialog',dialog=>dialog.accept());
  const reload=async()=>{await page.goto(origin);await page.waitForFunction(()=>!!window.fixture);};
  const control=page.getByRole('region',{name:'保存した退会処理の確認',exact:true});
  const open=async()=>{await control.getByRole('button',{name:'保存した退会処理を開く',exact:true}).click();await control.getByLabel('確認する退会処理',{exact:true}).selectOption(scope.requestID);};
  const read=async expected=>{await control.getByRole('button',{name:'保存した鍵で状況を確認',exact:true}).click();await control.getByText(expected===null?'現在の状況を確認できません。':expected==='complete'?'サーバー側の退会処理の完了を確認しました。':'退会処理を進めています。',{exact:false}).waitFor();};
  await reload();await page.getByLabel('メールアドレス',{exact:true}).fill(actor.email);await page.getByLabel('パスワード（8文字以上）',{exact:true}).fill(actor.password);await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.getByText(actor.email,{exact:true}).waitFor();
  const browserSessionID=await page.evaluate(async()=>{const r=await window.fixture.session();return JSON.parse(atob(r.data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;});assert.notEqual(browserSessionID,actor.session);
  // Parent fixture seeds an existing app-session binding before invoking the
  // actual reviewed-retirement boundary. This does not verify enrollment UI.
  await beforeRegistration(browserSessionID);
  assert.equal(await page.evaluate(async scope=>{try{await window.fixture.prepare(scope);return false;}catch{return true;}},scope),true);assert.equal(dropReply,false);
  const fingerprint=await page.evaluate(s=>window.fixture.fingerprint(s),scope),stored=(await db.query('select token_hash from maintenance_private.closure_read_credentials where credential_id=$1',[fingerprint.credentialID])).rows[0];assert.equal(stored.token_hash,fingerprint.hash);
  await reload();assert.equal(await page.evaluate(async()=>((await window.fixture.session()).data.session)?.user.id),actor.id);assert.equal((await page.evaluate(s=>window.fixture.prepare(s),scope)).status.state,'pending');
  await open();await read('pending');
  await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.getByRole('button',{name:'ログイン',exact:true}).waitFor();assert.equal(await page.evaluate(async()=>((await window.fixture.session()).data.session)),null);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[browserSessionID])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[actor.session])).rows[0].n,1);
  await reload();await open();await read('pending');
  return {
   sources,calls,authCalls,driverSHA256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
   async verify(expected){
    await reload();assert.equal(await page.evaluate(async()=>((await window.fixture.session()).data.session)),null);await open();await read(expected);
    if(expected==='complete'){
     // Residual bytes represent a prior interrupted local cleanup. Initial
     // logged-out SDK cleanup has settled; fixture seeds exact rows directly,
     // since normal shipping stage correctly refuses writes while logged out.
     const pending=await page.evaluate(async scope=>{
      const base={account:scope.account,epoch:scope.epochID,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',product:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},newer={...base,epoch:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},other={...base,account:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
      await new Promise((resolve,reject)=>{const open=indexedDB.open('ouchi-maintenance-pending-attachments',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('uploads','readwrite',{durability:'strict'}),store=tx.objectStore('uploads');for(const item of [base,newer,other])store.put({...item,version:1,blob:new Blob(['%PDF-1.7\nSynthetic residual bytes']),mime:'application/pdf',sha256:'a'.repeat(64)},item.account+'/'+item.epoch);store.put({...base,version:1,kind:'removal'},base.account+'/'+base.epoch+'/removal');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});localStorage.setItem('anonymous-record-sentinel','keep');return {base,newer,other};
     },scope);
     await control.getByRole('button',{name:'この登録の確認待ちファイルを消去',exact:true}).click();await control.getByRole('status').filter({hasText:'この退会の登録の確認待ちファイルを、このブラウザから消去したことを確認しました。'}).waitFor();
     // Inspect only IDs; fixtures never return the seeded file bytes.
     const rows=await page.evaluate(async({base,newer,other})=>new Promise(resolve=>{const open=indexedDB.open('ouchi-maintenance-pending-attachments',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('uploads'),store=tx.objectStore('uploads'),requests=[base.account+'/'+base.epoch,base.account+'/'+base.epoch+'/removal',newer.account+'/'+newer.epoch,other.account+'/'+other.epoch].map(k=>store.get(k));tx.oncomplete=()=>{db.close();resolve(requests.map(r=>r.result?.id??null));};};}),pending);assert.deepEqual(rows,[null,null,pending.base.id,pending.base.id]);
     assert.equal(await page.evaluate(()=>localStorage.getItem('anonymous-record-sentinel')),'keep');if(output)await page.screenshot({path:join(output,'real-auth-scoped-cleanup.png'),fullPage:true});
    }else if(expected===null)assert.equal(await control.getByRole('button',{name:'この登録の確認待ちファイルを消去',exact:true}).count(),0);
    assert.deepEqual(await page.evaluate(s=>window.fixture.fingerprint(s),scope),fingerprint);assert.equal(calls.filter(c=>c.op==='register').length,1);assert.equal(calls.filter(c=>c.op==='describe').length,1);assert.ok(calls.filter(c=>c.op==='status').every(c=>!c.authenticated));assert.equal(authCalls.filter(c=>c.path.endsWith('/logout')).length,1);
   },
   async close(){await browser.close();await new Promise(resolve=>server.close(resolve));child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));rmSync(dir,{recursive:true,force:true});}
  };
 }catch(error){if(output){writeFileSync(join(output,'failure.log'),String(error)+'\n'+logs);if(page)await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});}await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));child?.kill('SIGTERM');if(child&&child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));rmSync(dir,{recursive:true,force:true});throw error;}
}
