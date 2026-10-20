import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,home,oe,re,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {ownerOnlyModule} from './fixtures/scoped-shared-consent-module.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {createDeletionJournal} from './fixtures/kakei-completion/lib/shared-deletion-journal.mjs';

test('independent zero-family Ouchi owner original: real Auth, enrollment, FK fences and exact claim adoption',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();
 let auth,issuer,coordinator,writer,restoreSessions;
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
  await seedHomeHandoffFullSchemaFixture({realAuth:true,completeCatalog:true,databaseFactory:async()=>db});await admin.query('reset role');
  await admin.query('delete from public.home_members where "homeId"=$1',[home]);
  // Member-only home is permitted and must not be mistaken for an owned family.
  const memberHome=randomUUID();await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[memberHome,recipient]);
  await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[memberHome,owner,'Member-only']);
  for(const file of ['household-fence.sql','scoped-worker.sql','handoff.sql'])await admin.query(readFileSync('tests/fixtures/handoff-controller-compatibility/'+file,'utf8'));
  const nativeID=randomUUID(),nativeLease=randomUUID();
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'c'.repeat(64),apps:[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()},{app:'ouchi-maintenance',requestID:nativeID,scopeID:oe}]};
  const {leaseToken:_,...fixedScope}=scope;void _;
  await admin.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeID,owner,oe,nativeLease]);
  await admin.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,scope,nativeLease]);
  await admin.query('select maintenance_private.freeze_household_scope($1,$2)',[scope,nativeLease]);
  await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
  await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,owner,fixedScope]);
  // Explicit local prerequisites only: these are not installed by candidate SQL.
  await admin.query(`alter table maintenance_private.household_handoff_plans add column root_request_id uuid generated always as ((scope->>'requestID')::uuid) stored;
   alter table maintenance_private.household_family_holds add column root_request_id uuid generated always as ((scope->>'requestID')::uuid) stored;
   alter table maintenance_private.household_handoff_plans add constraint zero_plan_owner_fk foreign key(owner_id) references auth.users(id);
   alter table maintenance_private.household_handoff_plans add constraint zero_plan_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id);
   alter table maintenance_private.household_family_holds add constraint zero_hold_owner_fk foreign key(principal) references auth.users(id);
   alter table maintenance_private.household_family_holds add constraint zero_hold_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id);`);
  await admin.query(readFileSync('tests/fixtures/ouchi-owner-only-consent.sql','utf8'));
  await admin.query(`grant usage on schema private,maintenance_private to ouchi_shared_consent_backend,shared_retirement_backend;
   grant execute on function maintenance_private.ouchi_owner_only_frame(uuid,uuid,jsonb,uuid),maintenance_private.ouchi_owner_auth(uuid,uuid,jsonb,uuid,uuid,bigint,bigint,bigint,bigint),maintenance_private.read_ouchi_owner_original(uuid,uuid,jsonb,uuid) to ouchi_shared_consent_backend,shared_retirement_backend;
   grant execute on function maintenance_private.record_ouchi_owner_original(uuid,uuid,jsonb,uuid,jsonb,text,bigint,bigint) to ouchi_shared_consent_backend;`);
  issuer=new pg.Client({host:socket,user:'ouchi_shared_consent_backend',database:'postgres'});await issuer.connect();
  coordinator=new pg.Client({host:socket,user:'shared_retirement_backend',database:'postgres'});await coordinator.connect();
  writer=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await writer.connect();
  let policyLive=true;const policyReader=Object.assign(async()=>Object.freeze({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>policyLive});
  const options={key:randomBytes(32),scope,nativeLease,projectID,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null})};
  const port=ownerOnlyModule.createOuchiOwnerOnlyClaimPort(options),signal=()=>AbortSignal.timeout(10000),frameArgs=[scope.requestID,scope.leaseToken,JSON.stringify(scope),nativeLease];
  // A second real account owns the member-only home, which is shared. Its
  // actual zero-roster frame must refuse even though no frozen plans exist.
  const sharedNative=randomUUID(),sharedLease=randomUUID(),sharedScope={...scope,requestID:randomUUID(),userID:recipient,leaseToken:randomUUID(),apps:[{app:'ouchi-maintenance',requestID:sharedNative,scopeID:re}]};
  const {leaseToken:sharedPlanned,...sharedFixed}=sharedScope;void sharedPlanned;
  await admin.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[sharedNative,recipient,re,sharedLease]);
  await admin.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[recipient,sharedScope,sharedLease]);
  await admin.query('select maintenance_private.freeze_household_scope($1,$2)',[sharedScope,sharedLease]);
  await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[sharedScope.requestID,recipient,sharedFixed]);
  assert.equal((await transaction(coordinator,tx=>tx.query(ownerOnlyModule.OUCHI_OWNER_FRAME_SQL,[sharedScope.requestID,sharedScope.leaseToken,JSON.stringify(sharedScope),sharedLease]))).rows.length,0,'Actually owned shared home refuses zero-family frame without relying on empty plans');
  assert.equal(await transaction(coordinator,tx=>port.requested(scope,tx)),null,'An empty roster without a signed original is never consent');
  await assert.rejects(transaction(issuer,tx=>port.issue(actors.get(recipient).token,tx)),/Verified original owner bearer/);
  assert.equal((await transaction(issuer,tx=>port.issue(actors.get(owner).token,tx))).status,'accepted');
  const original=(await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0];
  assert.equal(original.payload.sessionID,actors.get(owner).sessionID);assert.equal(original.payload.epochID,oe);assert.equal(original.payload.domain,'OuchiMaintenance/owner-only-original/v1');
  assert.equal(original.payload.scope.inventoryDigest,scope.inventoryDigest);assert.deepEqual(original.payload.scope.apps,scope.apps);
  await transaction(issuer,tx=>port.issue(actors.get(owner).token,tx));assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original,'Replay preserves signed original and expiry');
  assert.equal(await transaction(coordinator,tx=>port.requested({...scope,apps:[...scope.apps].reverse()},tx)),null,'App order remains part of root consent');
  const forgedPort=ownerOnlyModule.createOuchiOwnerOnlyClaimPort({...options,key:randomBytes(32)});assert.equal(await transaction(coordinator,tx=>forgedPort.requested(scope,tx)),null,'Wrong signing key cannot reuse original');
  await admin.query('alter table maintenance_private.household_handoff_plans drop constraint zero_plan_root_fk');
  assert.equal(await transaction(coordinator,tx=>port.requested(scope,tx)),null,'Missing immediate parent FK fails closed');
  await admin.query('alter table maintenance_private.household_handoff_plans add constraint zero_plan_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id)');
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[randomUUID(),actors.get(owner).sessionID]);
  assert.equal(await transaction(coordinator,tx=>port.requested(scope,tx)),null,'Unknown actual app enrollment fails closed');
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[oe,actors.get(owner).sessionID]);
  await admin.query('alter table maintenance_private.household_handoff_plans drop constraint zero_plan_root_fk');
  await admin.query('alter table maintenance_private.household_handoff_plans add constraint zero_plan_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id) not valid');
  assert.equal(await transaction(coordinator,tx=>port.requested(scope,tx)),null,'Unvalidated parent FK refused');
  await admin.query('alter table maintenance_private.household_handoff_plans validate constraint zero_plan_root_fk');
  await admin.query('alter table maintenance_private.household_handoff_plans drop constraint zero_plan_root_fk');
  await admin.query('alter table maintenance_private.household_handoff_plans add constraint zero_plan_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id) deferrable initially immediate');
  assert.equal(await transaction(coordinator,tx=>port.requested(scope,tx)),null,'Potentially deferred parent FK refused');
  await admin.query('alter table maintenance_private.household_handoff_plans drop constraint zero_plan_root_fk');
  await admin.query('alter table maintenance_private.household_handoff_plans add constraint zero_plan_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id)');
  const staleHome=randomUUID();await admin.query('insert into maintenance_private.household_handoff_plans(home_id,owner_id,successor_id,scope,plan,plan_digest,snapshot) values($1,$2,$3,$4,$5,$6,$7)',[staleHome,recipient,other,scope,{},'b'.repeat(64),{}]);
  assert.equal(await transaction(coordinator,tx=>port.requested(scope,tx)),null,'Foreign-owner plan naming this root is not an empty roster');
  await admin.query('delete from maintenance_private.household_handoff_plans where home_id=$1',[staleHome]);
  const expired=ownerOnlyModule.createOuchiOwnerOnlyClaimPort({...options,clock:()=>Date.now()+600001});assert.equal(await transaction(coordinator,tx=>expired.requested(scope,tx)),null,'Expired original cannot start claim');
  const foreignCap=await transaction(coordinator,tx=>port.requested(scope,tx));assert.ok(foreignCap);assert.deepEqual(Object.keys(foreignCap),['kind']);
  assert.equal(await transaction(coordinator,tx=>port.adopted(scope,foreignCap,tx)),false,'Capability cannot cross transactions');
  // A future plan insertion with no app trigger must block on the held root
  // FK, not on a synthetic child-table lock or assumed absence.
  await coordinator.query('begin');await runWithTransactionCommitChecks(coordinator,signal(),async tx=>{
   assert.equal((await tx.query(ownerOnlyModule.OUCHI_OWNER_FRAME_SQL,frameArgs)).rows.length,1);
   await writer.query('begin');await writer.query("set local lock_timeout='150ms'");
   await assert.rejects(writer.query('insert into maintenance_private.household_handoff_plans(home_id,owner_id,successor_id,scope,plan,plan_digest,snapshot) values($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),recipient,other,scope,{},'b'.repeat(64),{}]),/lock timeout/,'Wrong-owner future plan still blocks on exact root parent');await writer.query('rollback');
   await writer.query('begin');await writer.query("set local lock_timeout='150ms'");await assert.rejects(writer.query('select id from public.homes where id=$1 for key share',[home]),/lock timeout/,'Owned-home parent remains locked for concurrent membership FK');await writer.query('rollback');
   await writer.query('begin');await writer.query("set local lock_timeout='150ms'");await assert.rejects(writer.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,other,'Concurrent member']),/lock timeout/,'Actual concurrent member insertion cannot pass the retained owner freeze');await writer.query('rollback');
  });await coordinator.query('rollback');
  await admin.query('grant select,update on private.kb_shared_deletion_journal to shared_retirement_backend');
  await admin.query((await admin.query("select format('create policy owner_claim_fixture on private.kb_shared_deletion_journal for all to shared_retirement_backend using(request_id=%L::uuid) with check(request_id=%L::uuid and user_id=%L::uuid and scope=%L::jsonb)', $1::text,$1::text,$2::text,$3::text) sql",[scope.requestID,owner,JSON.stringify(fixedScope)])).rows[0].sql);
  let latePolicyLoss=true;
  const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'claim-ready':async(s,tx)=>{
   const cap=await port.requested(s,tx);if(!cap)return false;
   tx.beforeCommit('owner-adoption',()=>port.adopted(s,cap,tx));if(latePolicyLoss)policyLive=false;return true;
  }});
  await assert.rejects(journal.claimPrepared(scope),/Current transaction verification/);policyLive=true;
  assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].status,'requested','Late refusal rolls root transition back');
  latePolicyLoss=false;assert.equal(await journal.claimPrepared(scope),true);
  assert.equal(await transaction(coordinator,tx=>port.adopted(scope,foreignCap,tx)),false);
  await assert.rejects(transaction(issuer,tx=>port.issue(actors.get(owner).token,tx)),/Requested-only/);
  assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original);
  for(const client of [issuer,coordinator]){await assert.rejects(client.query('select * from auth.users'),/permission denied/);await assert.rejects(client.query('select * from maintenance_private.ouchi_owner_originals'),/permission denied/);}
  console.log('Independent Ouchi owner password/TOTP original, exact root/apps/enrollment, missing-FK denial, concurrent parent locks, actual claimPrepared late rollback/adoption; no family gate or native deletion invoked');
 }finally{if(writer)await writer.end();if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restoreSessions)restoreSessions();await admin.end();}
});
