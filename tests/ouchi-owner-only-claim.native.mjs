import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,home,oe,re,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {ownerOnlyModule,ownerAfterLogoutModule,ownerAfterNativeModule,ownerAfterAuthModule,ownerAuthIntervalModule,ownerTerminalModule,ownerReadonlyTerminalModule} from './fixtures/scoped-shared-consent-module.mjs';
import {verifyGenerationFamilyHandoff,prepareGenerationHandoffFixture} from './fixtures/generation-family-handoff-20261021/native-cases.mjs';
import {verifyGenerationStagePrefix} from './fixtures/generation-stage-prefix-20261021/native-cases.mjs';
import {verifyGenerationRetentionAdmission} from './fixtures/generation-retention-admission-20261021/native-cases.mjs';
import {verifyGenerationFamilyOriginals} from './fixtures/generation-family-originals-20261021/native-cases.mjs';
import {verifyFamilyNativePreparation} from './fixtures/family-native-preparation-20261021/native-cases.mjs';
import {verifyFamilyBeforeClaimCompatibility} from './fixtures/family-before-claim-compatibility-20261021/native-cases.mjs';
import {verifyFamilyPreparationGenerations} from './fixtures/family-preparation-generations-20261021/native-cases.mjs';
import {verifyPreparationProvenance} from './fixtures/requested-preparation-provenance-20261021/native-cases.mjs';
import {verifyRequestedCancellation} from './fixtures/ouchi-requested-cancellation-cases.mjs';
import {verifyOwnerReadonlyProjection} from './fixtures/owner-readonly-terminal-cases.mjs';
import {verifyOwnerTerminal} from './fixtures/owner-terminal-held-cases.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {createDeletionJournal} from './fixtures/kakei-completion/lib/shared-deletion-journal.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {createSharedMaintenancePrelogoutCustody} from '../lib/shared-maintenance-prelogout-custody.mjs';
import {deletionStages} from '../lib/shared-deletion-protocol.mjs';
import {createSharedNativeReviewedErasure} from '../lib/shared-native-reviewed-erasure.mjs';
import {prepareReviewedNativeCase} from './fixtures/shared-native-reviewed-cleanup-20261021/native-cases.mjs';
import {installHeldAuthExclusionFixture,runHeldAuthRemovalInterval,verifyHeldAuthExclusion} from './fixtures/auth-recreation-held-cases.mjs';

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
  const retainedProduct=randomUUID();await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[retainedProduct,memberHome,'air','Retained other-owner product']);
  const retainedProductRow=(await admin.query('select * from public.products where id=$1',[retainedProduct])).rows;
  for(const file of ['household-fence.sql','scoped-worker.sql','handoff.sql'])await admin.query(readFileSync('tests/fixtures/handoff-controller-compatibility/'+file,'utf8'));
  const nativeID=randomUUID(),nativeLease=randomUUID();
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'c'.repeat(64),apps:[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()},{app:'ouchi-maintenance',requestID:nativeID,scopeID:oe}]};
  const {leaseToken:_,...fixedScope}=scope;void _;
  await admin.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeID,owner,oe,nativeLease]);
  assert.equal((await admin.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) ok',[nativeID,owner,oe,nativeLease])).rows[0].ok,true,'Native preparation uses canonical inventory capture, not a completion flag');
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
  assert.equal(await transaction(coordinator,tx=>port.verifyProcessingOriginal(scope,tx)),false,'Requested state is not processing authority');
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
  assert.equal(await transaction(coordinator,tx=>port.verifyProcessingOriginal(scope,tx)),true,'Independent original remains current after formal claim');
  assert.equal(await transaction(coordinator,tx=>port.verifyProcessingOriginal({...scope,apps:[...scope.apps].reverse()},tx)),false,'Processing check preserves app order');
  assert.equal(await transaction(coordinator,tx=>expired.verifyProcessingOriginal(scope,tx)),false,'Claim-start freshness is never extended for processing');
  const wrongLeasePort=ownerOnlyModule.createOuchiOwnerOnlyClaimPort({...options,nativeLease:randomUUID()});
  assert.equal(await transaction(coordinator,tx=>wrongLeasePort.verifyProcessingOriginal(scope,tx)),false,'Native lease must still match actual request and binding');
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[randomUUID(),actors.get(owner).sessionID]);
  assert.equal(await transaction(coordinator,tx=>port.verifyProcessingOriginal(scope,tx)),false,'Processing requires actual unchanged session enrollment');
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[oe,actors.get(owner).sessionID]);
  const rootDeadline=(await admin.query('select lease_until from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].lease_until;
  await admin.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[scope.requestID]);
  assert.equal(await transaction(coordinator,tx=>port.verifyProcessingOriginal(scope,tx)),false,'Expired actual root lease refuses processing');
  await admin.query('update private.kb_shared_deletion_journal set lease_until=$2 where request_id=$1',[scope.requestID,rootDeadline]);
  const priorReceipts=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts;
  await assert.rejects(transaction(coordinator,async tx=>{
   assert.equal(await port.verifyProcessingOriginal(scope,tx),true);
   tx.beforeCommit('processing-owner-original',()=>port.verifyProcessingOriginal(scope,tx));
   await tx.query("update private.kb_shared_deletion_journal set receipts=receipts||'{\"uncommitted-processing-marker\":true}'::jsonb where request_id=$1",[scope.requestID]);
   policyLive=false;
  }),/Current transaction verification/);
  policyLive=true;
  assert.deepEqual((await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts,priorReceipts,'Late processing verification failure rolls caller work back');
  assert.equal(await transaction(coordinator,async tx=>{
   const valid=await port.verifyProcessingOriginal(scope,tx);
   tx.beforeCommit('processing-owner-original',()=>port.verifyProcessingOriginal(scope,tx));return valid;
  }),true,'Hook-free verification can be repeated by the owning COMMIT');
  assert.equal(await transaction(coordinator,tx=>port.adopted(scope,foreignCap,tx)),false);
  await assert.rejects(transaction(issuer,tx=>port.issue(actors.get(owner).token,tx)),/Requested-only/);
  assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original);
  for(const client of [issuer,coordinator]){await assert.rejects(client.query('select * from auth.users'),/permission denied/);await assert.rejects(client.query('select * from maintenance_private.ouchi_owner_originals'),/permission denied/);}
  // Isolated Ouchi boundary proof, not a duplicate two-app pipeline. Other-app
  // inventory/readiness and metadata ACLs remain explicit fixture boundaries.
  // The Ouchi original, formal claim, checkpoint and prelogout custody are real
  // protected producers; no guard is weakened to create a positive snapshot.
  for(const file of ['family-attachment-journal.sql','family-attachment-quota.sql','family-attachment-activation.sql','family-attachment-completion.sql','shared-family-stage-store.sql'])await admin.query(readFileSync('tests/fixtures/'+file,'utf8'));
  for(const relation of ['maintenance_private.household_handoff_plans','public.homes','public.home_members','maintenance_private.household_principal_fences'])await admin.query('grant select on '+relation+' to shared_retirement_backend;create policy owner_history_fixture_read on '+relation+' for select to shared_retirement_backend using(true)');
  await admin.query('grant select,insert on maintenance_private.shared_family_stage_contexts to shared_retirement_backend;create policy owner_history_checkpoint_read on maintenance_private.shared_family_stage_contexts for select to shared_retirement_backend using(true);create policy owner_history_checkpoint_insert on maintenance_private.shared_family_stage_contexts for insert to shared_retirement_backend with check(backend_pid=pg_backend_pid() and transaction_id=txid_current() and expires_at>clock_timestamp())');
  const currentOwner=async(tx,s)=>JSON.stringify(s)===JSON.stringify(scope)&&await port.verifyProcessingOriginal(s,tx);
  const stages={...Object.fromEntries(deletionStages(scope).map(stage=>[stage,async()=>false])),'prepare':async(s,tx)=>{if(!await currentOwner(tx,s))return false;tx.beforeCommit('owner-history-prepare',()=>currentOwner(tx,s));return true;},'verify-family-before':async(s,tx)=>{if(!await currentOwner(tx,s))return false;tx.beforeCommit('owner-history-before',()=>currentOwner(tx,s));return true;}};
  const prep=createDeletionJournal({transaction:work=>transaction(coordinator,work)},stages);
  await prep.perform(scope,'prepare');
  const emptyCoverage=sharedFamilyCoverageDigest([],scope);
  const checkpoint=createSharedFamilyStageStore({verifyReadAuthority:(tx,s)=>currentOwner(tx,s),loadValidatedTargets:async(tx,s)=>{if(!await currentOwner(tx,s))throw Error('Independent current zero-family owner required');return [];}});
  await transaction(coordinator,tx=>checkpoint.record(tx,scope,emptyCoverage,tx.signal));
  await prep.perform(scope,'verify-family-before');
  for(const file of ['shared-maintenance-native-stage.sql','shared-prelogout-receipt-custody.sql'])await admin.query(readFileSync('tests/fixtures/prelogout-dependencies-20261020/'+file,'utf8'));
  await admin.query(readFileSync('tests/fixtures/shared-maintenance-prelogout-custody.sql','utf8'));
  await admin.query('grant execute on function maintenance_private.ouchi_prelogout_frame(jsonb,uuid,boolean),maintenance_private.ouchi_capture_prelogout_custody(jsonb,uuid) to shared_retirement_backend');
  const prelogout=createSharedMaintenancePrelogoutCustody({verifyCurrentGates:async(tx,s)=>await currentOwner(tx,s)&&(await checkpoint.read(tx,s,tx.signal))?.familyCoverageDigest===emptyCoverage});
  const mapping={requestID:nativeID,userID:owner,epochID:oe,leaseToken:nativeLease};
  assert.equal(await transaction(coordinator,tx=>prelogout.capture(tx,scope,mapping)),true);
  const savedManifest=(await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows;
  const sessionRow=(await admin.query('select to_jsonb(s) body from auth.sessions s where id=$1',[actors.get(owner).sessionID])).rows[0].body;
  await admin.query(readFileSync('tests/fixtures/ouchi-owner-after-logout-consent.sql','utf8'));
  await admin.query('grant execute on function maintenance_private.read_ouchi_owner_after_logout_original(uuid,uuid,jsonb,uuid) to shared_retirement_backend;create table private.owner_history_marker(id int);grant insert on private.owner_history_marker to shared_retirement_backend');
  let namespaceFixtureLive=true;
  const history=ownerAfterLogoutModule.createOuchiOwnerAfterLogoutConsent({key:options.key,scope,nativeLease,verifyReadAuthority:async(tx,s,checkSignal)=>{
   if(!namespaceFixtureLive||checkSignal!==tx.signal||JSON.stringify(s)!==JSON.stringify(scope))return false;
   return (await tx.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner])).rows[0]?.stopped===true;
  }});
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Live session is never logout historical authority');
  const logout=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{authorization:'Bearer '+actors.get(owner).token}});
  assert.equal(logout.status,204);
  assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1',[owner])).rows[0].n,0);
  assert.equal(await transaction(coordinator,tx=>port.verifyProcessingOriginal(scope,tx)),false,'Actual global logout is refused, never reinterpreted as historical authority');
  const historical=await transaction(coordinator,tx=>history.read(tx));assert.equal(historical.kind,'owner-only-pre-native-after-logout-history');
  assert.deepEqual(historical.payload,original.payload);assert.equal(historical.signature,original.signature);
  assert.equal((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows[0].native_epoch,oe);
  assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows,savedManifest,'Historical reads never rewrite original session custody');
  await admin.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[scope.requestID]);
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Expired actual root lease refuses historical reads too');
  await admin.query('update private.kb_shared_deletion_journal set lease_until=$2 where request_id=$1',[scope.requestID,rootDeadline]);
  const authFK=(await admin.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where contype='f' and conrelid='auth.sessions'::regclass and confrelid='auth.users'::regclass and conkey=array[(select attnum from pg_attribute where attrelid='auth.sessions'::regclass and attname='user_id')]")).rows[0];assert.ok(authFK);
  await admin.query('alter table auth.sessions drop constraint '+pg.escapeIdentifier(authFK.conname));
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Missing immediate Auth session FK refuses instead of trusting an empty scan');
  await admin.query('alter table auth.sessions add constraint '+pg.escapeIdentifier(authFK.conname)+' '+authFK.definition);
  await transaction(coordinator,async tx=>{
   assert.ok(await history.read(tx));
   await writer.query('begin');await writer.query("set local lock_timeout='150ms'");
   await assert.rejects(writer.query('insert into auth.sessions select (jsonb_populate_record(null::auth.sessions,$1::jsonb)).*',[JSON.stringify(sessionRow)]),/lock timeout/,'Actual FK insertion cannot recreate any owner session while history holds Auth parent');
   await writer.query('rollback');
  });
  const nativeDeadline=(await admin.query('select lease_until from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0].lease_until;
  await admin.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[nativeID]);
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Expired actual native lease refuses history');
  await admin.query('update maintenance_private.account_deletion_requests set lease_until=$2 where id=$1',[nativeID,nativeDeadline]);
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[randomUUID(),actors.get(owner).sessionID]);
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Original stored session must retain its actual enrolled epoch');
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[oe,actors.get(owner).sessionID]);
  // Disposable DB fault injection only. Disabled guards themselves refuse;
  // corrupt metadata is also refused after guards are restored, then reverted.
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody disable trigger immutable_prelogout_custody');
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Disabled immutable manifest guard refuses');
  await admin.query('update maintenance_private.shared_prelogout_receipt_custody set native_epoch=$2 where request_id=$1',[nativeID,randomUUID()]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody enable trigger immutable_prelogout_custody');
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Wrong immutable manifest epoch refuses');
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody disable trigger immutable_prelogout_custody');
  await admin.query('update maintenance_private.shared_prelogout_receipt_custody set native_epoch=$2 where request_id=$1',[nativeID,oe]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody enable trigger immutable_prelogout_custody');
  await admin.query('alter table maintenance_private.ouchi_owner_originals disable trigger immutable_owner_original');
  await admin.query("update maintenance_private.ouchi_owner_originals set signature=repeat('0',64) where request_id=$1",[scope.requestID]);
  await admin.query('alter table maintenance_private.ouchi_owner_originals enable trigger immutable_owner_original');
  await assert.rejects(transaction(coordinator,tx=>history.read(tx)),/signature/,'HMAC is verified independently, not replaced with a database boolean');
  await admin.query('alter table maintenance_private.ouchi_owner_originals disable trigger immutable_owner_original');
  await admin.query('update maintenance_private.ouchi_owner_originals set signature=$2 where request_id=$1',[scope.requestID,original.signature]);
  await admin.query('alter table maintenance_private.ouchi_owner_originals enable trigger immutable_owner_original');
  await assert.rejects(transaction(coordinator,async tx=>{
   assert.ok(await history.read(tx));await tx.query('insert into private.owner_history_marker values(1)');namespaceFixtureLive=false;
  }),/Current transaction verification/);namespaceFixtureLive=true;
  assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker')).rows[0].n,0,'Late independent read-authority loss rolls caller work back');
  assert.ok(await transaction(coordinator,tx=>history.read(tx)),'Fresh checked transaction can retry after rollback');
  await assert.rejects(coordinator.query('select * from maintenance_private.shared_prelogout_receipt_custody'),/permission denied/);
  assert.equal((await auth.request('/user',undefined,actors.get(recipient).token)).id,recipient,'Other real login remains valid');
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[memberHome])).rows[0].owner_id,recipient);
  assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original,'Processing checks never renew, re-sign or modify the original');
  // Post-native candidate: reuse the exact separately reviewed dedicated
  // executor. Earlier-app completion remains an explicit fixture, not a claim
  // of full Kakei cleanup. Canonical Ouchi erasure/seal is actually executed.
  await admin.query(readFileSync('tests/fixtures/ouchi-owner-after-native-consent.sql','utf8'));
  await admin.query('grant execute on function maintenance_private.read_ouchi_owner_after_native_original(uuid,uuid,jsonb,uuid) to shared_retirement_backend');
  await admin.query('grant select(id,"homeId",name) on public.products to shared_retirement_backend');
  await admin.query((await admin.query("select format('create policy owner_post_native_retained_fixture on public.products for select to shared_retirement_backend using(id=%L::uuid)', $1::text) sql",[retainedProduct])).rows[0].sql);
  const postOptions={key:options.key,scope,completionLease:nativeLease,verifyReadAuthority:async(tx,s,checkSignal)=>{
   if(!namespaceFixtureLive||checkSignal!==tx.signal||JSON.stringify(s)!==JSON.stringify(scope))return false;
   const retained=(await tx.query('select owner_id from public.homes where id=$1',[memberHome])).rows;
   const productRows=(await tx.query('select id,"homeId",name from public.products where id=$1',[retainedProduct])).rows;
   return retained.length===1&&retained[0].owner_id===recipient&&productRows.length===1&&productRows[0].homeId===memberHome&&productRows[0].name==='Retained other-owner product'&&(await tx.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner])).rows[0]?.stopped===true;
  }};
  const post=ownerAfterNativeModule.createOuchiOwnerAfterNativeConsent(postOptions);
  assert.equal(await transaction(coordinator,tx=>post.readSnapshot(tx)),null,'Running request cannot be read as canonical native completion');
  for(const stage of ['verify-sessions-before','erase:kakei','verify:kakei'])stages[stage]=async(s,tx)=>!!await history.readSnapshot(tx);
  for(const stage of ['verify-sessions-before','erase:kakei','verify:kakei'])await prep.perform(scope,stage);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_objects where request_id=$1',[nativeID])).rows[0].n,0,'This isolated native case has an actually empty object inventory; no absence flags are fabricated');
  await admin.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-native-retention-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[nativeID]);
  const privateWriters=readFileSync('tests/fixtures/handoff-controller-compatibility/private-writers.sql','utf8');
  const closedActivationStub="create function maintenance_private.allowed_family_attachment_activation(tbl text,before_value jsonb,after_value jsonb)\nreturns boolean language sql security invoker set search_path='' as $$ select false $$;";
  assert.ok(privateWriters.includes(closedActivationStub));
  const activationDefinition=(await admin.query("select pg_get_functiondef('maintenance_private.allowed_family_attachment_activation(text,jsonb,jsonb)'::regprocedure) body")).rows[0].body;
  // Its real strict activation verifier was loaded earlier. Skip only the old
  // bootstrap stub; never replace that verifier or weaken any row guard.
  await admin.query(privateWriters.replace(closedActivationStub,''));
  assert.equal((await admin.query("select pg_get_functiondef('maintenance_private.allowed_family_attachment_activation(text,jsonb,jsonb)'::regprocedure) body")).rows[0].body,activationDefinition);
  await admin.query(readFileSync('tests/fixtures/restricted-native-executor-20261021/shared-native-owner-profile.sql','utf8'));
  const executor=createSharedNativeReviewedErasure({scope,nativeLease,verifyBefore:async(s,tx)=>JSON.stringify(s)===JSON.stringify(scope)&&!!await history.readSnapshot(tx),verifySealed:async(s,tx)=>JSON.stringify(s)===JSON.stringify(scope)&&!!await post.readSnapshot(tx)});
  const reviewedCase=await prepareReviewedNativeCase({admin,coordinator,scope,nativeID,epoch:oe,user:owner,otherUser:recipient,otherEpoch:re,home:memberHome,transaction});
  await reviewedCase.rejectForeign(executor);
  let refuseSealCommit=true;
  stages['erase:ouchi-maintenance']=async(s,tx)=>{const ok=await executor.erase(s,tx);tx.beforeCommit('owner-native-seal-fixture',async()=>!refuseSealCommit&&!!await post.readSnapshot(tx));return ok;};
  const beforeNative=(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows;
  await assert.rejects(prep.perform(scope,'erase:ouchi-maintenance'),/Current transaction verification/);
  assert.deepEqual((await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows,beforeNative,'Late refusal rolls canonical native flags/seal and outer erase receipt back');
  assert.equal((await admin.query('select count(*)::int n from public.products where "homeId"=$1',[home])).rows[0].n,1,'Real records are restored by the failed owning transaction');
  await reviewedCase.verifyRolledBack();
  refuseSealCommit=false;await prep.perform(scope,'erase:ouchi-maintenance');
  await reviewedCase.verifyComplete();
  const sealed=(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0];
  assert.equal(sealed.state,'complete');assert.equal(sealed.completion_lease,nativeLease);assert.equal(sealed.lease_token,null);assert.equal(sealed.lease_until,null);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.app_session_epochs where user_id=$1',[owner])).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.app_epochs where user_id=$1',[owner])).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from public.products where "homeId"=$1',[home])).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from public.homes where id=$1',[home])).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from public.home_members where user_id=$1',[owner])).rows[0].n,0,'Own member-only participation was erased without deleting the other owner home');
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Pre-native historical reader still refuses after actual native erasure');
  const postResult=await transaction(coordinator,tx=>post.read(tx));assert.equal(postResult.kind,'owner-only-post-native-before-auth-history');
  assert.deepEqual(postResult.payload,original.payload);assert.equal(postResult.signature,original.signature);
  await transaction(coordinator,async tx=>{
   assert.ok(await post.read(tx));
   await writer.query('begin');await writer.query("set local lock_timeout='150ms'");
   await assert.rejects(writer.query('insert into auth.sessions select (jsonb_populate_record(null::auth.sessions,$1::jsonb)).*',[JSON.stringify(sessionRow)]),/lock timeout/,'Post-native history still fences real session insertion at the Auth parent');await writer.query('rollback');
  });
  await admin.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[scope.requestID]);
  assert.equal(await transaction(coordinator,tx=>post.readSnapshot(tx)),null,'Expired current root lease cannot be replaced with a historical native seal');
  await admin.query('update private.kb_shared_deletion_journal set lease_until=$2 where request_id=$1',[scope.requestID,rootDeadline]);
  await admin.query('alter table auth.sessions drop constraint '+pg.escapeIdentifier(authFK.conname));
  assert.equal(await transaction(coordinator,tx=>post.readSnapshot(tx)),null,'Post-native session absence also requires the immediate Auth FK');
  await admin.query('alter table auth.sessions add constraint '+pg.escapeIdentifier(authFK.conname)+' '+authFK.definition);
  assert.equal(await transaction(coordinator,tx=>ownerAfterNativeModule.createOuchiOwnerAfterNativeConsent({...postOptions,completionLease:randomUUID()}).readSnapshot(tx)),null,'Different completion lease refuses');
  const completeReceipts=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts;
  await admin.query("update private.kb_shared_deletion_journal set receipts=receipts-'verify:kakei' where request_id=$1",[scope.requestID]);
  assert.equal(await transaction(coordinator,tx=>post.readSnapshot(tx)),null,'A later erase receipt cannot bridge a missing ordered prerequisite');
  await admin.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[scope.requestID,completeReceipts]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody disable trigger immutable_prelogout_custody');
  await admin.query('update maintenance_private.shared_prelogout_receipt_custody set native_epoch=$2 where request_id=$1',[nativeID,randomUUID()]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody enable trigger immutable_prelogout_custody');
  assert.equal(await transaction(coordinator,tx=>post.readSnapshot(tx)),null,'Post-native reader cannot replace original epoch with erased/current inference');
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody disable trigger immutable_prelogout_custody');
  await admin.query('update maintenance_private.shared_prelogout_receipt_custody set native_epoch=$2 where request_id=$1',[nativeID,oe]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody enable trigger immutable_prelogout_custody');
  await admin.query('alter table maintenance_private.ouchi_owner_originals disable trigger immutable_owner_original');
  await admin.query("update maintenance_private.ouchi_owner_originals set signature=repeat('0',64) where request_id=$1",[scope.requestID]);
  await admin.query('alter table maintenance_private.ouchi_owner_originals enable trigger immutable_owner_original');
  await assert.rejects(transaction(coordinator,tx=>post.read(tx)),/signature/);
  await admin.query('alter table maintenance_private.ouchi_owner_originals disable trigger immutable_owner_original');
  await admin.query('update maintenance_private.ouchi_owner_originals set signature=$2 where request_id=$1',[scope.requestID,original.signature]);
  await admin.query('alter table maintenance_private.ouchi_owner_originals enable trigger immutable_owner_original');
  await assert.rejects(transaction(coordinator,async tx=>{assert.ok(await post.read(tx));await tx.query('insert into private.owner_history_marker values(2)');namespaceFixtureLive=false;}),/Current transaction verification/);namespaceFixtureLive=true;
  assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker')).rows[0].n,0);
  assert.ok(await transaction(coordinator,tx=>post.read(tx)));
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[memberHome])).rows[0].owner_id,recipient);
  assert.deepEqual((await admin.query('select * from public.products where id=$1',[retainedProduct])).rows,retainedProductRow,'All retained member-only product columns remain byte-for-byte equal');
  assert.equal((await auth.request('/user',undefined,actors.get(recipient).token)).id,recipient);
  assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows,savedManifest);
  assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original);
  assert.deepEqual((await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0],sealed,'Historical reads never extend completion expiry or change native seal');
  // Separate post-Auth read authority. The fixture live flag below is NOT a
  // proven Auth INSERT exclusion mechanism. Production must supply independent
  // coverage/held authority for every actual recreation and reenrollment path.
  // This test deliberately recreates a real Auth user while SQL is open to
  // prove there is NO missing-parent insertion lock and final reads refuse.
  await admin.query(readFileSync('tests/fixtures/ouchi-owner-after-auth-consent.sql','utf8'));
  await admin.query('grant execute on function maintenance_private.read_ouchi_owner_after_auth_original(uuid,uuid,jsonb,uuid) to shared_retirement_backend');
  let authInsertionFixtureClosed=true;
  const afterAuthOptions={...postOptions,verifyAuthRecreationFence:async(tx,s,checkSignal)=>authInsertionFixtureClosed&&checkSignal===tx.signal&&JSON.stringify(s)===JSON.stringify(scope)&&(await tx.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner])).rows[0]?.stopped===true};
  const afterAuth=ownerAfterAuthModule.createOuchiOwnerAfterAuthConsent(afterAuthOptions);
  assert.equal(await transaction(coordinator,tx=>afterAuth.readSnapshot(tx)),null,'Actual Auth removal is not inferred from native completion');
  for(const stage of ['verify:ouchi-maintenance','verify-family','verify-sessions'])stages[stage]=async(s,tx)=>JSON.stringify(s)===JSON.stringify(scope)&&!!await post.readSnapshot(tx);
  for(const stage of ['verify:ouchi-maintenance','verify-family','verify-sessions'])await prep.perform(scope,stage);
  const actualAuthAbsent=async()=>{
   const response=await auth.adminFetch('https://'+projectID+'.supabase.co/auth/v1/admin/users/'+owner,{method:'GET'});
   const body=await response.json();return response.status===404&&body.code===404&&body.error_code==='user_not_found';
  };
  assert.equal(await actualAuthAbsent(),false);
  await installHeldAuthExclusionFixture(admin);
  await runHeldAuthRemovalInterval({admin,coordinator,auth,scope,socket,transaction,postOptions,createInterval:ownerAuthIntervalModule.createOuchiOwnerAuthIntervalConsent,createAfterAuth:ownerAfterAuthModule.createOuchiOwnerAfterAuthConsent,oldAfterAuth:afterAuth,oldPostNative:post,stages,journal:prep,actualAuthAbsent});
  assert.equal(await actualAuthAbsent(),true);
  assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1',[owner])).rows[0].n,0);
  const afterAuthResult=await transaction(coordinator,tx=>afterAuth.read(tx));assert.equal(afterAuthResult.kind,'owner-only-post-auth-processing-history');
  assert.deepEqual(afterAuthResult.payload,original.payload);assert.equal(afterAuthResult.signature,original.signature);
  await admin.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[scope.requestID]);
  assert.equal(await transaction(coordinator,tx=>afterAuth.readSnapshot(tx)),null,'Native completion cannot replace an expired processing root after Auth removal');
  await admin.query('update private.kb_shared_deletion_journal set lease_until=$2 where request_id=$1',[scope.requestID,rootDeadline]);
  const authAcknowledgedReceipts=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].receipts;
  await admin.query("update private.kb_shared_deletion_journal set receipts=receipts-'erase-auth' where request_id=$1",[scope.requestID]);
  assert.equal(await transaction(coordinator,tx=>afterAuth.readSnapshot(tx)),null,'Actual absence alone never substitutes for durable exact erase-auth custody');
  await admin.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[scope.requestID,authAcknowledgedReceipts]);
  await assert.rejects(coordinator.query('select * from auth.users'),/permission denied/);
  assert.equal(await transaction(coordinator,tx=>post.readSnapshot(tx)),null,'Auth-parent-required post-native reader remains closed after actual removal');
  assert.equal(await transaction(coordinator,tx=>history.readSnapshot(tx)),null,'Pre-native reader is not widened either');
  for(const changed of [{scope:{...scope,requestID:randomUUID()}},{scope:{...scope,leaseToken:randomUUID()}},{completionLease:randomUUID()}])assert.equal(await transaction(coordinator,tx=>ownerAfterAuthModule.createOuchiOwnerAfterAuthConsent({...afterAuthOptions,...changed}).readSnapshot(tx)),null,'Wrong historical operation/lease refuses');
  await assert.rejects(transaction(coordinator,async tx=>{assert.ok(await afterAuth.read(tx));await tx.query('insert into private.owner_history_marker values(3)');authInsertionFixtureClosed=false;}),/Current transaction verification/);authInsertionFixtureClosed=true;
  assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker')).rows[0].n,0);
  await assert.rejects(transaction(coordinator,async tx=>{
   assert.ok(await afterAuth.read(tx));await tx.query('insert into private.owner_history_marker values(4)');
   await auth.createFixtureUser(owner,owner+'@fixture.invalid',randomBytes(30).toString('base64url'));
  }),/Current transaction verification/,'Real Auth reappearance is detected again at owning COMMIT; no imaginary parent lock');
  assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1',[owner])).rows[0].n,1,'External Auth recreation is not rolled back by caller SQL');
  assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker')).rows[0].n,0);
  assert.equal(await transaction(coordinator,tx=>afterAuth.readSnapshot(tx)),null,'Existing recreated user refuses even if fixture provider incorrectly says closed');
  await auth.eraseFixtureUser(owner); // Remove only this deliberately recreated synthetic fixture account.
  assert.ok(await transaction(coordinator,tx=>afterAuth.read(tx)));
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody disable trigger immutable_prelogout_custody');
  await admin.query('update maintenance_private.shared_prelogout_receipt_custody set native_epoch=$2 where request_id=$1',[nativeID,randomUUID()]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody enable trigger immutable_prelogout_custody');
  assert.equal(await transaction(coordinator,tx=>afterAuth.readSnapshot(tx)),null);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody disable trigger immutable_prelogout_custody');
  await admin.query('update maintenance_private.shared_prelogout_receipt_custody set native_epoch=$2 where request_id=$1',[nativeID,oe]);
  await admin.query('alter table maintenance_private.shared_prelogout_receipt_custody enable trigger immutable_prelogout_custody');
  await admin.query('alter table maintenance_private.ouchi_owner_originals disable trigger immutable_owner_original');
  await admin.query("update maintenance_private.ouchi_owner_originals set signature=repeat('0',64) where request_id=$1",[scope.requestID]);
  await admin.query('alter table maintenance_private.ouchi_owner_originals enable trigger immutable_owner_original');
  await assert.rejects(transaction(coordinator,tx=>afterAuth.read(tx)),/signature/);
  await admin.query('alter table maintenance_private.ouchi_owner_originals disable trigger immutable_owner_original');
  await admin.query('update maintenance_private.ouchi_owner_originals set signature=$2 where request_id=$1',[scope.requestID,original.signature]);
  await admin.query('alter table maintenance_private.ouchi_owner_originals enable trigger immutable_owner_original');
  stages['verify-auth']=async(s,tx)=>JSON.stringify(s)===JSON.stringify(scope)&&!!await afterAuth.readSnapshot(tx)&&await actualAuthAbsent();
  await prep.perform(scope,'verify-auth');assert.ok(await transaction(coordinator,tx=>afterAuth.read(tx)));
  assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].status,'processing','This candidate never creates global COMPLETE');
  assert.equal((await auth.request('/user',undefined,actors.get(recipient).token)).id,recipient);
  assert.deepEqual((await admin.query('select * from public.products where id=$1',[retainedProduct])).rows,retainedProductRow);
  assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody where request_id=$1',[nativeID])).rows,savedManifest);
  assert.deepEqual((await admin.query('select * from maintenance_private.ouchi_owner_originals')).rows[0],original);
  assert.deepEqual((await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0],sealed);
  await verifyHeldAuthExclusion({admin,coordinator,writer,auth,scope,socket,transaction,postOptions,createAfterAuth:ownerAfterAuthModule.createOuchiOwnerAfterAuthConsent});
  await verifyOwnerTerminal({admin,coordinator,auth,scope,socket,transaction,postOptions,terminalModule:ownerTerminalModule,createAfterAuth:ownerAfterAuthModule.createOuchiOwnerAfterAuthConsent,stages,journal:prep,original,manifest:savedManifest,nativeSeal:sealed,nativeID});
  await verifyOwnerReadonlyProjection({admin,coordinator,scope,postOptions,module:ownerReadonlyTerminalModule,nativeID});
  await verifyRequestedCancellation({admin,coordinator,auth,transaction});
  await verifyPreparationProvenance({admin,coordinator,issuer,auth,transaction,ownerOnlyModule,policyReader,projectID});
  await verifyFamilyPreparationGenerations({admin,coordinator,auth,transaction});
  await verifyFamilyBeforeClaimCompatibility({admin,auth});
  await verifyFamilyNativePreparation({admin,coordinator,auth,transaction});
  const generationFamilyCase=await verifyGenerationFamilyOriginals({admin,coordinator,issuer,auth,transaction,projectID,afterSchema:async()=>admin.query(readFileSync('tests/fixtures/generation-family-handoff-20261021/protocol.sql','utf8')),afterActorSetup:data=>prepareGenerationHandoffFixture({...data,admin})});
  await verifyGenerationFamilyHandoff({...generationFamilyCase,admin,coordinator,transaction});
  await verifyGenerationRetentionAdmission({admin,coordinator,issuer,auth,transaction,socket,projectID});
  await verifyGenerationStagePrefix({admin,coordinator,issuer,auth,transaction,socket,projectID});
  console.log('Real original/claim/checkpoint/prelogout/logout/native seal, separate non-Auth-locking interval with actual Admin DELETE/ack, and processing post-Auth history. Without the real held scope the legacy absence-only model still permits recreation; the separate held guard matrix now proves principal INSERT/id-UPDATE exclusion locally. Other Auth-table replica writes, all-app reenrollment/writer/DDL coverage and dispatch remain explicit separate fixtures. Original/manifest/native expiry/other-owner product/login unchanged; owner-zero terminal candidate independently checked below; no production changes.');
 }finally{if(writer)await writer.end();if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restoreSessions)restoreSessions();await admin.end();}
});
