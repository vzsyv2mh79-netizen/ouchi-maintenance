import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {scopedModule} from './fixtures/scoped-shared-consent-module.mjs';
import {createHomeHandoffAuthVersionReader} from '../lib/home-handoff-auth-version.mjs';
import {createStrictHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

test('dedicated Ouchi consent LOGIN and digest-only RPC retain real signed TOTP through issuer COMMIT',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;
 assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Pool({host:socket,user:'ouchi_fixture',database:'postgres',port:5432,max:2,statement_timeout:1000,query_timeout:2000,connectionTimeoutMillis:3000});
 const worker=new pg.Pool({host:socket,user:'ouchi_shared_consent_backend',database:'postgres',port:5432,max:1});
 const errors=[];admin.on('error',e=>errors.push(e.code));worker.on('error',e=>errors.push(e.code));let auth;
 try{
  await admin.query('create role postgres;create role anon;create role authenticated;create role service_role;create role ouchi_shared_consent_backend login nosuperuser nobypassrls;create schema auth;create schema private;create schema maintenance_private;');
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
  const identify=scopedModule.createScopedSharedConsentIssuerIdentity(options);
  const transaction=async(work)=>{const client=await worker.connect();try{await client.query('begin');await client.query("set local statement_timeout='3000ms'");const value=await runWithTransactionCommitChecks({query:async(sql,args)=>{try{const r=await client.query(sql,args);if(sql===scopedModule.SCOPED_SHARED_CONSENT_AUTH_SQL){counters.privateReads++;if(r.rows.length!==1)console.log('scoped fixture private row count',r.rows.length);}return r;}catch(e){console.log('scoped fixture SQL failure',e.code,e.message);throw e;}}},AbortSignal.timeout(12000),work);await client.query('commit');return value;}catch(e){await client.query('rollback');throw e;}finally{client.release();}};
  const key=randomBytes(32),digests=new Map();
  for(const actor of actors){
   await transaction(async tx=>{const id=await identify(actor.token,tx);assert.ok(id,JSON.stringify(counters));assert.equal(id.proofDomain,'OuchiMaintenance/scoped-shared-consent-auth/v1');digests.set(actor.id,id.authStateDigest);const proof=createHmac('sha256',key).update(JSON.stringify(id)).digest('hex');await tx.query('insert into maintenance_private.scoped_consent_fixture_proofs values($1,$2)',[actor.id,proof]);});
  }
  const before=(await admin.query('select * from maintenance_private.scoped_consent_fixture_proofs order by actor_id')).rows;
  await admin.query("set lock_timeout='200ms'");
  await assert.rejects(transaction(async tx=>{assert.ok(await identify(owner.token,tx));await admin.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[owner.session]);}),e=>e.code==='55P03');
  try{await assert.rejects(transaction(async tx=>{assert.ok(await identify(owner.token,tx));await tx.query('insert into maintenance_private.scoped_consent_fixture_proofs values($1,$2)',[randomUUID(),'fixture-only-new-proof']);totpEnabled=false;}),/Current transaction verification/);}finally{totpEnabled=true;}
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_fixture_proofs order by actor_id')).rows,before,'Issued strict-policy change at COMMIT rolls the staged proof back');
  // A direct independent admin UPDATE is blocked by the pins. Use a disposable
  // worker-side fault through an explicitly fixture-only owner callback instead
  // of granting the runtime any Auth UPDATE capability.
  await transaction(async tx=>{const id=await identify(recipient.token,tx);assert.ok(id);assert.equal(id.authStateDigest,digests.get(recipient.id));});
  const foreign=scopedModule.createScopedSharedConsentIdentityVerifier({...options,requestID:randomUUID()});
  assert.equal(await transaction(tx=>foreign(owner.token,tx)),null);
  assert.equal(await transaction(tx=>scopedModule.createScopedSharedConsentIdentityVerifier(options)(owner.lowToken,tx)),null,'Old signed AAL1 bearer cannot inherit AAL2');
  const wrongLease=scopedModule.createScopedSharedConsentIdentityVerifier({...options,nativeLease:randomUUID()});
  assert.equal(await transaction(tx=>wrongLease(owner.token,tx)),null);
  try{totpEnabled=false;assert.equal(await transaction(tx=>identify(owner.token,tx)),null);}finally{totpEnabled=true;}
  await admin.query('alter role ouchi_shared_consent_backend createdb');
  try{assert.equal(await transaction(tx=>identify(owner.token,tx)),null);}finally{await admin.query('alter role ouchi_shared_consent_backend nocreatedb');}
  const fk=(await admin.query("select conname from pg_constraint where conrelid='auth.mfa_factors'::regclass and confrelid='auth.users'::regclass and contype='f'")).rows[0].conname;
  const quoted='"'+fk.replaceAll('"','""')+'"';
  await admin.query('alter table auth.mfa_factors alter constraint '+quoted+' deferrable initially immediate');
  try{assert.equal(await transaction(tx=>identify(owner.token,tx)),null);}finally{await admin.query('alter table auth.mfa_factors alter constraint '+quoted+' not deferrable');}
  const contender=await admin.connect(),observer=await admin.connect(),newFactor=randomUUID();let inserting,contenderPID;
  try{
   await contender.query("set lock_timeout='4s';set statement_timeout='5s'");
   contenderPID=(await contender.query('select pg_backend_pid() as pid')).rows[0].pid;
   await transaction(async tx=>{
    assert.ok(await identify(owner.token,tx));const workerPID=(await tx.query('select pg_backend_pid() as pid',[])).rows[0].pid;
    inserting=contender.query("insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at) values($1,$2,'totp','unverified','disposable-fixture-only',clock_timestamp(),clock_timestamp())",[newFactor,owner.id]).then(()=>({ok:true}),error=>({ok:false,error}));
    let blocked=false;
    for(let i=0;i<30;i++){
     const r=(await observer.query('select wait_event_type,pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',[contenderPID])).rows[0];
     if(r?.wait_event_type==='Lock'&&r.blockers.includes(workerPID)){blocked=true;break;}
     await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true,'Actual FK insert must wait on the owner transaction, not merely time out');
   });
   const inserted=await inserting;assert.equal(inserted.ok,true,inserted.error?.code);
   await observer.query('delete from auth.mfa_factors where id=$1',[newFactor]);
  }finally{
   if(inserting){await observer.query('select pg_cancel_backend($1)',[contenderPID]);await inserting;}
   contender.release();observer.release();
  }
  const originalLease=(await admin.query('select lease_until from private.kb_shared_deletion_journal where request_id=$1',[requestID])).rows[0].lease_until;
  await admin.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[requestID]);
  try{assert.equal(await transaction(tx=>identify(owner.token,tx)),null);}finally{await admin.query('update private.kb_shared_deletion_journal set lease_until=$2 where request_id=$1',[requestID,originalLease]);}

  assert.equal((await admin.query('select not_after from auth.sessions where id=$1',[owner.session])).rows[0].not_after,null,'Timed-out admin mutation must not be applied after rollback');
  await admin.query("update auth.mfa_factors set friendly_name='changed fixture factor' where id=$1",[owner.factor]);
  const changed=await transaction(tx=>scopedModule.createScopedSharedConsentIdentityVerifier(options)(owner.token,tx));assert.ok(changed);assert.notEqual(changed.authStateDigest,digests.get(owner.id));
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_fixture_proofs order by actor_id')).rows,before,'Stored signed proofs must never be rebound by identity read');
  assert.deepEqual((await admin.query('select snapshot from maintenance_private.household_handoff_plans')).rows,[{snapshot:{syntheticFamilyRecord:700}}]);
  const logout=await fetch(auth.origin+'/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer '+owner.token},signal:AbortSignal.timeout(3000)});assert.equal(logout.status,204);
  assert.equal(await transaction(tx=>identify(owner.token,tx)),null,'Signed-out owner is no longer a current actor');
  assert.ok(await transaction(tx=>identify(recipient.token,tx)),'Remaining family actor stays authenticated');
  assert.deepEqual(errors,[]);
 }finally{if(auth)await auth.stop();await worker.end();await admin.end();}
});
