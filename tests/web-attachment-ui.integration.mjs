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
const write=(name,value)=>{mkdirSync(join(directory,name,'..'),{recursive:true});writeFileSync(join(directory,name),value);};
try{
 symlinkSync(join(root,'node_modules'),join(directory,'node_modules'),'dir');
 for(const name of ['components/attachment-controls.tsx','lib/attachment-client.ts','lib/pending-attachment-store.ts','lib/attachment-upload-flow.ts','app/globals.css','postcss.config.mjs']){mkdirSync(join(directory,name,'..'),{recursive:true});copyFileSync(join(root,name),join(directory,name));}
 write('package.json',JSON.stringify({name:'disposable-attachment-ui',private:true,type:'module'}));
 write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',jsx:'preserve',module:'ESNext',moduleResolution:'bundler',esModuleInterop:true,strict:true,paths:{'@/*':['./*']}}}));
 write('app/layout.tsx','import "./globals.css"; export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}');
 write('app/page.tsx',`"use client";import {AttachmentControls} from '@/components/attachment-controls';export default function Page(){return <main style={{maxWidth:430,padding:16,margin:'auto'}}><p>仮データでの表示確認</p><AttachmentControls account="11111111-1111-4111-8111-111111111111" product="44444444-4444-4444-8444-444444444444" /></main>;}`);
 write('lib/supabase.ts',`const initial='11111111-1111-4111-8111-111111111111';let account=initial;const listeners=new Set<(event:string,session:unknown)=>void>();declare global{interface Window{changeFixtureAccount:()=>void}}export function getSupabase(){if(typeof window!=='undefined')window.changeFixtureAccount=()=>{account='66666666-6666-4666-8666-666666666666';for(const callback of listeners)callback('SIGNED_OUT',null);};return {auth:{getSession:async()=>({error:null,data:{session:{user:{id:account},access_token:'synthetic'}}}),onAuthStateChange:(callback:(event:string,session:{user:{id:string}}|null)=>void)=>{listeners.add(callback as (event:string,session:unknown)=>void);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback as (event:string,session:unknown)=>void)}}};}}};}`);
 write('app/api/product-attachments/route.js',`const account='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222';const state=globalThis.fixtureAttachments??={rows:new Map(),ids:[],creates:0};export async function GET(request){if(request.headers.get('authorization')!=='Bearer synthetic')return new Response('',{status:401});const query=new URL(request.url).searchParams;if(query.has('binding'))return Response.json({account,epoch});if(query.has('page'))return Response.json({items:[...state.rows].map(([id,bytes])=>({id,size:bytes.length,mime:'image/png',createdAt:'2026-10-11T07:00:00Z'})),next:null});if(query.has('fixture'))return Response.json({ids:state.ids,creates:state.creates});const id=query.get('attachmentId'),bytes=state.rows.get(id);if(!bytes)return new Response('',{status:404});return new Response(bytes,{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="ouchi-attachment-'+id+'.png"'}});}export async function POST(request){if(request.headers.get('authorization')!=='Bearer synthetic'||request.headers.get('X-Ouchi-App-Epoch')!==epoch)return new Response('',{status:401});const query=new URL(request.url).searchParams,id=query.get('attachmentId');if(query.get('productId')!=='44444444-4444-4444-8444-444444444444')return new Response('',{status:400});const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length!==8||request.headers.get('content-type')!=='image/png')return new Response('',{status:400});state.ids.push(id);if(!state.rows.has(id)){state.creates++;state.rows.set(id,bytes);return new Response('Simulated lost acknowledgement',{status:503});}return Response.json({saved:true,attachmentId:id});}`);
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:directory,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',value=>{logs+=value;});child.stderr.on('data',value=>{logs+=value;});
 const url=`http://127.0.0.1:${port}`;let ready=false;
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Fixture server exited: '+logs);try{const response=await fetch(url,{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,'Fixture did not become ready: '+logs);
 browser=await chromium.launch({headless:true,executablePath:arg('--browser-executable')});const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());
 await page.goto(url);await page.getByRole('heading',{name:'写真・保証書'}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
 await page.getByRole('button',{name:'保存する',exact:true}).click();await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).waitFor();
 await page.getByRole('status').filter({hasText:'保存サービスを確認できませんでした。'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'確認待ちのファイルを確認',exact:true}).click();await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).waitFor();
 await page.getByRole('button',{name:'同じファイルで保存結果を再確認'}).click();await page.getByRole('status').filter({hasText:'保存を確認しました。'}).waitFor();
 const state=await page.evaluate(async()=>await (await fetch('/api/product-attachments?fixture=true',{headers:{Authorization:'Bearer synthetic'}})).json());assert.equal(state.ids.length,2);assert.equal(state.ids[0],state.ids[1]);assert.equal(state.creates,1);
 await page.getByRole('button',{name:'確認待ちのファイルを確認',exact:true}).click();await page.getByRole('status').filter({hasText:'確認待ちのファイルはありません。'}).waitFor();
 await page.getByRole('button',{name:'保存済みファイルを確認',exact:true}).click();await page.getByRole('button',{name:'ファイルを保存',exact:true}).waitFor();
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'ファイルを保存',exact:true}).click();const download=await downloading;assert.equal(download.suggestedFilename(),`ouchi-attachment-${state.ids[0]}.png`);
 if(arg('--screenshot'))await page.screenshot({path:resolve(arg('--screenshot')),fullPage:true});
 await page.evaluate(()=>window.changeFixtureAccount());await page.getByRole('status').filter({hasText:'アカウントが変わりました。'}).waitFor();assert.equal(await page.getByRole('button',{name:'ファイルを保存',exact:true}).count(),0);
 console.log('PASS: actual React controls + browser IndexedDB + native browser fetch to synthetic Next fixture: explicit confirmation, lost acknowledgement retained, reload recovery, same-ID retry, one synthetic object, exact-ID completion, list/download, account-switch clearing. No real Auth/Storage/Apple.');
}catch(error){console.error(logs);throw error;}finally{
 await browser?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}rmSync(directory,{recursive:true,force:true});
}
