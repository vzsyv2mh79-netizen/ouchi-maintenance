import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createServer,request as proxyRequest} from 'node:http';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import ts from 'typescript';import {createClient} from '@supabase/supabase-js';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleURL=path=>'data:text/javascript;base64,'+Buffer.from(compile(path)).toString('base64');
const {handleTestAccountClosure}=await import(moduleURL('lib/account-closure.ts'));
const {sessionAfterAuthVerification}=await import(moduleURL('lib/verified-app-session.ts'));
// Explicit integration invocation only. Ordinary pnpm test does not run this file.
// GoTrue and DB are disposable CI containers; no SMTP, real users or shared DB.
test('real Auth session drives isolated closure and explicit reenrollment without old-session resurrection', {skip:process.env.OUCHI_REAL_AUTH_TEST!=='true',timeout:30000},async()=>{
 const gateway=createServer((request,response)=>{
  if(!request.url?.startsWith('/auth/v1/')){response.writeHead(404).end();return;}
  const upstream=proxyRequest('http://127.0.0.1:9999'+request.url.slice('/auth/v1'.length),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 const db=new PGlite();
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const client=()=>createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const auth=client(),email='test-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
  const signup=await auth.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.user&&signup.data.session);
  const account=signup.data.user.id,bearer=signup.data.session.access_token;
  const extracted=sessionAfterAuthVerification(bearer,account);assert.ok(extracted);
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
 for(const file of ['20261001144732_household_storage.sql','20261001232931_atomic_import.sql','20261001233450_household_sharing.sql','20261001235138_account_data_erasure.sql','20261002004530_push_reminders.sql','20261005134316_cloud_backup_restore.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 for(const file of ['account-access-prototype.sql','account-epochs-prototype.sql'])await db.exec(readFileSync('ios/Tests/Fixtures/'+file,'utf8'));
 // Integration experiment only. Production needs authenticated session validation,
 // migration of existing sessions and consistent use at every privileged boundary.
 await db.exec(`create or replace function maintenance_private.account_enabled() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from maintenance_private.account_access x join maintenance_private.app_epochs a on a.user_id=x.user_id and a.enabled join maintenance_private.app_session_epochs s on s.user_id=a.user_id and s.epoch_id=a.epoch_id where x.user_id=auth.uid() and x.enabled and s.session_id=case when auth.jwt()->>'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (auth.jwt()->>'session_id')::uuid else null end)$$;`);

  await db.query('insert into auth.users values($1)',[account]);
  await db.query('insert into maintenance_private.account_access values($1,true)',[account]);
  const service=()=>db.exec('reset role;set role service_role');
  const user=async(identity)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[identity.userID,JSON.stringify({session_id:identity.sessionID})]);await db.exec('set role authenticated');};
  await service();await db.query('select maintenance_private.enroll_app_epoch($1,$2)',[account,extracted.sessionID]);
  await user(extracted);const oldHome=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];
  let closed=0;
  let temporaryRefreshToken=null;
  const dependencies={
   verify:async token=>{const {data,error}=await client().auth.getUser(token);if(error||!data.user?.email)return null;const identity=sessionAfterAuthVerification(token,data.user.id);return identity?{id:identity.userID,email:data.user.email,sessionID:identity.sessionID}:null;},
   reauthenticate:async(address,secret)=>{const temporary=client();try{const {data,error}=await temporary.auth.signInWithPassword({email:address,password:secret});if(!error&&data.session)temporaryRefreshToken=data.session.refresh_token;return !error&&data.user&&data.session?data.user.id:null;}finally{const {error}=await temporary.auth.signOut({scope:'local'});if(error)throw error;}},
   // Real Auth-verified identity feeds isolated PGlite RLS/RPC fixtures.
   // No PostgREST or shared production database is involved.
   close:async(id,session)=>{assert.equal(id,account);assert.equal(session,extracted.sessionID);await service();const changed=(await db.query('select public.close_maintenance_app_identity($1,$2) as changed',[id,session])).rows[0].changed;closed++;return changed;}
  };
  const action=(token,secret)=>new Request('http://localhost/api/development/account-closure',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({confirmation:'DELETE_OUCHI_MAINTENANCE',password:secret})});
  const parts=bearer.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  assert.equal((await handleTestAccountClosure(action(parts.join('.'),password),dependencies)).status,401);assert.equal(closed,0);
  assert.equal((await handleTestAccountClosure(action(bearer,'wrong-synthetic-password'),dependencies)).status,403);assert.equal(closed,0);
  assert.equal((await handleTestAccountClosure(action(bearer,password),dependencies)).status,200);assert.equal(closed,1);
  await user(extracted);assert.equal((await db.query('select * from public.homes')).rows.length,0);
  await assert.rejects(()=>db.query('select public.load_household()'));
  assert.ok(temporaryRefreshToken);
  const revoked=await client().auth.refreshSession({refresh_token:temporaryRefreshToken});
  assert.ok(revoked.error,'temporary refresh token must be revoked');
  assert.equal(revoked.data.session,null);
  const original=await client().auth.refreshSession({refresh_token:signup.data.session.refresh_token});
  assert.equal(original.error,null);assert.equal(original.data.user?.id,account);assert.ok(original.data.session);
  assert.equal((await client().auth.getUser(bearer)).data.user?.id,account);
  // Shared Auth can remain valid while app access is closed. A fresh verified
  // login cannot grant app access until explicit new enrollment occurs.
  const next=await client().auth.signInWithPassword({email,password});assert.equal(next.error,null);assert.ok(next.data.session);
  const checked=await client().auth.getUser(next.data.session.access_token);assert.equal(checked.error,null);
  const fresh=sessionAfterAuthVerification(next.data.session.access_token,checked.data.user.id);assert.ok(fresh);assert.notEqual(fresh.sessionID,extracted.sessionID);
  await user(fresh);await assert.rejects(()=>db.query('select public.load_household()'));
  await service();await db.query('select maintenance_private.reenroll_app_identity($1,$2)',[fresh.userID,fresh.sessionID]);
  await user(extracted);await assert.rejects(()=>db.query('select public.load_household()'));
  await user(fresh);const newHome=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];assert.notEqual(newHome.id,oldHome.id);
  await service();await assert.rejects(()=>db.query('select public.close_maintenance_app_identity($1,$2)',[account,extracted.sessionID]));
  await user(fresh);assert.equal((await db.query('select * from public.homes')).rows.length,1);
 }finally{await db.close();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
