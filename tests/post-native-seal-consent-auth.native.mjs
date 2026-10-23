import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import ts from 'typescript';
import {completionSetup} from './fixtures/post-seal-family-setup.mjs';
import {owner,recipient,other,home,oe,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {boundScopedModule} from './fixtures/scoped-shared-consent-module.mjs';
import {deletionStages} from '../lib/shared-deletion-protocol.mjs';

const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const domain='OuchiMaintenance/scoped-shared-consent-auth/v1';
const source=readFileSync('lib/post-native-seal-consent.ts','utf8').replace("import {SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';",`const SCOPED_SHARED_CONSENT_DOMAIN=${JSON.stringify(domain)};`);
const {createPostNativeSealConsent}=await import(compile(source));

test('real GoTrue TOTP-issued original consent survives native seal, global logout, Admin deletion and atomic release',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;
 assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();
 let coordinator,issuerClient,c,auth,restoreFixtureSessions;
 const db={query:(...a)=>admin.query(...a),exec:sql=>admin.query(sql),close:async()=>{},transaction:async work=>{
  await admin.query('begin');try{const value=await work(db);await admin.query('commit');return value;}catch(e){await admin.query('rollback');throw e;}
 }};
 try{
  await admin.query('create role postgres;create role shared_retirement_backend login nosuperuser nobypassrls;create role ouchi_shared_consent_backend login nosuperuser nobypassrls;create schema auth;');
  await admin.query(readFileSync('tests/fixtures/auth/rest-bootstrap.sql','utf8'));
  auth=await startFixtureGoTrue(socket,'https://hphifiqyypwyxkzfanod.supabase.co/auth/v1');
  const actors=new Map();
  for(const id of [owner,recipient,other]){
   const email=id+'@fixture.invalid',password=randomBytes(30).toString('base64url');await auth.createFixtureUser(id,email,password);
   if(id===other)continue;
   const initial=await auth.request('/token?grant_type=password',{email,password});
   const factor=await auth.request('/factors',{factor_type:'totp',friendly_name:'Disposable post-seal proof'},initial.access_token);
   const challenge=await auth.request('/factors/'+factor.id+'/challenge',{},initial.access_token);
   const promoted=await auth.request('/factors/'+factor.id+'/verify',{challenge_id:challenge.id,code:fixtureTOTP(factor.totp.secret)},initial.access_token);
   const session=JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).session_id;actors.set(id,{token:promoted.access_token,session});
  }
  restoreFixtureSessions=bindRealAuthSessions(actors.get(owner).session,actors.get(recipient).session);

  c=await completionSetup({schemaOptions:{completeCatalog:true,realAuth:true,databaseFactory:async()=>db},beforeFreeze:async(db,id)=>{
   await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
   await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
   await db.query('update maintenance_private.account_deletion_requests set inventory_captured=true where id=$1',[id]);
   await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-retention-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[id]);
  }});
  c.clean();assert.equal((await c.finish()).state,'complete');
  const f=c.s.f,s=f.scope.controllerScope,{leaseToken:_,...fixed}=s;void _;
  await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
  await admin.query(readFileSync('tests/fixtures/shared-family-stage-store.sql','utf8'));
  const receipt=stage=>({...fixed,stage,durable:true});
  await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'processing',$4,clock_timestamp()+interval '5 minutes',$5)",[s.requestID,owner,fixed,s.leaseToken,{prepare:receipt('prepare')}]);
  const targets=[{scope:f.scope,plan:c.plan}],coverage=sharedFamilyCoverageDigest(targets,s);
  const store=createSharedFamilyStageStore({loadValidatedTargets:async()=>targets,verifyReadAuthority:async()=>true});
  await c.s.transaction(tx=>store.record(tx,s,coverage,tx.signal));
  await admin.query("update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1",[s.requestID,Object.fromEntries(['verify-family-before','verify-sessions-before'].map(k=>[k,receipt(k)]))]);
  await admin.query(readFileSync('tests/fixtures/shared-maintenance-native-stage.sql','utf8'));
  await admin.query(readFileSync('tests/fixtures/bound-scoped-shared-consent.sql','utf8'));
  await admin.query(readFileSync('tests/fixtures/post-native-seal-consent.sql','utf8'));
  await admin.query(readFileSync('tests/fixtures/scoped-shared-consent-auth.sql','utf8'));
  await admin.query(`grant usage on schema public,private,maintenance_private to ouchi_shared_consent_backend;
   grant execute on function maintenance_private.scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint),maintenance_private.record_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint),maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid) to ouchi_shared_consent_backend;`);
  issuerClient=new pg.Client({host:socket,user:'ouchi_shared_consent_backend',database:'postgres'});await issuerClient.connect();
  const issuerTransaction=async work=>{await issuerClient.query('begin');try{const value=await runWithTransactionCommitChecks(issuerClient,AbortSignal.timeout(10000),work);await issuerClient.query('commit');return value;}catch(e){await issuerClient.query('rollback');throw e;}};
  const key=randomBytes(32),originals=[];
  const policyReader=Object.assign(async()=>Object.freeze({projectID:'hphifiqyypwyxkzfanod',authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>true});
  const originalIssuer=boundScopedModule.createBoundScopedSharedConsent({projectID:'hphifiqyypwyxkzfanod',requestID:s.requestID,homeID:home,nativeLease:f.scope.nativeLease,rootLease:s.leaseToken,key,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null})});
  for(const actor of [owner,recipient])originals.push(await issuerTransaction(tx=>originalIssuer.issue(actors.get(actor).token,tx)));
  await admin.query('grant usage on schema maintenance_private,private to shared_retirement_backend;grant execute on function maintenance_private.read_post_native_seal_consent(uuid,uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid) to shared_retirement_backend');
  coordinator=new pg.Client({host:socket,user:'shared_retirement_backend',database:'postgres'});await coordinator.connect();
  const transaction=async work=>{await coordinator.query('begin');try{const value=await runWithTransactionCommitChecks(coordinator,AbortSignal.timeout(10000),work);await coordinator.query('commit');return value;}catch(e){await coordinator.query('rollback');throw e;}};
  const options={key,requestID:s.requestID,homeID:home,rootLease:s.leaseToken,nativeRequestID:f.scope.nativeRequestID,ownerEpoch:oe,completionLease:f.scope.nativeLease};
  const port=createPostNativeSealConsent(options);
  assert.equal(await transaction(tx=>port.read(owner,tx)),null,'Running native request is never a sealed completion');
  for(const phase of ['eraseRecords','eraseDeviceRegistrations','captureReceiptSessions','eraseIdentity','markComplete']){
   const value=(await admin.query('select maintenance_private.run_shared_native_stage($1,$2,$3) value',[s,f.scope.nativeLease,phase])).rows[0].value;
   assert.equal(value,true,phase);
  }
  const native=(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[f.scope.nativeRequestID])).rows[0];
  assert.equal(native.state,'complete');assert.equal(native.lease_token,null);assert.equal(native.lease_until,null);assert.equal(native.completion_lease,f.scope.nativeLease);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.app_epochs where user_id=$1',[owner])).rows[0].n,0);
  for(let i=0;i<2;i++){
   const result=await transaction(async tx=>{const r=await port.read(originals[i].payload.userID,tx);assert.deepEqual(await port.readSnapshot(originals[i].payload.userID,tx),r);return r;});
   assert.deepEqual(result,{kind:'post-native-seal-historical-consent-only',...originals[i]});
  }
  const legacy=boundScopedModule.createBoundScopedSharedConsent({projectID:'hphifiqyypwyxkzfanod',requestID:s.requestID,homeID:home,nativeLease:f.scope.nativeLease,rootLease:s.leaseToken,key,policyReader:Object.assign(async()=>null,{isCurrent:()=>false}),getUser:async()=>{throw Error('No current Auth in historical reader');}});
  assert.equal(await transaction(tx=>legacy.readHistorical(owner,tx)),null,'Existing running-only historical port stays unchanged');
  for(const field of ['rootLease','nativeRequestID','ownerEpoch','completionLease'])assert.equal(await transaction(tx=>createPostNativeSealConsent({...options,[field]:randomUUID()}).read(owner,tx)),null,field);
  await assert.rejects(transaction(tx=>createPostNativeSealConsent({...options,key:randomBytes(32)}).read(owner,tx)),/Original signed archival/);
  for(const table of ['scoped_consent_bindings','post_native_family_releases'])await assert.rejects(coordinator.query('select * from maintenance_private.'+table),/permission denied/);
  await admin.query(`create table maintenance_private.post_seal_fixture_marker(id uuid primary key);
   grant select,insert on maintenance_private.post_seal_fixture_marker to shared_retirement_backend;
   create function maintenance_private.post_seal_fixture_expire_root(r uuid) returns void language sql security definer set search_path='' as $$
    update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=r
   $$;revoke all on function maintenance_private.post_seal_fixture_expire_root(uuid) from public;
   grant execute on function maintenance_private.post_seal_fixture_expire_root(uuid) to shared_retirement_backend;`);
  await assert.rejects(transaction(async tx=>{
   assert.ok(await port.read(owner,tx));
   await tx.query('insert into maintenance_private.post_seal_fixture_marker values($1)',[randomUUID()]);
   await tx.query('select maintenance_private.post_seal_fixture_expire_root($1)',[s.requestID]);
  }),/Current transaction verification/);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.post_seal_fixture_marker')).rows[0].n,0,'Late root loss rolls back staged writes');
  assert.ok(await transaction(tx=>port.read(owner,tx)),'Lease fault rolled back too');
  // A hold disappearing is not release evidence. Restore it before leaving
  // this test; no release producer, grants or actual release are added here.
  const hold=(await admin.query('delete from maintenance_private.household_family_holds where home_id=$1 returning *',[home])).rows[0];
  assert.equal(await transaction(tx=>port.read(owner,tx)),null,'Missing hold is not legitimately released');
  await admin.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[hold.home_id,hold.principal,hold.scope]);
  const logout=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+actors.get(owner).token},signal:AbortSignal.timeout(3000)});assert.equal(logout.status,204,'Actual global logout uses empty204 response');
  assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1',[owner])).rows[0].n,0,'Global logout really removes owner sessions before Auth deletion');
  assert.deepEqual(await transaction(tx=>port.read(owner,tx)),{kind:'post-native-seal-historical-consent-only',...originals[0]},'Historical proof survives real global logout before Admin deletion');
  await auth.eraseFixtureUser(owner);
  const absent=await auth.adminFetch('https://hphifiqyypwyxkzfanod.supabase.co/auth/v1/admin/users/'+owner,{method:'GET'});assert.equal(absent.status,404);const missing=await absent.json();assert.equal(missing.code,404);assert.equal(missing.error_code,'user_not_found');
  assert.equal((await auth.request('/user',undefined,actors.get(recipient).token)).id,recipient,'Remaining family Auth survives');
  assert.deepEqual(await transaction(tx=>port.read(owner,tx)),{kind:'post-native-seal-historical-consent-only',...originals[0]});
  // Root protocol receipts/COMPLETE writer remain explicit synthetic fixtures.
  // Owner Auth absence above is real GoTrue; remote Storage remains unproven.
  await admin.query("update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1",[s.requestID,Object.fromEntries(deletionStages(s).filter(k=>!['complete','handoff-family'].includes(k)).map(k=>[k,receipt(k)]))]);
  await admin.query('grant execute on function maintenance_private.release_post_native_family_holds(uuid,uuid,uuid,uuid,uuid) to shared_retirement_backend;');
  await admin.query(`create function maintenance_private.post_seal_fixture_complete_root(r uuid,proof jsonb) returns boolean language plpgsql security definer set search_path='' as $$
   begin update private.kb_shared_deletion_journal set receipts=receipts||jsonb_build_object('complete',proof),status='complete',lease_token=null,lease_until=null where request_id=r and status='processing';return found;end$$;
   revoke all on function maintenance_private.post_seal_fixture_complete_root(uuid,jsonb) from public;
   grant execute on function maintenance_private.post_seal_fixture_complete_root(uuid,jsonb) to shared_retirement_backend;`);
  const release=tx=>tx.query('select maintenance_private.release_post_native_family_holds($1,$2,$3,$4,$5) value',[s.requestID,s.leaseToken,f.scope.nativeRequestID,oe,f.scope.nativeLease]);
  await assert.rejects(transaction(async tx=>{
   assert.equal((await release(tx)).rows[0].value,true);
   assert.ok(await port.readSnapshot(owner,tx));
  }),/same-transaction global COMPLETE/);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.post_native_family_releases')).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.household_family_holds where home_id=$1',[home])).rows[0].n,1,'Unsealed release rolls hold removal back');
  await transaction(async tx=>{
   assert.ok(await port.read(owner,tx));
   assert.equal((await release(tx)).rows[0].value,true);
   assert.ok(await port.readSnapshot(owner,tx),'Post-release live-root readback');
   assert.equal((await tx.query('select maintenance_private.post_seal_fixture_complete_root($1,$2) value',[s.requestID,receipt('complete')])).rows[0].value,true);
   assert.ok(await port.readSnapshot(owner,tx),'Independent sealed global authority before owning COMMIT');
  });
  assert.deepEqual(await transaction(tx=>port.read(owner,tx)),{kind:'post-native-seal-historical-consent-only',...originals[0]},'Committed legitimate release keeps original proof unchanged');
  assert.equal(await transaction(tx=>createPostNativeSealConsent({...options,rootLease:randomUUID()}).read(owner,tx)),null,'Different historical lease cannot use global completion');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.household_family_holds where home_id=$1',[home])).rows[0].n,0);
  assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner])).rows[0].stopped,true,'Owner tombstone remains closed');
  assert.equal((await admin.query('select count(*)::int n from public.products where "homeId"=$1',[home])).rows[0].n,1,'Family product survives final release');
  console.log('Canonical 135-source native seal and app-registration erasure; real TOTP-issued original proof retained after actual GoTrue logout/Admin deletion; immutable family/attachment SQL receipts; actual Auth, but synthetic root receipts and memory Storage remain');
 }finally{if(coordinator)await coordinator.end();if(issuerClient)await issuerClient.end();if(auth)await auth.stop();if(restoreFixtureSessions)restoreFixtureSessions();await admin.end();}
});
