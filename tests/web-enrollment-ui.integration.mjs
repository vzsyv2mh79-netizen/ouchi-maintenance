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
const directory=mkdtempSync(join(tmpdir(),'ouchi-enrollment-ui-')),root=process.cwd();let browser,child,logs='';
const write=(name,value)=>{mkdirSync(join(directory,name,'..'),{recursive:true});writeFileSync(join(directory,name),value);};
const sessionID='22222222-2222-4222-8222-222222222222',token='e30.'+Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111',session_id:'22222222-2222-4222-8222-222222222222',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
const account='11111111-1111-4111-8111-111111111111',epoch='33333333-3333-4333-8333-333333333333';
try{
 symlinkSync(join(root,'node_modules'),join(directory,'node_modules'),'dir');
 for(const name of ['components/enrollment-controls.tsx','lib/web-enrollment-client.ts','app/globals.css','postcss.config.mjs']){mkdirSync(join(directory,name,'..'),{recursive:true});copyFileSync(join(root,name),join(directory,name));}
 write('package.json',JSON.stringify({name:'disposable-enrollment-ui',private:true,type:'module'}));
 write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',jsx:'preserve',module:'ESNext',moduleResolution:'bundler',esModuleInterop:true,strict:true,paths:{'@/*':['./*']}}}));
 write('app/layout.tsx','import "./globals.css";export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}');
 write('app/page.tsx',`"use client";import {EnrollmentControls} from '@/components/enrollment-controls';export default function Page(){return <main style={{maxWidth:430,padding:16,margin:'auto'}}><p>合成データによる表示確認</p><EnrollmentControls account="${account}"/></main>;}`);
 write('lib/supabase.ts',`let signedIn=true;const callbacks=new Set<(event:string,session:unknown)=>void>();declare global{interface Window{fixtureLogout:()=>void;fixtureLogin:()=>void}}const session=()=>signedIn?{user:{id:'${account}'},access_token:'${token}'}:null;export function getSupabase(){if(typeof window!=='undefined'){window.fixtureLogout=()=>{signedIn=false;callbacks.forEach(callback=>callback('SIGNED_OUT',null));};window.fixtureLogin=()=>{signedIn=true;callbacks.forEach(callback=>callback('SIGNED_IN',session()));};}return {auth:{getSession:async()=>({error:null,data:{session:session()}}),onAuthStateChange:(callback:(event:string,value:unknown)=>void)=>{callbacks.add(callback);queueMicrotask(()=>callback('INITIAL_SESSION',session()));return {data:{subscription:{unsubscribe:()=>callbacks.delete(callback)}}};}}};}`);
 write('app/api/account/enrollment/route.js',`const state=globalThis.enrollmentFixture??={enrolled:false,writes:0};const response=()=>Response.json({userID:'${account}',sessionID:'${sessionID}',epochID:state.enrolled?'${epoch}':null,enrolled:state.enrolled},{headers:{'Cache-Control':'no-store'}});export async function GET(request){if(new URL(request.url).searchParams.has('fixture'))return Response.json(state);return response();}export async function POST(request){const body=await request.json();if(body.confirmation!=='ENROLL_OUCHI_MAINTENANCE'||body.password!=='synthetic')return new Response('',{status:403});state.enrolled=true;state.writes++;return new Response('Synthetic lost ack',{status:503});}`);
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:directory,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_OUCHI_EXPLICIT_ENROLLMENT_ENABLED:'true'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',value=>{logs+=value;});child.stderr.on('data',value=>{logs+=value;});
 const url=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Fixture exited: '+logs);try{if((await fetch(url,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready,'Fixture timeout');
 browser=await chromium.launch({headless:true,executablePath:arg('--browser-executable')});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 await page.goto(url);
 const read=page.getByRole('button',{name:'登録状態を確認'});await read.click();const save=page.getByRole('button',{name:'無料で登録する'});await save.waitFor();assert.equal(await save.isDisabled(),true);
 await page.getByLabel('本人確認のパスワード').fill('synthetic');await page.getByLabel('このログインをおうちメンテで使うことに同意します').check();assert.equal(await save.isEnabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(arg('--screenshot'))await page.screenshot({path:resolve(arg('--screenshot')),fullPage:true});
 await save.click();await page.getByRole('status').filter({hasText:'登録結果を確認できません。'}).waitFor();assert.equal(await save.count(),0);
 await read.click();await page.getByRole('button',{name:'記録を読み込み直す'}).waitFor();assert.equal(await page.getByLabel('本人確認のパスワード').count(),0);assert.equal((await page.evaluate(async()=>await(await fetch('/api/account/enrollment?fixture=true')).json())).writes,1);
 await page.evaluate(()=>window.fixtureLogout());assert.equal(await page.getByRole('button',{name:'記録を読み込み直す'}).count(),0);
 console.log('PASS: actual React enrollment UI at 390px; explicit unchecked consent/password, lost acknowledgement requires readback without second write, password cleared, account logout clears receipt. Synthetic Auth/server only.');

}catch(error){console.error(logs);throw error;}finally{await browser?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}rmSync(directory,{recursive:true,force:true});}
