import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createServer,request as proxyRequest} from 'node:http';import {randomUUID} from 'node:crypto';import ts from 'typescript';import {createClient} from '@supabase/supabase-js';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleURL=path=>'data:text/javascript;base64,'+Buffer.from(compile(path)).toString('base64');
const {handleTestAccountClosure}=await import(moduleURL('lib/account-closure.ts'));
const {sessionAfterAuthVerification}=await import(moduleURL('lib/verified-app-session.ts'));
// Explicit integration invocation only. Ordinary pnpm test does not run this file.
// GoTrue and DB are disposable CI containers; no SMTP, real users or shared DB.
test('real Auth verifies bearer and password before the cleanup boundary', {skip:process.env.OUCHI_REAL_AUTH_TEST!=='true',timeout:30000},async()=>{
 const gateway=createServer((request,response)=>{
  if(!request.url?.startsWith('/auth/v1/')){response.writeHead(404).end();return;}
  const upstream=proxyRequest('http://127.0.0.1:9999'+request.url.slice('/auth/v1'.length),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const client=()=>createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const auth=client(),email='test-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
  const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.user&&signup.data.session);
  const account=signup.data.user.id,bearer=signup.data.session.access_token;
  const extracted=sessionAfterAuthVerification(bearer,account);assert.ok(extracted);
  let closed=0;
  let temporaryRefreshToken=null;
  const dependencies={
   verify:async token=>{const {data,error}=await client().auth.getUser(token);if(error||!data.user?.email)return null;const identity=sessionAfterAuthVerification(token,data.user.id);return identity?{id:identity.userID,email:data.user.email,sessionID:identity.sessionID}:null;},
   reauthenticate:async(address,secret)=>{const temporary=client();try{const {data,error}=await temporary.auth.signInWithPassword({email:address,password:secret});if(!error&&data.session)temporaryRefreshToken=data.session.refresh_token;return !error&&data.user&&data.session?data.user.id:null;}finally{const {error}=await temporary.auth.signOut({scope:'local'});if(error)throw error;}},
   // App DB cleanup is deliberately a recorder here. Its atomic/RLS tests are
   // separate; this test proves real Auth, not complete deletion or PostgREST.
   close:async(id,session)=>{assert.equal(id,account);assert.equal(session,extracted.sessionID);closed++;return true;}
  };
  const action=(token,secret)=>new Request('http://localhost/api/development/account-closure',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({confirmation:'DELETE_OUCHI_MAINTENANCE',password:secret})});
  const parts=bearer.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  assert.equal((await handleTestAccountClosure(action(parts.join('.'),password),dependencies)).status,401);assert.equal(closed,0);
  assert.equal((await handleTestAccountClosure(action(bearer,'wrong-synthetic-password'),dependencies)).status,403);assert.equal(closed,0);
  assert.equal((await handleTestAccountClosure(action(bearer,password),dependencies)).status,200);assert.equal(closed,1);
  assert.ok(temporaryRefreshToken);
  const revoked=await client().auth.refreshSession({refresh_token:temporaryRefreshToken});
  assert.ok(revoked.error,'temporary refresh token must be revoked');
  assert.equal(revoked.data.session,null);
  const original=await client().auth.refreshSession({refresh_token:signup.data.session.refresh_token});
  assert.equal(original.error,null);assert.equal(original.data.user?.id,account);assert.ok(original.data.session);
  assert.equal((await client().auth.getUser(bearer)).data.user?.id,account);
 }finally{gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
