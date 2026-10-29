// Isolated real GoTrue + PostgreSQL; no production credentials or customer data.
import test from 'node:test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {startFixtureGoTrue} from './fixtures/scoped-native-gotrue.mjs';
import {maintenanceMigrationCatalog} from '../scripts/maintenance-migration-plan.mjs';
import {startEnrollmentPostgREST} from './fixtures/enrollment-postgrest.mjs';
import {startEnrollmentUIGateway} from './fixtures/enrollment-ui-gateway.mjs';
const modules=new Map();
function compile(name){
 if(modules.has(name))return modules.get(name);
 let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(compile(n)));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
const {accountEnrollmentResponse}=await import(compile('account-enrollment-service'));
test('real Auth/SQL enrollment preserves original session and recovers without a second consent',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();
 let auth,service,gateway,rest;
 try{
  await admin.query('create role postgres;create schema auth');
  await admin.query(readFileSync('tests/fixtures/auth/rest-bootstrap.sql','utf8'));
  auth=await startFixtureGoTrue(socket,'https://hphifiqyypwyxkzfanod.supabase.co/auth/v1');
  const fullSchema=process.env.OUCHI_ENROLLMENT_FULL_SCHEMA==='1';
  assert.ok(!fullSchema||!process.env.OUCHI_ENROLLMENT_UI_OUTPUT,'Full-schema UI mode needs its own mapped-session assertions before use');
  if(fullSchema){
   const catalog=maintenanceMigrationCatalog();
   for(const entry of catalog)await admin.query(readFileSync(entry.file,'utf8'));
   console.log('Applied pinned full migration catalog: '+catalog.length);
  }else{
  for(const name of ['20261001144732_household_storage.sql','20261001233450_household_sharing.sql','20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261011122749_ouchi_explicit_enrollment_guard.sql','20261011123511_ouchi_explicit_enrollment_consent.sql','20261011140432_ouchi_explicit_policy_latch.sql'])await admin.query(readFileSync('supabase/migrations/'+name,'utf8'));
  const live=readFileSync('supabase/migrations/20261011052015_ouchi_deletion_live_session.sql','utf8');
  await admin.query(live.slice(live.indexOf('create function public.maintenance_auth_session_is_current'),live.indexOf('$$;')+3));
  await admin.query('revoke all on function public.maintenance_auth_session_is_current(uuid,uuid) from public;grant execute on function public.maintenance_auth_session_is_current(uuid,uuid) to service_role');
  }
  service=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await service.connect();await service.query('set role service_role');
  const user=randomUUID(),password=randomBytes(24).toString('hex'),email='enrollment-'+randomUUID()+'@fixture.invalid';
  await auth.createFixtureUser(user,email,password);
  // Real household tables and original RLS, populated before any consent.
  const family=randomUUID(),outsider=randomUUID(),home=randomUUID(),product=randomUUID(),task=randomUUID();
  for(const id of [family,outsider])await auth.createFixtureUser(id,'family-'+id+'@fixture.invalid',password);
  await admin.query("insert into public.homes(id,owner_id,name) values($1,$2,'Synthetic existing home')",[home,user]);
  await admin.query("insert into public.home_members(\"homeId\",user_id,nickname) values($1,$2,'Synthetic family')",[home,family]);
  await admin.query("insert into public.products(id,\"homeId\",\"categoryId\",name) values($1,$2,'air','Synthetic existing appliance')",[product,home]);
  await admin.query("insert into public.maintenance_tasks(id,\"productId\",name,kind,\"intervalDays\",\"nextDueAt\",\"sourceKind\") values($1,$2,'Synthetic care','掃除',30,current_date,'ユーザー設定')",[task,product]);
  await admin.query('insert into public.maintenance_history("taskId","productId","completedAt") values($1,$2,current_date)',[task,product]);
  const householdSnapshot=async()=>{
   const result={};
   for(const table of ['homes','home_members','products','maintenance_tasks','maintenance_history'])
    result[table]=(await admin.query('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\'::jsonb) value from public.'+table+' t')).rows[0].value;
   return result;
  };
  const originalHousehold=await householdSnapshot();
  const verifyHousehold=async(enrolled=false)=>{
   assert.deepEqual(await householdSnapshot(),originalHousehold,'Enrollment must preserve all existing family records byte-for-byte');
   for(const [actor,expected] of [[user,fullSchema&&!enrolled?[]:[product]],[family,fullSchema?[]:[product]],[outsider,[]]]){
    await admin.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,session_id:actor===user?sessionID:undefined})]);
    await admin.query('set role authenticated');
    try{assert.deepEqual((await admin.query('select id from public.products order by id')).rows.map(r=>r.id),expected,'Original household RLS preserves family access and rejects outsiders');}
    finally{await admin.query('reset role');}
   }
  };
  const uiMode=process.env.OUCHI_ENROLLMENT_UI_OUTPUT;
  if(uiMode)assert.ok(process.env.OUCHI_ENROLLMENT_UI_PREPARED,'Build UI target before creating fixture login');
  const login=uiMode?null:await auth.request('/token?grant_type=password',{email,password});let token=login?.access_token;
  const sessionID=token?JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id:null;
  const accountOpen=async(session)=>{
   await admin.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})]);
   return (await admin.query('select maintenance_private.maintenance_account_is_open() open')).rows[0].open;
  };
  if(!uiMode)assert.equal(await accountOpen(sessionID),true,'Existing free access remains before strict rollout');
  await admin.query('update maintenance_private.enrollment_policy set require_explicit=true');
  if(!uiMode)assert.equal(await accountOpen(sessionID),false,'Unmapped session must enroll after strict rollout');
  if(process.env.OUCHI_TEST_POSTGREST_BINARY){assert.equal(fullSchema,true);rest=await startEnrollmentPostgREST(socket,auth.fixtureJWTSecret);}
  const calls=[];
  const signatures={maintenance_auth_session_is_current:['target_user','verified_session'],maintenance_explicit_enrollment_is_required:[],read_maintenance_explicit_enrollment:['target_user','verified_session'],enroll_maintenance_app_with_consent:['target_user','verified_session','reauthenticated_session','target_request']};
  const database={auth:{getUser:async bearer=>{try{return {data:{user:await auth.request('/user',undefined,bearer)},error:null};}catch{return {data:{user:null},error:Error('Fixture Auth refused')};}}},rpc:async(name,args={})=>{
   assert.ok(Object.hasOwn(signatures,name));calls.push(name);const keys=signatures[name];assert.deepEqual(Object.keys(args).sort(),[...keys].sort());
   if(rest){const response=await rest.request('/rpc/'+name,undefined,args);return {data:response.ok?await response.json():null,error:response.ok?null:Error('Fixture PostgREST refused '+response.status)};}
   try{return {data:(await service.query('select public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') as result',keys.map(k=>args[k]))).rows[0].result,error:null};}catch{return {data:null,error:Error('Fixture SQL refused')};}
  }};
  const factories={database:()=>database,temporaryAuth:()=>createClient(auth.origin,'synthetic-publishable',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
   const url=new URL(input instanceof Request?input.url:String(input));assert.equal(url.origin,auth.origin);assert.ok(url.pathname.startsWith('/auth/v1/'));
   return fetch(auth.origin+url.pathname.slice('/auth/v1'.length)+url.search,{...init,redirect:'error'});
  }}})};
  const config={url:'https://fixture.supabase.co',key:'unused-sql-adapter',publishableKey:'synthetic-publishable'};
  const request=(method,pass=password)=>new Request('http://127.0.0.1/api/account/enrollment',{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:method==='POST'?JSON.stringify({password:pass,confirmation:'ENROLL_OUCHI_MAINTENANCE',requestID:randomUUID()}):undefined});
  gateway=await startEnrollmentUIGateway({authOrigin:auth.origin,authPort:uiMode?54321:0,enrollmentPort:uiMode?3000:0,handleEnrollment:r=>accountEnrollmentResponse(r,config,factories)});
  const handle=async r=>fetch(gateway.enrollmentURL,{method:r.method,headers:r.headers,body:r.method==='POST'?await r.text():undefined,redirect:'error'});
  if(uiMode){
   // Keep the event loop free so XCTest can reach actual Auth and SQL over HTTP.
   await new Promise((resolve,reject)=>{
    const child=spawn('python3',['ios/scripts/test-explicit-enrollment-interactions.py','--output',uiMode,'--prepared',process.env.OUCHI_ENROLLMENT_UI_PREPARED],{
     stdio:['ignore','inherit','inherit'],env:{...process.env,OUCHI_ENROLLMENT_REAL_FIXTURE:'1',OUCHI_ENROLLMENT_TEST_EMAIL:email,OUCHI_ENROLLMENT_TEST_PASSWORD:password}
    });
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error('Enrollment UI runner failed: '+(signal??code))));
   });
   assert.equal(gateway.evidence.lostAcknowledgements,1);
   assert.equal(gateway.evidence.enrollmentPosts,1,'Read recovery must never repeat consent');
   assert.ok(gateway.evidence.enrollmentReads>=2);
   assert.ok(gateway.evidence.recordDenials>=1);
   assert.equal(calls.filter(n=>n==='enroll_maintenance_app_with_consent').length,1);
   assert.equal((await admin.query('select count(*)::int n from maintenance_private.enrollment_consents where user_id=$1',[user])).rows[0].n,1);
   assert.equal((await admin.query('select count(*)::int n from maintenance_private.app_epochs where user_id=$1',[user])).rows[0].n,1);
   assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1',[user])).rows[0].n,1,'Only original UI login remains after reauthentication cleanup');
   await verifyHousehold();
   return;
  }
  assert.equal((await(await handle(request('GET'))).json()).enrolled,false);
  assert.equal((await handle(request('POST','incorrect-synthetic-password'))).status,503);
  assert.equal(calls.filter(n=>n==='enroll_maintenance_app_with_consent').length,0,'Wrong password must not reach the consent writer');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.enrollment_consents where user_id=$1',[user])).rows[0].n,0,'Rejected proof must leave no consent');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.app_epochs where user_id=$1',[user])).rows[0].n,0,'Rejected proof must not create an app epoch');
  assert.deepEqual((await admin.query('select id from auth.sessions where user_id=$1',[user])).rows.map(r=>r.id),[sessionID],'Wrong password must preserve the original login without a temporary session');
  assert.equal((await auth.request('/user',undefined,token)).id,user);
  assert.equal((await(await handle(request('GET'))).json()).enrolled,false,'Readback must not claim registration after rejected proof');
  assert.equal(await accountOpen(sessionID),false,'Rejected proof must not grant record access');
  await verifyHousehold();
  const committed=await handle(request('POST'));assert.equal(committed.status,503);
  assert.equal(gateway.evidence.lostAcknowledgements,1);
  // The HTTP gateway loses only the successful committed response; recover by GET.
  const result=await(await handle(request('GET'))).json();assert.equal(result.enrolled,true);assert.equal(result.userID,user);assert.equal(result.sessionID,sessionID);
  assert.equal(await accountOpen(sessionID),true,'Successful consent restores the actual admission predicate');
  assert.equal(calls.filter(n=>n==='enroll_maintenance_app_with_consent').length,1);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.enrollment_consents where user_id=$1',[user])).rows[0].n,1);
  assert.deepEqual((await admin.query('select id from auth.sessions where user_id=$1',[user])).rows.map(r=>r.id),[sessionID],'Temporary reauthentication session removed; original remains');
  assert.equal((await auth.request('/user',undefined,token)).id,user);
  // An existing user on a new session needs consent, but keeps the same epoch.
  token=(await auth.request('/token?grant_type=password',{email,password})).access_token;
  const newSession=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
  assert.notEqual(newSession,sessionID);
  assert.equal(await accountOpen(newSession),false,'New session cannot inherit another login mapping');
  assert.equal(await accountOpen(sessionID),true,'Existing mapped login remains available');
  assert.equal((await(await handle(request('GET'))).json()).enrolled,false);
  assert.equal((await handle(request('POST'))).status,200);
  const recovered=await(await handle(request('GET'))).json();
  assert.equal(recovered.epochID,result.epochID);assert.equal(recovered.sessionID,newSession);
  assert.equal(await accountOpen(newSession),true);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.app_epochs where user_id=$1',[user])).rows[0].n,1);
  assert.deepEqual((await admin.query('select id from auth.sessions where user_id=$1 order by id',[user])).rows.map(r=>r.id),[sessionID,newSession].sort());
  assert.equal(calls.filter(n=>n==='enroll_maintenance_app_with_consent').length,2);
  await verifyHousehold(true);
  if(fullSchema){
   // Both actors enroll through the real handler; only one belongs to the home.
   // This distinguishes household authorization from merely passing admission.
   for(const actor of [family,outsider]){
    token=(await auth.request('/token?grant_type=password',{email:'family-'+actor+'@fixture.invalid',password})).access_token;
    const actorSession=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
    assert.equal((await(await handle(request('GET'))).json()).enrolled,false);
    assert.equal((await handle(request('POST'))).status,200);
    const registration=await(await handle(request('GET'))).json();
    assert.equal(registration.enrolled,true);assert.equal(registration.userID,actor);assert.equal(registration.sessionID,actorSession);
    assert.notEqual(registration.epochID,result.epochID,'Family members keep distinct app identities');
    await admin.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,session_id:actorSession})]);
    if(rest){
     for(const [table,key,value] of [['products','id',product],['maintenance_tasks','id',task],['maintenance_history','productId',product]]){
      const response=await rest.request('/'+table+'?select='+key,token);assert.equal(response.status,200);
      assert.deepEqual(await response.json(),actor===family?[{[key]:value}]:[],'Actual HTTP RLS: '+table);
     }
    }
    await admin.query('set role authenticated');
    try{
     for(const [table,key,value] of [['products','id',product],['maintenance_tasks','id',task],['maintenance_history','productId',product]]){
      const rows=(await admin.query('select "'+key+'" value from public.'+table)).rows;
      assert.deepEqual(rows,actor===family?[{value}]:[],'Enrollment must not grant membership: '+table);
     }
    }finally{await admin.query('reset role');}
    assert.deepEqual((await admin.query('select id from auth.sessions where user_id=$1',[actor])).rows.map(r=>r.id),[actorSession],'Reauthentication cleanup preserves only the actor login');
   }
   assert.deepEqual(await householdSnapshot(),originalHousehold,'Separate family and outsider enrollments must not mutate shared records');
   console.log('Full-schema enrolled family reads products/tasks/history; enrolled outsider denied; records unchanged');
  }

 }finally{
  try {
   if(process.env.OUCHI_ENROLLMENT_UI_OUTPUT && gateway)
    writeFileSync(join(process.env.OUCHI_ENROLLMENT_UI_OUTPUT,'gateway-evidence.json'),JSON.stringify(gateway.evidence,null,2)+'\n',{mode:0o600});
  } finally {await gateway?.stop();await rest?.stop();await service?.end();await auth?.stop();await admin.end();}
 }
});
