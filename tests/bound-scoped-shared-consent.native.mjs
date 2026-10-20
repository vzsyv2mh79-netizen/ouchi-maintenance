import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {boundScopedModule} from './fixtures/scoped-shared-consent-module.mjs';
import {createHomeHandoffAuthVersionReader} from '../lib/home-handoff-auth-version.mjs';
import {createStrictHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

test('bound Ouchi consent keeps immutable original proof across live lease recovery and actual global logout',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;
 assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Pool({host:socket,user:'ouchi_fixture',database:'postgres',port:5432,max:2,statement_timeout:1000,query_timeout:2000,connectionTimeoutMillis:3000});
 const worker=new pg.Pool({host:socket,user:'ouchi_shared_consent_backend',database:'postgres',port:5432,max:1});
 const errors=[];admin.on('error',e=>errors.push(e.code));worker.on('error',e=>errors.push(e.code));let auth;
 const coordinator=new pg.Pool({host:socket,user:'shared_retirement_backend',database:'postgres',port:5432,max:1});coordinator.on('error',e=>errors.push(e.code));
 try{
  await admin.query('create role postgres;create role anon;create role authenticated;create role service_role;create role ouchi_shared_consent_backend login nosuperuser nobypassrls;create role shared_retirement_backend login nosuperuser nobypassrls;create schema auth;create schema private;create schema maintenance_private;');
  const projectID='hphifiqyypwyxkzfanod',issuer='https://'+projectID+'.supabase.co/auth/v1';
  auth=await startFixtureGoTrue(socket,issuer);
  const actors=[];
  for(let i=0;i<2;i++){
   const account=await auth.request('/signup',{email:randomUUID()+'@fixture.invalid',password:randomBytes(24).toString('base64url')});
   const factor=await auth.request('/factors',{factor_type:'totp',friendly_name:'Disposable Ouchi TOTP'},account.access_token);
   const challenge=await auth.request('/factors/'+factor.id+'/challenge',{},account.access_token);
   const verified=await auth.request('/factors/'+factor.id+'/verify',{challenge_id:challenge.id,code:fixtureTOTP(factor.totp.secret)},account.access_token);
   const claims=JSON.parse(Buffer.from(verified.access_token.split('.')[1],'base64url'));actors.push({id:account.user.id,session:claims.session_id,token:verified.access_token,lowToken:account.access_token,factor:factor.id});
  }
  const [owner,recipient]=actors,requestID=randomUUID(),homeID=randomUUID(),nativeLease=randomUUID(),rootLease=randomUUID(),nativeRequest=randomUUID(),epoch=randomUUID();
  // Candidate table shapes only, not a migration/immutable-plan or full-controller proof.
  await admin.query(`create table maintenance_private.household_handoff_plans(home_id uuid primary key,owner_id uuid,successor_id uuid,scope jsonb,plan jsonb,plan_digest text,snapshot jsonb);
   create table maintenance_private.household_stop_bindings(user_id uuid primary key,scope jsonb,native_lease uuid,lease_until timestamptz,state text);
   create table maintenance_private.account_deletion_requests(id uuid primary key,user_id uuid,app_epoch_id uuid,state text,lease_token uuid,lease_until timestamptz);
   create table private.kb_shared_deletion_journal(request_id uuid primary key,user_id uuid,scope jsonb,status text,lease_token uuid,lease_until timestamptz);
   create table maintenance_private.household_family_holds(home_id uuid primary key,principal uuid,scope jsonb);
   create table maintenance_private.scoped_consent_fixture_proofs(actor_id uuid primary key,proof text);
   grant usage on schema maintenance_private to ouchi_shared_consent_backend;
   grant select,insert on maintenance_private.scoped_consent_fixture_proofs to ouchi_shared_consent_backend;`);
  const root={protocolVersion:2,kind:'shared-account',requestID,userID:owner.id,leaseToken:rootLease,inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:nativeRequest,scopeID:epoch}]};
  const plan={protocolVersion:2,requestID,userID:owner.id,householdID:homeID,successorID:recipient.id,inventoryDigest:root.inventoryDigest,appRequestID:nativeRequest,appScopeID:epoch};
  const {leaseToken:_,...journalScope}=root;void _;
  await admin.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[homeID,owner.id,recipient.id,root,plan,'b'.repeat(64),{syntheticFamilyRecord:700}]);
  await admin.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','processing')",[owner.id,root,nativeLease]);
  await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'processing',$4,clock_timestamp()+interval '5 minutes')",[requestID,owner.id,journalScope,rootLease]);
  await admin.query("insert into maintenance_private.account_deletion_requests values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes')",[nativeRequest,owner.id,epoch,nativeLease]);
  await admin.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[homeID,owner.id,root]);
  await admin.query(readFileSync('tests/fixtures/scoped-shared-consent-auth.sql','utf8'));
  await admin.query('grant execute on function maintenance_private.scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint) to ouchi_shared_consent_backend');
  assert.deepEqual((await worker.query('select current_user,session_user')).rows[0],{current_user:'ouchi_shared_consent_backend',session_user:'ouchi_shared_consent_backend'});
  for(const table of ['users','sessions','mfa_factors','mfa_amr_claims'])await assert.rejects(worker.query('select * from auth.'+table),/permission denied/);
  await assert.rejects(worker.query('update maintenance_private.household_handoff_plans set snapshot=\'{}\''),/permission denied/);
  let totpEnabled=true;
  const fetcher=async(url,o)=>{
   if(url==='https://api.supabase.com/v1/projects/'+projectID+'/config/auth')return Response.json({sessions_timebox:0,sessions_inactivity_timeout:0,sessions_single_per_user:false,mfa_totp_verify_enabled:totpEnabled,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false});
   assert.equal(url,issuer+'/health');
   // Fixture-only fixed-origin proxy. Keep the shipping reader's URL check;
   // do not misrepresent loopback response.url as the hosted service URL.
   const real=await fetch(auth.origin+'/health',o);return new Response(real.body,{status:real.status,headers:real.headers});
  };
  const version=createHomeHandoffAuthVersionReader({projectID,publishableKey:'sb_publishable_synthetic_fixture',fetcher});
  const policyReader=createStrictHomeHandoffPolicyReader({projectID,accessToken:'synthetic_fixture_config_read',authVersionReader:version,fetcher});
  const counters={auth:0,privateReads:0};
  const options={projectID,requestID,homeID,nativeLease,policyReader,getUser:async(token)=>{counters.auth++;try{return{data:{user:await auth.request('/user',undefined,token)},error:null};}catch{return{data:{user:null},error:'denied'};}}};
  const transaction=async(work,pool=worker)=>{const client=await pool.connect();try{await client.query('begin');await client.query("set local statement_timeout='3000ms'");const value=await runWithTransactionCommitChecks({query:async(sql,args)=>{try{const r=await client.query(sql,args);if(sql.includes('scoped_shared_consent_auth(')){counters.privateReads++;if(r.rows.length!==1)console.log('scoped fixture private row count',r.rows.length);}return r;}catch(e){console.log('scoped fixture SQL failure',e.code,e.message);throw e;}}},AbortSignal.timeout(12000),work);await client.query('commit');return value;}catch(e){await client.query('rollback');throw e;}finally{client.release();}};
  await admin.query(readFileSync('tests/fixtures/bound-scoped-shared-consent.sql','utf8'));
  await admin.query(`grant usage on schema maintenance_private to shared_retirement_backend;
   grant execute on function maintenance_private.record_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint) to ouchi_shared_consent_backend;
   grant execute on function maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid) to ouchi_shared_consent_backend,shared_retirement_backend;
   grant execute on function maintenance_private.current_bound_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint) to shared_retirement_backend;`);
  const key=randomBytes(32),make=extra=>boundScopedModule.createBoundScopedSharedConsent({...options,key,rootLease,...extra});
  const custody=make();
  try{await assert.rejects(transaction(async tx=>{await custody.issue(owner.token,tx);totpEnabled=false;}),/Current transaction verification/);}finally{totpEnabled=true;}
  assert.equal((await admin.query('select count(*)::int as n from maintenance_private.scoped_consent_bindings')).rows[0].n,0,'Original signed proof and private binding roll back together on late policy loss');
  const issued=[];for(const actor of actors)issued.push(await transaction(tx=>custody.issue(actor.token,tx)));
  const originals=(await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows;
  assert.equal(originals.length,2);
  assert.deepEqual(await transaction(tx=>custody.issue(owner.token,tx)),issued[0],'Replay returns identical original proof, never a new expiry/session/signature');
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows,originals);
  assert.deepEqual((await coordinator.query('select current_user,session_user')).rows[0],{current_user:'shared_retirement_backend',session_user:'shared_retirement_backend'});
  for(const table of ['users','sessions','mfa_factors','mfa_amr_claims'])await assert.rejects(coordinator.query('select * from auth.'+table),/permission denied/);
  await assert.rejects(coordinator.query('select * from maintenance_private.scoped_consent_bindings'),/permission denied/);
  await assert.rejects(coordinator.query('select maintenance_private.record_scoped_consent(null,null,null,null,null,null,null,null,null)'),/permission denied/);
  await assert.rejects(worker.query('select * from maintenance_private.current_bound_scoped_consent(null,null,null,null,null,null,null)'),/permission denied/);
  await assert.rejects(admin.query("update maintenance_private.scoped_consent_bindings set expires_at=expires_at+1"),/immutable/);
  await assert.rejects(admin.query('delete from maintenance_private.scoped_consent_bindings'),/immutable/);
  await admin.query('alter role shared_retirement_backend createdb');
  try{assert.equal(await transaction(tx=>custody.verifyCurrent(owner.id,tx),coordinator),null);}finally{await admin.query('alter role shared_retirement_backend nocreatedb');}
  await transaction(async tx=>{
   const seen=new Set(),strict={...tx,beforeCommit:(key,check)=>{assert.equal(seen.has(key),false,'Duplicate registration is forbidden by integration adapter');seen.add(key);tx.beforeCommit(key,check);}};
   assert.ok(await custody.verifyCurrent(owner.id,strict));assert.ok(await custody.verifyCurrent(owner.id,strict));
   assert.ok(await custody.readHistorical(owner.id,strict));assert.ok(await custody.readHistorical(owner.id,strict));
   tx.beforeCommit('fixture-hook-free-readback',async()=>!!await custody.readCurrent(owner.id,strict)&&!!await custody.readHistoricalSnapshot(owner.id,strict));
  },coordinator);
  // Dedicated root coordinator holds only the shared journal first. A real
  // concurrent issuer must wait there WITHOUT already holding the app plan.
  await admin.query(`create function maintenance_private.fixture_pin_root(p uuid) returns void language plpgsql security definer set search_path='' as $$begin perform 1 from private.kb_shared_deletion_journal where request_id=p for update;end$$;
   revoke all on function maintenance_private.fixture_pin_root(uuid) from public;
   grant execute on function maintenance_private.fixture_pin_root(uuid) to shared_retirement_backend;`);
  const issuerPID=(await worker.query('select pg_backend_pid() as pid')).rows[0].pid,rootClient=await coordinator.connect();let issuerResult;
  try{
   await rootClient.query('begin');await rootClient.query("set local statement_timeout='1500ms'");
   await rootClient.query('select maintenance_private.fixture_pin_root($1)',[requestID]);
   const rootPID=(await rootClient.query('select pg_backend_pid() as pid')).rows[0].pid;
   issuerResult=transaction(tx=>custody.issue(owner.token,tx)).then(value=>({value}),error=>({error}));
   let blocked=false;for(let i=0;i<60;i++){const r=(await admin.query('select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',[issuerPID])).rows[0];if(r?.wait_event_type==='Lock'&&r.blockers.includes(rootPID)){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(blocked,true,'Actual issuer waits on held shared root');
   const read=await rootClient.query(boundScopedModule.BOUND_CONSENT_READ_SQL,[requestID,homeID,owner.id,rootLease,nativeLease]);
   assert.equal(read.rows.length,1,'Coordinator can acquire app plan while issuer waits at root; reverse-order issuer would deadlock');
   await rootClient.query('commit');
   const result=await issuerResult;assert.equal(result.error,undefined,result.error?.message);assert.deepEqual(result.value,issued[0]);
  }finally{await rootClient.query('rollback');rootClient.release();if(issuerResult)await issuerResult;}
  const current=await transaction(tx=>custody.verifyCurrent(owner.id,tx),coordinator);assert.ok(current);assert.equal(current.authStateDigest,issued[0].payload.authStateDigest);
  const nextRoot=randomUUID(),nextNative=randomUUID();
  await admin.query("update private.kb_shared_deletion_journal set lease_token=$1",[nextRoot]);
  await admin.query("update maintenance_private.household_stop_bindings set scope=jsonb_set(scope,'{leaseToken}',to_jsonb($1::text)),native_lease=$2",[nextRoot,nextNative]);
  await admin.query('update maintenance_private.account_deletion_requests set lease_token=$1',[nextNative]);
  assert.equal(await transaction(tx=>custody.verifyCurrent(owner.id,tx),coordinator),null,'Stale worker lease denies');
  const recovered=make({rootLease:nextRoot,nativeLease:nextNative});
  assert.deepEqual(await transaction(tx=>recovered.verifyCurrent(owner.id,tx),coordinator),current,'Live lease rotation preserves the original digest and proof');
  let getUserCalls=0;const noBearer=make({rootLease:nextRoot,nativeLease:nextNative,getUser:async()=>{getUserCalls++;throw Error('No worker Auth/user request');}});
  assert.ok(await transaction(tx=>noBearer.verifyCurrent(recipient.id,tx),coordinator));assert.equal(getUserCalls,0);
  await admin.query('update maintenance_private.account_deletion_requests set app_epoch_id=$1',[randomUUID()]);
  assert.equal(await transaction(tx=>recovered.verifyCurrent(owner.id,tx),coordinator),null);
  await admin.query('update maintenance_private.account_deletion_requests set app_epoch_id=$1',[epoch]);
  // Staged side-effect is disposable test evidence only, not actual family transfer.
  await admin.query('grant insert,select on maintenance_private.scoped_consent_fixture_proofs to shared_retirement_backend');
  try{await assert.rejects(transaction(async tx=>{assert.ok(await recovered.verifyCurrent(owner.id,tx));await tx.query('insert into maintenance_private.scoped_consent_fixture_proofs values($1,$2)',[randomUUID(),'must-roll-back']);totpEnabled=false;},coordinator),/Current transaction verification/);}finally{totpEnabled=true;}
  assert.equal((await admin.query('select count(*)::int as n from maintenance_private.scoped_consent_fixture_proofs')).rows[0].n,0);
  const contender=await admin.connect(),observer=await admin.connect();let inserting,pid;const factorID=randomUUID();
  try{
   await contender.query("set lock_timeout='4s';set statement_timeout='5s'");pid=(await contender.query('select pg_backend_pid() as pid')).rows[0].pid;
   await transaction(async tx=>{
    assert.ok(await recovered.verifyCurrent(owner.id,tx));const workerPID=(await tx.query('select pg_backend_pid() as pid',[])).rows[0].pid;
    inserting=contender.query("insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at) values($1,$2,'totp','unverified','disposable-fixture-only',clock_timestamp(),clock_timestamp())",[factorID,owner.id]).then(()=>({ok:true}),error=>({ok:false,error}));
    let blocked=false;for(let i=0;i<30;i++){const r=(await observer.query('select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',[pid])).rows[0];if(r?.wait_event_type==='Lock'&&r.blockers.includes(workerPID)){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(blocked,true);
   },coordinator);
   const result=await inserting;assert.equal(result.ok,true,result.error?.code);await observer.query('delete from auth.mfa_factors where id=$1',[factorID]);
  }finally{if(inserting){await observer.query('select pg_cancel_backend($1)',[pid]);await inserting;}contender.release();observer.release();}
  await admin.query("update auth.mfa_factors set friendly_name='changed fixture factor' where id=$1",[owner.factor]);
  assert.equal(await transaction(tx=>recovered.verifyCurrent(owner.id,tx),coordinator),null,'Changed Auth factor never rebinds the original proof');
  await admin.query("update auth.mfa_factors set friendly_name='Disposable Ouchi TOTP' where id=$1",[owner.factor]);
  // Historical reads remain archival, independent of current Auth changes.
  const logout=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+owner.token},signal:AbortSignal.timeout(3000)});assert.equal(logout.status,204);
  assert.equal((await admin.query('select count(*)::int as n from auth.sessions where user_id=$1',[owner.id])).rows[0].n,0);
  assert.equal(await transaction(tx=>noBearer.verifyCurrent(owner.id,tx),coordinator),null,'Global logout must not pass current identity');
  const historical=await transaction(tx=>noBearer.readHistorical(owner.id,tx),coordinator);
  assert.equal(historical.kind,'historical-consent-only');assert.deepEqual(historical.payload,issued[0].payload);assert.equal(historical.signature,issued[0].signature);assert.equal(getUserCalls,0);
  // Fixture owner removes its own disposable Auth row directly. This proves no
  // Auth FK/cascade/active-bearer dependency, NOT a GoTrue Admin DELETE workflow.
  await admin.query('delete from auth.users where id=$1',[owner.id]);
  const reconstructed=make({rootLease:nextRoot,nativeLease:nextNative,getUser:async()=>{throw Error('No post-Auth login');}});
  assert.deepEqual(await transaction(tx=>reconstructed.readHistorical(owner.id,tx),coordinator),historical);
  assert.ok(await auth.request('/user',undefined,recipient.token));
  assert.deepEqual((await admin.query('select snapshot from maintenance_private.household_handoff_plans')).rows,[{snapshot:{syntheticFamilyRecord:700}}]);
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows,originals);
  assert.deepEqual(errors,[]);
 }finally{if(auth)await auth.stop();await coordinator.end();await worker.end();await admin.end();}
});
