/** Shipping React/Auth/enrollment/review composition against disposable services.
 * HTTPS/gateway, driver host alias and Management policy remain explicit fixtures.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {Client} from 'pg';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
assert.equal(process.env.OUCHI_ACCOUNT_INTAKE_SERVICE_TEST,'true');
const ports={db:Number(process.env.OUCHI_TEST_DB_PORT),auth:Number(process.env.OUCHI_TEST_AUTH_PORT),rest:Number(process.env.OUCHI_TEST_REST_PORT)};
assert.ok(Object.values(ports).every(p=>Number.isInteger(p)&&p>1024&&p<65536));
const dbConfig={host:'127.0.0.1',port:ports.db,user:'postgres',password:'synthetic-ci-only',database:'auth_test',query_timeout:5000},db=new Client(dbConfig);
const projectID='abcdefghijklmnopqrst',authURL='https://'+projectID+'.supabase.co',origin='https://ouchi-maintenance.vercel.app',publicKey='sb_publishable_synthetic_intake_fixture';
const originalFetch=globalThis.fetch,modules=new Map(),sources={},calls=[],authCalls=[],checks=[];
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),message=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
const serviceJWT=message+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(message).digest('base64url');
const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'ouchi-intake-react-')),output=process.env.OUCHI_TEST_REACT_OUTPUT;
assert.ok(output);mkdirSync(output,{recursive:true});let browser,page,child,server,logs='',dropReply=true;
function compile(name){
 if(modules.has(name))return modules.get(name);
 if(name==='postgres-driver.mjs'){
  const source=`import {Client} from ${JSON.stringify(import.meta.resolve('pg'))};import assert from 'node:assert/strict';export function createPostgresClient(config){assert.equal(config.host,'db.${projectID}.supabase.co');assert.equal(config.ssl.rejectUnauthorized,true);const roles={'ouchi_closure_review_runtime':'ouchi_intake_review_ci','ouchi_closure_progress_runtime':'ouchi_intake_progress_ci'};assert.ok(roles[config.user]);return new Client({...config,host:'127.0.0.1',port:${ports.db},database:'auth_test',user:roles[config.user],password:'synthetic-intake-only',ssl:false});}`;
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
 }
 if(name.endsWith('.mjs'))return import.meta.resolve('../../lib/'+name);
 const path='lib/'+name+'.ts';sources[path]=createHash('sha256').update(readFileSync(path)).digest('hex');
 let code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');
 code=code.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.href==='https://api.supabase.com/v1/projects/'+projectID+'/config/auth')return Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false});
 if(url.origin===authURL){
  assert.ok(url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/rest/v1/rpc/'));
  const isAuth=url.pathname.startsWith('/auth/v1/'),prefix=isAuth?'/auth/v1':'/rest/v1',port=isAuth?ports.auth:ports.rest;
  const response=await originalFetch('http://127.0.0.1:'+port+url.pathname.slice(prefix.length)+url.search,init);
  if(isAuth)authCalls.push({path:url.pathname,method:init?.method??'GET',scope:url.searchParams.get('scope'),status:response.status});
  return new Response(response.body,{status:response.status,headers:response.headers});
 }
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');return originalFetch(input,init);
};
try{
 await db.connect();await db.query("update maintenance_private.enrollment_policy set require_explicit=true;update maintenance_private.account_closure_review_policy set enabled=true");
 await db.query("create role ouchi_intake_review_ci login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-intake-only';grant ouchi_closure_review_executor to ouchi_intake_review_ci;create role ouchi_intake_progress_ci login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-intake-only';grant ouchi_closure_progress_reader to ouchi_intake_progress_ci");
 const email=randomUUID()+'@example.invalid',password=randomUUID()+'aA7!';
 const signup=await originalFetch('http://127.0.0.1:'+ports.auth+'/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(signup.ok,true);const registered=await signup.json(),account=registered.user.id,originalSession=JSON.parse(Buffer.from(registered.access_token.split('.')[1],'base64url')).session_id;
 const {accountEnrollmentResponse}=await import(compile('account-enrollment-service')),{createEnrollmentAuthClient}=await import(compile('enrollment-auth-client'));
 const enrollmentConfig={url:authURL,key:serviceJWT,publishableKey:publicKey};
 const enrollment=request=>accountEnrollmentResponse(request,enrollmentConfig,{database:c=>createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false}}),temporaryAuth:createEnrollmentAuthClient});
 const database=user=>({host:'db.'+projectID+'.supabase.co',port:5432,database:'postgres',user,password:'synthetic-runtime-only',ssl:{rejectUnauthorized:true}});
 const {createAccountClosureReviewRuntime}=await import(compile('account-closure-review-runtime')),{createClosureSubmissionProgressRuntime}=await import(compile('closure-submission-progress-runtime'));
 const common={projectID,authURL,publishableKey:publicKey};
 const review=createAccountClosureReviewRuntime({...common,accessToken:'synthetic-config-read-only',role:'ouchi_closure_review_runtime',database:database('ouchi_closure_review_runtime')});
 const progress=createClosureSubmissionProgressRuntime({...common,role:'ouchi_closure_progress_runtime',database:database('ouchi_closure_progress_runtime')});
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin);assert.equal(req.socket.remoteAddress,'127.0.0.1');assert.equal(url.search,'');
   const chunks=[];let size=0;for await(const c of req){size+=c.length;assert.ok(size<=4096);chunks.push(c);}const bytes=Buffer.concat(chunks),body=bytes.length?JSON.parse(bytes):null;
   const request=new Request(url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
   const action=url.pathname.split('/').at(-1);const response=url.pathname==='/api/account/enrollment'?await enrollment(request):action==='progress'?await progress(request):await review(request,action);
   calls.push({path:url.pathname,method:req.method,status:response.status,submissionID:body?.submissionID??null});
   if(action==='request'&&response.status===202&&dropReply){dropReply=false;await response.arrayBuffer();res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"synthetic lost committed acknowledgement"}');return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){writeFileSync(join(output,'adapter-failure.log'),String(error));res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"fixture adapter failed"}');}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const backend='http://127.0.0.1:'+server.address().port;
 const paths=['components/cloud-account.tsx','components/closure-saved-read-controls.tsx','components/account-closure-controls.tsx','components/enrollment-controls.tsx','components/attachment-removal-recovery.tsx','lib/supabase.ts','lib/web-closure-read-types.ts','lib/web-closure-read-client.ts','lib/web-closure-read-vault.ts','lib/web-closure-transport.ts','lib/web-closure-progress-client.ts','lib/web-closure-review-client.ts','lib/web-closure-reference-store.ts','lib/web-enrollment-client.ts','lib/attachment-auth-lifecycle.ts','lib/pending-attachment-store.ts','lib/attachment-client.ts','lib/attachment-removal-flow.ts','lib/attachment-upload-flow.ts','app/globals.css','postcss.config.mjs'];
 for(const path of paths){mkdirSync(join(dir,path,'..'),{recursive:true});copyFileSync(join(root,path),join(dir,path));sources[path]=createHash('sha256').update(readFileSync(path)).digest('hex');}
 const write=(p,v)=>{mkdirSync(join(dir,p,'..'),{recursive:true});writeFileSync(join(dir,p),v);};
 symlinkSync(join(root,'node_modules'),join(dir,'node_modules'),'dir');write('package.json',JSON.stringify({name:'disposable-actual-account-intake',private:true,type:'module'}));write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',jsx:'preserve',module:'ESNext',moduleResolution:'bundler',esModuleInterop:true,strict:true,paths:{'@/*':['./*']}}}));
 write('app/layout.tsx','import "./globals.css";export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>;}');
 write('app/page.tsx',`"use client";import {CloudAccount} from '@/components/cloud-account';export default function Page(){return <main style={{maxWidth:430,margin:'auto',padding:16}}><p>実認証・登録・退会受付の確認用。架空データのみ</p><CloudAccount disabled={false}/></main>;}`);
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 child=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:dir,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:authURL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publicKey,NEXT_PUBLIC_OUCHI_EXPLICIT_ENROLLMENT_ENABLED:'true',NEXT_PUBLIC_OUCHI_ACCOUNT_REVIEW_ENABLED:'true',NEXT_PUBLIC_OUCHI_CLOSURE_READ_CUSTODY_ENABLED:'false',NEXT_PUBLIC_OUCHI_ATTACHMENTS_ENABLED:'false'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',v=>{logs+=v;});child.stderr.on('data',v=>{logs+=v;});const frontend='http://127.0.0.1:'+port;
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Next exited');try{if((await originalFetch(frontend,{signal:AbortSignal.timeout(2000)})).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready);
 const {chromium}=await import(process.env.OUCHI_TEST_PLAYWRIGHT_MODULE);browser=await chromium.launch({executablePath:process.env.OUCHI_TEST_BROWSER_EXECUTABLE,headless:true});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.ok([origin,authURL].includes(url.origin),'No external browser network');
  if(url.origin===authURL){const cors={'access-control-allow-origin':origin,'access-control-allow-headers':req.headers()['access-control-request-headers']??'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,DELETE,OPTIONS'};if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}assert.ok(url.pathname.startsWith('/auth/v1/'));const response=await originalFetch('http://127.0.0.1:'+ports.auth+url.pathname.slice('/auth/v1'.length)+url.search,{method:req.method(),headers:req.headers(),body:req.postDataBuffer()??undefined,redirect:'error'});await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),...cors},body:Buffer.from(await response.arrayBuffer())});return;}
  const isAPI=url.pathname.startsWith('/api/');if(isAPI)assert.ok(url.pathname==='/api/account/enrollment'||/^\/api\/account\/closure-review\/(request|read|cancel|progress)$/.test(url.pathname));
  const response=await originalFetch((isAPI?backend:frontend)+url.pathname+url.search,{method:req.method(),headers:req.headers(),body:req.postDataBuffer()??undefined,redirect:'error'});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('dialog',dialog=>dialog.accept());await page.goto(origin);
 await page.getByLabel('メールアドレス',{exact:true}).fill(email);await page.getByLabel('パスワード（8文字以上）',{exact:true}).fill(password);await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.getByText(email,{exact:true}).waitFor();
 const browserSession=(await db.query('select id from auth.sessions where user_id=$1 and id<>$2 order by created_at desc limit 1',[account,originalSession])).rows[0].id;
 assert.equal((await db.query('select count(*)::int n from maintenance_private.app_epochs where user_id=$1',[account])).rows[0].n,0);
 await page.getByRole('button',{name:'登録状態を確認',exact:true}).click();await page.getByText('このログインはまだおうちメンテに登録されていません。',{exact:true}).waitFor();
 await page.getByLabel('本人確認のパスワード',{exact:true}).fill(password);await page.getByRole('checkbox',{name:'このログインをおうちメンテで使うことに同意します'}).check();await page.getByRole('button',{name:'無料で登録する',exact:true}).click();await page.getByText('このログインのおうちメンテ登録を確認しました。',{exact:true}).waitFor();
 const epoch=(await db.query('select epoch_id from maintenance_private.app_epochs where user_id=$1 and enabled',[account])).rows[0].epoch_id;assert.equal((await db.query('select count(*)::int n from maintenance_private.enrollment_consents where user_id=$1',[account])).rows[0].n,1);checks.push('Actual SDK login and consent form create one app epoch/consent via real temporary GoTrue reauthentication and SQL; no seeded app enrollment');
 const control=page.getByRole('region',{name:'おうちメンテからの退会',exact:true});await control.getByRole('button',{name:'退会の手続きを確認',exact:true}).click();await control.getByLabel('退会申請の本人確認パスワード',{exact:true}).fill('Wrong-synthetic-password');await control.getByRole('checkbox').check();await control.getByRole('button',{name:'退会を申請する',exact:true}).click();await control.getByRole('status').filter({hasText:'結果を確認できませんでした。'}).waitFor();
 assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[account])).rows[0].n,0);
 await control.getByRole('button',{name:'保存した申請の状況を確認',exact:true}).click();await control.getByRole('button',{name:'同じ申請番号で再送を確認',exact:true}).waitFor();await control.getByRole('button',{name:'同じ申請番号で再送を確認',exact:true}).click();await control.getByLabel('退会申請の本人確認パスワード',{exact:true}).fill(password);await control.getByRole('checkbox').check();await control.getByRole('button',{name:'同じ申請番号で再送する',exact:true}).click();await control.getByRole('status').filter({hasText:'結果を確認できませんでした。'}).waitFor();assert.equal(dropReply,false);
 const reviews=(await db.query('select submission_id,state,app_epoch_id from maintenance_private.account_closure_reviews where user_id=$1',[account])).rows;assert.equal(reviews.length,1);assert.equal(reviews[0].state,'review_required');assert.equal(reviews[0].app_epoch_id,epoch);
 await page.reload();await page.getByText(email,{exact:true}).waitFor();await control.getByLabel('保存した退会申請',{exact:true}).selectOption(reviews[0].submission_id);await control.getByRole('button',{name:'保存した申請の状況を確認',exact:true}).click();await control.getByText('退会申請を受け付けました。',{exact:false}).waitFor();
 assert.equal(calls.filter(c=>c.path.endsWith('/request')).length,2);assert.equal(new Set(calls.filter(c=>c.path.endsWith('/request')).map(c=>c.submissionID)).size,1);assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[account])).rows[0].n,1);checks.push('Real wrong-password reauthentication creates no review; explicit same-ID retry accepts once; lost accepted reply is recovered after browser reload by fresh read without another write');
 await page.screenshot({path:join(output,'real-auth-enrollment-review-recovered.png'),fullPage:true});await control.getByRole('button',{name:'退会申請を取り消す',exact:true}).click();await control.getByText('退会申請の取消を確認しました。',{exact:true}).waitFor();assert.equal((await db.query('select state from maintenance_private.account_closure_reviews where user_id=$1',[account])).rows[0].state,'cancelled');
 const sessions=(await db.query('select id from auth.sessions where user_id=$1 order by id',[account])).rows.map(r=>r.id);assert.deepEqual(sessions,[originalSession,browserSession].sort());checks.push('Actual scoped cancellation succeeds; original and browser Auth sessions survive while temporary enrollment/review sessions are cleaned up');
 let nativeIntake=null;if(process.env.OUCHI_NATIVE_INTAKE_SERVICE_TEST==='true'){const {verifyNativeAccountIntake}=await import('./native-account-intake-service.mjs');nativeIntake=await verifyNativeAccountIntake({backendPort:server.address().port,authPort:ports.auth,db,resetDropReply:()=>{dropReply=true;},output});checks.push('Actual native default URLSession sign-in, explicit consent, same-number failed-proof/lost-ack recovery and cancellation against the same real GoTrue/SQL runtime; original sessions preserved');}
 for(const [p,h] of Object.entries(sources))assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),h,p);
 const result={status:'passed',nativeIntake,checks,sources,driverSHA256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),calls,authCalls,actualReactSDKGoTruePostgreSQL:true,syntheticManagementPolicy:true,loopbackGatewayAndTLSAlias:true,productionChanged:false,realBillingEnabled:false,notVerified:['Native original enrollment/intake UI, actual managed gateway/TLS and policy settings','Retirement operator worker execution and real personal-data classification','Safari/physical device, final rollout/retention, Apple Sandbox/TestFlight/App Review']};writeFileSync(join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){writeFileSync(join(output,'failure.log'),String(error)+'\n'+logs);if(page){await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(join(output,'failure-ui.txt'),await page.locator('body').innerText().catch(()=>''));}throw error;}
finally{globalThis.fetch=originalFetch;await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));child?.kill('SIGTERM');if(child&&child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));await db.end();rmSync(dir,{recursive:true,force:true});}
