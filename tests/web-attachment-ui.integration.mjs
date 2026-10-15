// Explicit isolated UI test. Copies selected sources; never copies .env or connects real Auth/Storage.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:undefined;
assert.ok(arg('--playwright-module'),'Supply installed Playwright. No package or browser is installed by this test.');
const imported=await import(pathToFileURL(arg('--playwright-module')).href),{chromium}=imported.default??imported;
const directory=mkdtempSync(join(tmpdir(),'ouchi-upload-ui-')),root=process.cwd();
let browser,child,logs='';
const syntheticPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOI6sn7DwAE7AJU20VVIQAAAABJRU5ErkJggg==','base64');
const write=(name,value)=>{mkdirSync(join(directory,name,'..'),{recursive:true});writeFileSync(join(directory,name),value);};
try{
 symlinkSync(join(root,'node_modules'),join(directory,'node_modules'),'dir');
 for(const name of ['components/cloud-account.tsx','components/attachment-controls.tsx','lib/attachment-client.ts','lib/attachment-image-preparation.ts','components/enrollment-controls.tsx','lib/web-enrollment-client.ts','lib/pending-attachment-store.ts','lib/attachment-upload-flow.ts','lib/attachment-removal-flow.ts','components/attachment-removal-recovery.tsx','lib/attachment-auth-lifecycle.ts','app/globals.css','postcss.config.mjs']){mkdirSync(join(directory,name,'..'),{recursive:true});copyFileSync(join(root,name),join(directory,name));}
 write('package.json',JSON.stringify({name:'disposable-attachment-ui',private:true,type:'module'}));
 write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',jsx:'preserve',module:'ESNext',moduleResolution:'bundler',esModuleInterop:true,strict:true,paths:{'@/*':['./*']}}}));
 write('app/layout.tsx','import "./globals.css"; export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}');
 write('app/page.tsx',`"use client";import {AttachmentControls} from '@/components/attachment-controls';import {CloudAccount} from '@/components/cloud-account';import {useEffect,useState} from 'react';export default function Page(){const [show,setShow]=useState(true);useEffect(()=>setShow(!new URLSearchParams(location.search).has('withoutProduct')),[]);return <main style={{maxWidth:430,padding:16,margin:'auto'}}><p>仮データでの表示確認</p><CloudAccount disabled={false} />{show?<AttachmentControls account="11111111-1111-4111-8111-111111111111" product="44444444-4444-4444-8444-444444444444" />:null}</main>;}`);
 write('lib/supabase.ts',`import {browserAttachmentAuth} from './attachment-auth-lifecycle';let observing=false;const initial='11111111-1111-4111-8111-111111111111';let account=initial,signedOut=false;const listeners=new Set<(event:string,session:unknown)=>void>();declare global{interface Window{changeFixtureAccount:()=>void;expireFixtureSession:()=>void;repeatFixtureSession:()=>void}}export function getSupabase(){if(!observing){observing=true;browserAttachmentAuth.observe(account);}if(typeof window!=='undefined')window.repeatFixtureSession=()=>{for(const callback of listeners)callback('SIGNED_IN',{user:{id:account,email:'synthetic@example.test'},access_token:'synthetic'});};if(typeof window!=='undefined')window.expireFixtureSession=()=>{signedOut=true;browserAttachmentAuth.observe(null);for(const callback of listeners)callback('SIGNED_OUT',null);};if(typeof window!=='undefined')window.changeFixtureAccount=()=>{browserAttachmentAuth.observe(null);account='66666666-6666-4666-8666-666666666666';for(const callback of listeners)callback('SIGNED_OUT',null);};return {auth:{getSession:async()=>({error:null,data:{session:signedOut?null:{user:{id:account,email:'synthetic@example.test'},access_token:'synthetic'}}}),signInWithPassword:async()=>{signedOut=false;account=initial;browserAttachmentAuth.observe(account);const session={user:{id:account,email:'synthetic@example.test'},access_token:'synthetic'};for(const callback of listeners)callback('SIGNED_IN',session);return {error:null,data:{session,user:session.user}};},signOut:async()=>{signedOut=true;browserAttachmentAuth.observe(null);for(const callback of listeners)callback('SIGNED_OUT',null);return {error:null};},onAuthStateChange:(callback:(event:string,session:{user:{id:string;email?:string}}|null)=>void)=>{listeners.add(callback as (event:string,session:unknown)=>void);queueMicrotask(()=>callback('INITIAL_SESSION',signedOut?null:{user:{id:account,email:'synthetic@example.test'},access_token:'synthetic'}));return {data:{subscription:{unsubscribe:()=>listeners.delete(callback as (event:string,session:unknown)=>void)}}};}}};}`);
 write('app/api/product-attachments/route.js',`const account='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222';const state=globalThis.fixtureAttachments??={rows:new Map(),ids:[],creates:0,removals:[]};export async function GET(request){if(request.headers.get('authorization')!=='Bearer synthetic')return new Response('',{status:401});const query=new URL(request.url).searchParams;if(query.has('binding'))return Response.json({account,epoch});if(query.has('page'))return Response.json({items:[...state.rows].map(([id,bytes])=>({id,size:bytes.length,mime:'image/png',createdAt:'2026-10-11T07:00:00Z'})),next:null});if(query.has('fixture'))return Response.json({ids:state.ids,creates:state.creates,removals:state.removals});const id=query.get('attachmentId'),bytes=state.rows.get(id);if(!bytes)return new Response('',{status:404});return new Response(bytes,{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="ouchi-attachment-'+id+'.png"'}});}export async function POST(request){if(request.headers.get('authorization')!=='Bearer synthetic'||request.headers.get('X-Ouchi-App-Epoch')!==epoch)return new Response('',{status:401});const query=new URL(request.url).searchParams,id=query.get('attachmentId');if(query.get('productId')!=='44444444-4444-4444-8444-444444444444')return new Response('',{status:400});const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length<8||bytes.length>5242880||request.headers.get('content-type')!=='image/png')return new Response('',{status:400});state.ids.push(id);if(!state.rows.has(id)){state.creates++;state.rows.set(id,bytes);return new Response('Simulated lost acknowledgement',{status:503});}return Response.json({saved:true,attachmentId:id});}export async function DELETE(request){if(request.headers.get('authorization')!=='Bearer synthetic'||request.headers.get('X-Ouchi-App-Epoch')!==epoch)return new Response('',{status:401});const id=new URL(request.url).searchParams.get('attachmentId');state.removals.push(id);if(state.removals.length===1){state.rows.delete(id);return new Response('Simulated lost delete acknowledgement',{status:503});}if(state.removals.length===2)return Response.json({removed:true,attachmentId:account});return Response.json({removed:true,attachmentId:id});}`);
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:directory,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_OUCHI_ATTACHMENTS_ENABLED:'true'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',value=>{logs+=value;});child.stderr.on('data',value=>{logs+=value;});
 const url=`http://127.0.0.1:${port}`;let ready=false;
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Fixture server exited: '+logs);try{const response=await fetch(url,{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,'Fixture did not become ready: '+logs);
 browser=await chromium.launch({headless:true,executablePath:arg('--browser-executable')});const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const page=await context.newPage();let acceptDialogs=true;page.on('dialog',dialog=>acceptDialogs?dialog.accept():dialog.dismiss());
 await page.goto(url);await page.getByRole('heading',{name:'写真・保証書',exact:true}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:syntheticPNG});
 await page.evaluate(()=>window.repeatFixtureSession());await page.getByText('synthetic.png',{exact:false}).waitFor();
 await page.getByRole('button',{name:'保存する',exact:true}).click();await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).waitFor();
 await page.getByRole('status').filter({hasText:'保存サービスを確認できませんでした。'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'確認待ちのファイルを確認',exact:true}).click();await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).waitFor();
 await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).click();await page.getByRole('status').filter({hasText:'保存を確認しました。'}).waitFor();
 const state=await page.evaluate(async()=>await (await fetch('/api/product-attachments?fixture=true',{headers:{Authorization:'Bearer synthetic'}})).json());assert.equal(state.ids.length,2);assert.equal(state.ids[0],state.ids[1]);assert.equal(state.creates,1);
 await page.getByRole('button',{name:'確認待ちのファイルを確認',exact:true}).click();await page.getByRole('status').filter({hasText:'確認待ちのファイルはありません。'}).waitFor();
 await page.getByRole('button',{name:'保存済みファイルを確認',exact:true}).click();await page.getByRole('button',{name:'ファイルを保存',exact:true}).waitFor();
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'ファイルを保存',exact:true}).click();const download=await downloading;assert.equal(download.suggestedFilename(),`ouchi-attachment-${state.ids[0]}.png`);
 if(arg('--screenshot'))await page.screenshot({path:resolve(arg('--screenshot')),fullPage:true});
 acceptDialogs=false;await page.getByRole('button',{name:'ファイルを削除',exact:true}).click();
 assert.equal((await page.evaluate(async()=>await(await fetch('/api/product-attachments?fixture=true',{headers:{Authorization:'Bearer synthetic'}})).json())).removals.length,0);
 acceptDialogs=true;await page.getByRole('button',{name:'ファイルを削除',exact:true}).click();
 await page.getByRole('status').filter({hasText:'削除完了を確認できませんでした。'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'ファイルを削除',exact:true}).count(),1);
 // Reopen without the original product's controls. Recovery must use only
 // the committed original removal receipt, never a displayed-list item/new ID.
 await page.goto(url+'?withoutProduct=1');
 await page.getByRole('heading',{name:'写真・保証書',exact:true}).waitFor({state:'detached'});
 await page.getByRole('button',{name:'確認待ちの削除を確認',exact:true}).click();
 await page.getByRole('button',{name:'同じファイルの削除結果を再確認',exact:true}).waitFor();
 if(arg('--recovery-screenshot'))await page.screenshot({path:resolve(arg('--recovery-screenshot')),fullPage:true});
 await page.getByRole('button',{name:'同じファイルの削除結果を再確認',exact:true}).click();await page.getByRole('status').filter({hasText:'削除結果を確認できません。'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'同じファイルの削除結果を再確認',exact:true}).count(),1);
 await page.getByRole('button',{name:'同じファイルの削除結果を再確認',exact:true}).click();await page.getByRole('status').filter({hasText:'前回のファイルの削除を確認しました。'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'ファイルを削除',exact:true}).count(),0);
 const removed=await page.evaluate(async()=>await(await fetch('/api/product-attachments?fixture=true',{headers:{Authorization:'Bearer synthetic'}})).json());assert.deepEqual(removed.removals,[state.ids[0],state.ids[0],state.ids[0]]);
 await page.goto(url);await page.getByRole('heading',{name:'写真・保証書',exact:true}).waitFor();

 await page.locator('input[type=file]').setInputFiles({name:'second-synthetic.png',mimeType:'image/png',buffer:syntheticPNG});
 await page.getByRole('button',{name:'保存する',exact:true}).click();await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).waitFor();
 await page.getByRole('status').filter({hasText:'保存サービスを確認できませんでした。'}).waitFor();
 await page.getByRole('button',{name:'保存済みファイルを確認',exact:true}).click();await page.getByRole('button',{name:'ファイルを削除',exact:true}).waitFor();
 let releaseRemoval;const removalStarted=new Promise(resolve=>{releaseRemoval=resolve;});
 await page.route('**/api/product-attachments?attachmentId=*',async route=>{if(route.request().method()!=='DELETE'){await route.continue();return;}releaseRemoval(route);});
 await page.getByRole('button',{name:'ファイルを削除',exact:true}).click();const heldRemoval=await removalStarted;
 await page.evaluate(()=>window.expireFixtureSession());await page.getByRole('button',{name:'ログイン',exact:true}).waitFor();
 const lateID=new URL(heldRemoval.request().url()).searchParams.get('attachmentId');await heldRemoval.fulfill({status:200,contentType:'application/json',body:JSON.stringify({removed:true,attachmentId:lateID})}).catch(()=>{});
 await page.unroute('**/api/product-attachments?attachmentId=*');
 assert.equal(await page.getByRole('button',{name:'ファイルを削除',exact:true}).count(),0);assert.equal(await page.getByRole('status').filter({hasText:'ファイルの削除を確認しました。'}).count(),0);

 const pendingCount=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('ouchi-maintenance-pending-attachments',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('uploads','readonly'),request=tx.objectStore('uploads').getAllKeys();request.onsuccess=()=>resolve(request.result.filter(key=>String(key).startsWith('11111111-1111-4111-8111-111111111111/')).length);tx.oncomplete=()=>db.close();};}));
 for(let i=0;i<100&&await pendingCount()!==0;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(await pendingCount(),0);
 await page.getByLabel('メールアドレス',{exact:true}).fill('synthetic@example.test');await page.getByLabel('パスワード（8文字以上）',{exact:true}).fill('synthetic-only-password');await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.getByRole('button',{name:'ログアウト',exact:true}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'third-synthetic.png',mimeType:'image/png',buffer:syntheticPNG});
 await page.getByRole('button',{name:'保存する',exact:true}).click();await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).waitFor();await page.getByRole('status').filter({hasText:'保存サービスを確認できませんでした。'}).waitFor();
 await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.getByRole('button',{name:'ログイン',exact:true}).waitFor();
 const remaining=await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('ouchi-maintenance-pending-attachments',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('uploads','readonly'),request=tx.objectStore('uploads').getAllKeys();request.onsuccess=()=>resolve(request.result.filter(key=>String(key).startsWith('11111111-1111-4111-8111-111111111111/')).length);tx.oncomplete=()=>db.close();};}));assert.equal(remaining,0);
 await page.evaluate(()=>window.changeFixtureAccount());await page.getByRole('status').filter({hasText:'アカウントが変わりました。'}).waitFor();assert.equal(await page.getByRole('button',{name:'ファイルを保存',exact:true}).count(),0);
 console.log('PASS: actual React controls + browser IndexedDB + native browser fetch to synthetic Next fixture: explicit confirmation, lost acknowledgement retained, reload recovery, same-ID retry, one synthetic object, exact-ID completion, list/download, account-switch clearing and actual logout control and simulated external auth loss clearing pending browser bytes, actual login control reopening writes and duplicate same-session sign-in preserving selection. Explicit removal cancellation, lost acknowledgement, wrong-ID refusal, persisted original removal recovery after navigation without product controls, same-ID delete retry and auth-loss during deletion also passed. No real Auth/Storage/Apple.');
}catch(error){console.error(logs);throw error;}finally{
 await browser?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}rmSync(directory,{recursive:true,force:true});
}
