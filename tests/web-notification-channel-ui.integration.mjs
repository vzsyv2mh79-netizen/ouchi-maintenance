// Isolated synthetic UI fixture. Selected source only; never copies .env or real credentials.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:undefined;
assert.ok(arg('--playwright-module'));const imported=await import(pathToFileURL(arg('--playwright-module')).href),{chromium}=imported.default??imported;
const directory=mkdtempSync(join(tmpdir(),'ouchi-channel-ui-')),root=process.cwd();let browser,child,logs='';
const write=(name,value)=>{mkdirSync(join(directory,name,'..'),{recursive:true});writeFileSync(join(directory,name),value);};
const account='11111111-1111-4111-8111-111111111111',epoch='33333333-3333-4333-8333-333333333333';
try{
 symlinkSync(join(root,'node_modules'),join(directory,'node_modules'),'dir');
 for(const name of ['components/notification-channel-controls.tsx','lib/web-notification-channel-client.ts','app/globals.css','postcss.config.mjs']){mkdirSync(join(directory,name,'..'),{recursive:true});copyFileSync(join(root,name),join(directory,name));}
 write('package.json',JSON.stringify({name:'disposable-reminder-ui',private:true,type:'module'}));
 write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',jsx:'preserve',module:'ESNext',moduleResolution:'bundler',esModuleInterop:true,strict:true,paths:{'@/*':['./*']}}}));
 write('app/layout.tsx','import "./globals.css";export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}');
 write('app/page.tsx',`"use client";import {NotificationChannelControls} from '@/components/notification-channel-controls';export default function Page(){return <main style={{maxWidth:430,padding:16,margin:'auto'}}><p>合成データによる表示確認</p><NotificationChannelControls account="${account}"/></main>;}`);
 write('lib/supabase.ts',`let signedIn=true;const callbacks=new Set<(event:string,session:unknown)=>void>();declare global{interface Window{fixtureLogout:()=>void;fixtureLogin:()=>void}}const session=()=>signedIn?{user:{id:'${account}'},access_token:'synthetic'}:null;export function getSupabase(){if(typeof window!=='undefined'){window.fixtureLogout=()=>{signedIn=false;callbacks.forEach(callback=>callback('SIGNED_OUT',null));};window.fixtureLogin=()=>{signedIn=true;callbacks.forEach(callback=>callback('SIGNED_IN',session()));};}return {auth:{getSession:async()=>({error:null,data:{session:session()}}),onAuthStateChange:(callback:(event:string,value:unknown)=>void)=>{callbacks.add(callback);queueMicrotask(()=>callback('INITIAL_SESSION',session()));return {data:{subscription:{unsubscribe:()=>callbacks.delete(callback)}}};}}};}`);
 write('app/api/billing/entitlement/route.js',`export async function GET(request){if(request.headers.get('authorization')!=='Bearer synthetic')return new Response('',{status:401});return Response.json({plan:'free',salesEnabled:false,environment:'Production',expiresAt:Date.now()+1000000,productId:'ouchi.premium.monthly',purchaseAccountToken:'${epoch}'},{headers:{'Cache-Control':'no-store'}});}`);
 write('app/api/notification-channel/route.js',`const state=globalThis.channelFixture??={revision:0,channel:'both',writes:0};const response=()=>Response.json({environment:'Production',purchaseAccountToken:'${epoch}',revision:state.revision,channel:state.channel,nativeRegistered:true},{headers:{'Cache-Control':'no-store'}});export async function GET(request){if(new URL(request.url).searchParams.has('fixture'))return Response.json(state);if(request.headers.get('authorization')!=='Bearer synthetic'||request.headers.get('X-Ouchi-App-Epoch')!=='${epoch}')return new Response('',{status:403});return response();}export async function PUT(request){if(request.headers.get('authorization')!=='Bearer synthetic'||request.headers.get('X-Ouchi-App-Epoch')!=='${epoch}')return new Response('',{status:403});const body=await request.json();if(body.revision!==state.revision)return new Response('',{status:409});state.revision++;state.channel=body.channel;state.writes++;if(state.writes===1)return new Response('Synthetic lost ack',{status:503});return response();}`);
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:directory,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_OUCHI_NOTIFICATION_CHANNELS_ENABLED:'true',NEXT_PUBLIC_OUCHI_NOTIFICATION_CHANNEL_ENVIRONMENT:'Production'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',value=>{logs+=value;});child.stderr.on('data',value=>{logs+=value;});
 const url=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Fixture exited: '+logs);try{if((await fetch(url,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,'Fixture timeout');
 browser=await chromium.launch({headless:true,executablePath:arg('--browser-executable')});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 await page.goto(url);
 const save=page.getByRole('button',{name:'受け取り先を保存'}),read=page.getByRole('button',{name:'受け取り先を確認'});
 assert.equal(await save.isDisabled(),true);await read.click();await save.waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='受け取り先を保存').disabled);
 assert.equal(await page.getByLabel('WebとiPhoneの両方',{exact:true}).isChecked(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(arg('--screenshot'))await page.screenshot({path:resolve(arg('--screenshot')),fullPage:true});
 await page.getByLabel('Webだけ',{exact:true}).check();await save.click();await page.getByRole('status').filter({hasText:'保存結果を確認できません。'}).waitFor();assert.equal(await save.isDisabled(),true);
 await read.click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='受け取り先を保存').disabled);assert.equal(await page.getByLabel('Webだけ',{exact:true}).isChecked(),true);
 await page.getByLabel('iPhoneだけ',{exact:true}).check();await save.click();await page.getByRole('status').filter({hasText:'受け取り先の保存を確認しました。'}).waitFor();
 const state=await page.evaluate(async()=>await(await fetch('/api/notification-channel?fixture=true')).json());assert.equal(state.writes,2);assert.equal(state.revision,2);assert.equal(state.channel,'native');
 let held;const started=new Promise(resolve=>{held=resolve;});await page.route('**/api/notification-channel',async route=>{if(route.request().method()==='PUT')held(route);else await route.continue();});
 await save.click();const route=await started;await page.evaluate(()=>window.fixtureLogout());await route.continue().catch(()=>{});await page.unroute('**/api/notification-channel');assert.equal(await save.isDisabled(),true);assert.equal(await page.getByLabel('WebとiPhoneの両方',{exact:true}).isChecked(),true);assert.equal(await page.getByRole('status').filter({hasText:'受け取り先の保存を確認しました。'}).count(),0);
 console.log('PASS: actual React channel controls at 390px; free account choices, no overflow, lost acknowledgement requires fresh read, exact revision advances, logout refuses delayed acknowledgement. Synthetic Auth/server only; no notifications.');

}catch(error){console.error(logs);throw error;}finally{await browser?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}rmSync(directory,{recursive:true,force:true});}
