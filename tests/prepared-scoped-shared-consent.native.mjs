import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,home,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {familyAttachmentActivationFixture} from './fixtures/family-attachment-activation.mjs';
import {boundScopedModule,preparedScopedModule,preparedOuchiClaimModule} from './fixtures/scoped-shared-consent-module.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {createDeletionJournal} from './fixtures/kakei-completion/lib/shared-deletion-journal.mjs';

test('actual TOTP originals issue before claim and survive formal claimPrepared COMMIT without weakening worker gates',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();
 let auth,issuer,coordinator,restoreSessions;
 const db={query:(...a)=>admin.query(...a),exec:sql=>admin.query(sql),close:async()=>{},transaction:async work=>{
  await admin.query('begin');try{const value=await work(db);await admin.query('commit');return value;}catch(e){await admin.query('rollback');throw e;}
 }};
 const transaction=async(client,work)=>{await client.query('begin');try{
  await client.query("set local statement_timeout='4500ms'");
  const value=await runWithTransactionCommitChecks(client,AbortSignal.timeout(10000),work);await client.query('commit');return value;
 }catch(e){await client.query('rollback');throw e;}};
 try{
  await admin.query('create role postgres;create role ouchi_shared_consent_backend login nosuperuser nobypassrls;create role shared_retirement_backend login nosuperuser nobypassrls;create schema auth');
  await admin.query(readFileSync('tests/fixtures/auth/rest-bootstrap.sql','utf8'));
  const projectID='hphifiqyypwyxkzfanod';auth=await startFixtureGoTrue(socket,'https://'+projectID+'.supabase.co/auth/v1');
  const actors=new Map();
  for(const userID of [owner,recipient,other]){
   const email=userID+'@fixture.invalid',password=randomBytes(30).toString('base64url');await auth.createFixtureUser(userID,email,password);
   if(userID===other)continue;
   const initial=await auth.request('/token?grant_type=password',{email,password});
   const factor=await auth.request('/factors',{factor_type:'totp',friendly_name:'Prepared original consent'},initial.access_token);
   const challenge=await auth.request('/factors/'+factor.id+'/challenge',{},initial.access_token);
   const promoted=await auth.request('/factors/'+factor.id+'/verify',{challenge_id:challenge.id,code:fixtureTOTP(factor.totp.secret)},initial.access_token);
   actors.set(userID,{token:promoted.access_token,sessionID:JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).session_id});
  }
  restoreSessions=bindRealAuthSessions(actors.get(owner).sessionID,actors.get(recipient).sessionID);
  // Freeze the original plan/hold but DO NOT transfer the family or run any
  // app deletion. Initial inventory preparation/policy are explicit fixtures.
  const f=await familyAttachmentActivationFixture({prepared:false,schemaOptions:{realAuth:true,completeCatalog:true,databaseFactory:async()=>db}});
  const s=f.scope.controllerScope,{leaseToken:_,...fixed}=s;void _;
  await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
  await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[s.requestID,owner,fixed]);
  for(const file of ['scoped-shared-consent-auth.sql','bound-scoped-shared-consent.sql','prepared-scoped-shared-consent.sql'])await admin.query(readFileSync('tests/fixtures/'+file,'utf8'));
  await admin.query(`grant usage on schema private,maintenance_private to ouchi_shared_consent_backend,shared_retirement_backend;
   grant execute on function maintenance_private.prepared_scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint),maintenance_private.record_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint),maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid) to ouchi_shared_consent_backend;
   grant execute on function maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.current_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint),maintenance_private.prepared_consent_claim_frame(uuid,uuid,jsonb,jsonb),maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.current_bound_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint) to shared_retirement_backend;
   grant execute on function maintenance_private.scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint) to ouchi_shared_consent_backend;`);
  issuer=new pg.Client({host:socket,user:'ouchi_shared_consent_backend',database:'postgres'});await issuer.connect();
  coordinator=new pg.Client({host:socket,user:'shared_retirement_backend',database:'postgres'});await coordinator.connect();
  const key=randomBytes(32),policyReader=Object.assign(async()=>Object.freeze({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>true});
  const options={key,projectID,requestID:s.requestID,homeID:home,nativeLease:f.scope.nativeLease,rootLease:s.leaseToken,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null})};
  const prepared=preparedScopedModule.createPreparedScopedSharedConsent(options),worker=boundScopedModule.createBoundScopedSharedConsent(options);
  await assert.rejects(transaction(issuer,tx=>worker.issue(actors.get(owner).token,tx)),/Current original consent identity/,'Normal processing issuer must not accept requested root');
  const originals=[];for(const actor of [owner,recipient])originals.push(await transaction(issuer,tx=>prepared.issue(actors.get(actor).token,tx)));
  assert.deepEqual(await transaction(issuer,tx=>prepared.issue(actors.get(owner).token,tx)),originals[0],'Requested replay is exact, no expiry extension');
  const custody=(await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows;
  const claimPort=preparedOuchiClaimModule.createPreparedOuchiClaimPort({...options,scope:s,homes:[{homeID:home,successorID:recipient}]});
  const oldCapability=await transaction(coordinator,tx=>claimPort.requested(s,tx));assert.ok(oldCapability);assert.equal(Object.isFrozen(oldCapability),true);assert.deepEqual(Object.keys(oldCapability),['kind'],'No Auth/consent DTO escapes the app');
  assert.equal(await transaction(coordinator,tx=>claimPort.requested({...s,inventoryDigest:'b'.repeat(64)},tx)),null,'Foreign original scope refused');
  assert.equal(await transaction(coordinator,tx=>claimPort.adopted(s,Object.freeze({kind:oldCapability.kind}),tx)),false,'Forged opaque object refused');
  const extraHome=preparedOuchiClaimModule.createPreparedOuchiClaimPort({...options,scope:s,homes:[{homeID:home,successorID:recipient},{homeID:randomUUID(),successorID:recipient}]});
  assert.equal(await transaction(coordinator,tx=>extraHome.requested(s,tx)),null,'Extra or foreign family roster refused by actual SQL frame');
  assert.throws(()=>preparedOuchiClaimModule.createPreparedOuchiClaimPort({...options,scope:s,homes:[]}),/Complete frozen Ouchi family roster/,'No empty-roster default approval');
  assert.equal(await transaction(coordinator,tx=>worker.verifyCurrent(owner,tx)),null,'Worker identity stays processing-only');
  assert.equal((await transaction(coordinator,tx=>prepared.verifyClaim(owner,tx))).kind,'prepared-consent-for-claim-only');
  for(const table of ['users','sessions','mfa_factors','mfa_amr_claims'])await assert.rejects(coordinator.query('select * from auth.'+table),/permission denied/);
  await assert.rejects(coordinator.query('set role ouchi_shared_consent_backend'),/permission denied/);
  await assert.rejects(coordinator.query('select * from maintenance_private.scoped_consent_bindings'),/permission denied/);
  // The captured root claimPrepared implementation uses direct journal SQL.
  // Give this local LOGIN a policy for ONLY this frozen fixture request/scope,
  // not BYPASSRLS, memberships, arbitrary root rows or Auth access.
  await admin.query('grant select,update on private.kb_shared_deletion_journal to shared_retirement_backend');
  const policySQL=(await admin.query("select format('create policy prepared_fixture_root on private.kb_shared_deletion_journal for all to shared_retirement_backend using(request_id=%L::uuid) with check(request_id=%L::uuid and user_id=%L::uuid and scope=%L::jsonb)', $1::text,$1::text,$2::text,$3::text) sql",[s.requestID,owner,JSON.stringify(fixed)])).rows[0].sql;
  await admin.query(policySQL);
  await admin.query(`create table maintenance_private.prepared_fixture_markers(id uuid primary key);
   grant select,insert on maintenance_private.prepared_fixture_markers to shared_retirement_backend;
   create function maintenance_private.prepared_fixture_ban(user_id uuid) returns void language sql security definer set search_path='' as $$update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=user_id$$;
   revoke all on function maintenance_private.prepared_fixture_ban(uuid) from public;
   grant execute on function maintenance_private.prepared_fixture_ban(uuid) to shared_retirement_backend;`);
  let fault='refuse';
  const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'claim-ready':async(_scope,tx)=>{
   const claimScope=fault==='late-wrong-lease'?s:_scope;
   const capability=await claimPort.requested(claimScope,tx);if(!capability)return false;
   await tx.query('insert into maintenance_private.prepared_fixture_markers values($1)',[randomUUID()]);
   if(fault==='refuse')return false;
   if(fault==='ban')await tx.query('select maintenance_private.prepared_fixture_ban($1)',[owner]);
   tx.beforeCommit('prepared-fixture-readback',async()=>{
    if(await claimPort.adopted(claimScope,capability,tx)!==true)return false;
    for(const actor of [owner,recipient])if(!await prepared.readClaimSnapshot(actor,tx))return false;return true;
   });return true;
  }});
  const root=async()=>(await admin.query('select status,lease_token,lease_until from private.kb_shared_deletion_journal where request_id=$1',[s.requestID])).rows[0];
  const requested=await root();assert.equal(await journal.claimPrepared(s),false);assert.deepEqual(await root(),requested);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.prepared_fixture_markers')).rows[0].n,0,'False claim-ready rolls staged work back');
  fault='ban';await assert.rejects(journal.claimPrepared(s),/Current transaction verification/);assert.deepEqual(await root(),requested);
  assert.equal((await admin.query('select banned_until from auth.users where id=$1',[owner])).rows[0].banned_until,null,'Late Auth change rolls back with failed claim');
  fault='none';assert.equal(await journal.claimPrepared({...s,leaseToken:randomUUID()}),false,'Wrong planned lease refuses before transition');assert.deepEqual(await root(),requested);
  fault='late-wrong-lease';await assert.rejects(journal.claimPrepared({...s,leaseToken:randomUUID()}),/Current transaction verification/);assert.deepEqual(await root(),requested,'Even an incomplete root callback cannot adopt the wrong transition lease');
  fault='none';
  assert.equal(await journal.claimPrepared(s),true);assert.equal((await root()).status,'processing');assert.equal((await root()).lease_token,s.leaseToken);
  assert.equal(await transaction(coordinator,tx=>claimPort.adopted(s,oldCapability,tx)),false,'A capability cannot move to another physical transaction');
  assert.equal(await transaction(coordinator,tx=>claimPort.requested(s,tx)),null,'Requested capability cannot be issued after processing');
  for(const actor of [owner,recipient]){
   const claim=await transaction(coordinator,tx=>prepared.verifyClaim(actor,tx));assert.ok(claim);
   const normal=await transaction(coordinator,tx=>worker.verifyCurrent(actor,tx));assert.ok(normal,'Normal worker identity now independently confirms same original Auth');
   assert.equal(normal.authStateDigest,claim.payload.authStateDigest);assert.equal(normal.sessionID,claim.payload.sessionID);
  }
  await assert.rejects(transaction(issuer,tx=>prepared.issue(actors.get(owner).token,tx)),/Requested-only original issuance/,'Prepared issuance cannot mint/replay after processing');
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows,custody,'Claim never reissues or changes original consent');
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner,'No family transfer or account erasure performed');
  console.log('Real GoTrue two-actor TOTP originals: requested issuance, false/late-Auth/wrong-lease claimPrepared rollbacks, formal processing COMMIT readback and unchanged normal worker identity; initial inventory/policy fixture, Ouchi-only scope');
 }finally{if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restoreSessions)restoreSessions();await admin.end();}
});
