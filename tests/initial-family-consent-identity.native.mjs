import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,home,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {familyAttachmentActivationFixture} from './fixtures/family-attachment-activation.mjs';
import {boundScopedModule,preparedOuchiClaimModule,initialFamilyModule} from './fixtures/scoped-shared-consent-module.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {createDeletionJournal} from './fixtures/kakei-completion/lib/shared-deletion-journal.mjs';

test('initial household and inventory consents bind real TOTP originals, enrollment and COMMIT checks',async()=>{
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
  let providers,context,policyLive=true;
  const key=randomBytes(32),policyReader=Object.assign(async()=>Object.freeze({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>policyLive});
  const f=await familyAttachmentActivationFixture({prepared:false,schemaOptions:{realAuth:true,completeCatalog:true,databaseFactory:async()=>db},beforeInitialConsents:async c=>{
   context=c;const {leaseToken:_,...fixed}=c.controllerScope;void _;
   await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
   await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[c.controllerScope.requestID,owner,fixed]);
   for(const file of ['scoped-shared-consent-auth.sql','bound-scoped-shared-consent.sql','prepared-scoped-shared-consent.sql','initial-family-consent-identity.sql','family-attachment-inventory-consent.sql'])await admin.query(readFileSync('tests/fixtures/'+file,'utf8'));
   await admin.query(`grant usage on schema private,maintenance_private to ouchi_shared_consent_backend,shared_retirement_backend;
    grant execute on function maintenance_private.prepared_scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint),maintenance_private.record_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint),maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.pin_initial_family_consent(uuid,uuid,uuid,uuid),maintenance_private.current_initial_family_identity(uuid,uuid,uuid,uuid,uuid,bigint,bigint),maintenance_private.read_initial_household_origin(uuid,uuid,uuid,uuid,uuid),maintenance_private.record_initial_household_consent(uuid,uuid,uuid,uuid,uuid,text,text,uuid,bigint,bigint) to ouchi_shared_consent_backend;`);
   issuer=new pg.Client({host:socket,user:'ouchi_shared_consent_backend',database:'postgres'});await issuer.connect();
   providers=initialFamilyModule.createInitialFamilyConsentProviders({key,householdKey:c.householdKey,projectID,requestID:c.scope.requestID,homeID:home,nativeLease:c.scope.nativeLease,rootLease:c.controllerScope.leaseToken,scope:c.controllerScope,plan:c.consentPlan,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null}),transaction:(work)=>transaction(issuer,work)});
   assert.equal((await admin.query('select count(*)::int n from maintenance_private.household_handoff_consents')).rows[0].n,0,'No synthetic household consent precedes real intake');
   await admin.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[home,owner,'legacy-proof-without-original']);
   assert.equal((await providers.issueHousehold(actors.get(owner).token,AbortSignal.timeout(10000))).status,'unconfirmed','Legacy proof cannot acquire original provenance');
   assert.equal((await admin.query('select count(*)::int n from maintenance_private.scoped_consent_bindings')).rows[0].n,0,'Refused original issuance rolls back');
   await admin.query('delete from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2',[home,owner]);
   return {providers,accessTokenForActor:actor=>actors.get(actor).token};
  }});
  const originalInventory={
   members:(await admin.query('select user_id from public.home_members where "homeId"=$1 order by user_id',[home])).rows,
   products:(await admin.query('select id from public.products where "homeId"=$1 order by id',[home])).rows,
   files:(await admin.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 order by f.id',[home])).rows,
   writes:(await admin.query('select a.* from maintenance_private.attachment_write_attempts a join maintenance_private.product_attachments f on f.id=a.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 order by a.attachment_id',[home])).rows
  };
  await admin.query('grant select,insert on maintenance_private.family_attachment_inventory_consents to ouchi_shared_consent_backend');
  const policy=(await admin.query("select format('create policy initial_inventory_fixture on maintenance_private.family_attachment_inventory_consents for all to ouchi_shared_consent_backend using(request_id=%L::uuid and home_id=%L::uuid) with check(request_id=%L::uuid and home_id=%L::uuid)', $1::text,$2::text,$1::text,$2::text) sql",[f.scope.requestID,home])).rows[0].sql;await admin.query(policy);
  const inventory=providers.createInventoryConsent({key:randomBytes(32),store:{transaction:providers.transaction,
   // Inventory preparation and controller coverage remain explicit fixtures;
   // identity, original custody and actual enrollment are real RPC boundaries.
   target:async()=>({scope:f.scope,plan:f.plan,inventory:JSON.parse(JSON.stringify(originalInventory))}),
   records:async tx=>(await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id',[f.scope.requestID,home])).rows,
   record:(tx,scope,plan,r)=>tx.query('insert into maintenance_private.family_attachment_inventory_consents values($1,$2,$3,$4,null)',[f.scope.requestID,home,r.actorID,r.token])
  },identifyActor:async()=>{throw Error('Caller actor verifier must be replaced');},verifyIdentity:async()=>{throw Error('Caller identity must be replaced');},verifyActor:async()=>false,currentAuthority:async()=>true});
  for(const actor of [owner,recipient])assert.equal((await inventory.issue({requestID:f.scope.requestID,homeID:home,accessToken:actors.get(actor).token,confirmation:'写真・保証書の一覧と受取先を確認して引き継ぎに同意する',signal:AbortSignal.timeout(10000)})).status,'accepted');
  const originals=(await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows;
  const origins=(await admin.query('select * from maintenance_private.initial_household_consent_origins order by actor_id')).rows;
  assert.equal(originals.length,2);assert.equal(origins.length,2);
  const inventoryRows=(await admin.query('select * from maintenance_private.family_attachment_inventory_consents order by actor_id')).rows;assert.equal(inventoryRows.length,2);
  for(const r of inventoryRows){const claim=JSON.parse(Buffer.from(r.token.split('.')[0],'base64url'));const original=originals.find(o=>o.actor_id===r.actor_id),origin=origins.find(o=>o.actor_id===r.actor_id);
   assert.equal(claim.sessionID,original.session_id);assert.equal(claim.epochID,origin.epoch_id);assert.equal(claim.authenticatedAt,Number(original.authenticated_at));assert.equal(claim.authStateDigest,original.auth_state_digest);assert.equal(claim.aal,'aal2');
  }
  await assert.rejects(providers.transaction(async tx=>{await providers.inventoryIdentity(actors.get(owner).token,tx,tx.signal);policyLive=false;},AbortSignal.timeout(10000)),/Current transaction verification/,'Policy loss at COMMIT must refuse');policyLive=true;
  for(const original of originals){
   const provenance=origins.find(v=>v.actor_id===original.actor_id);
   assert.equal(provenance.original_signature,original.signature);
   assert.equal(original.session_id,actors.get(original.actor_id).sessionID);
   const enrolled=(await admin.query('select epoch_id from maintenance_private.app_session_epochs where session_id=$1',[original.session_id])).rows[0];
   assert.equal(provenance.epoch_id,enrolled.epoch_id);
   assert.equal((await providers.issueHousehold(actors.get(original.actor_id).token,AbortSignal.timeout(10000))).status,'accepted');
  }
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows,originals,'Replay cannot reissue original');
  await assert.rejects(issuer.query('select * from auth.users'),/permission denied/);
  await assert.rejects(issuer.query('select * from maintenance_private.initial_household_consent_origins'),/permission denied/);
  const signal=AbortSignal.timeout(10000);
  assert.equal(await providers.transaction(tx=>providers.verifyHouseholdOrigins(tx),signal),true);
  const epoch=origins.find(v=>v.actor_id===recipient).epoch_id;
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[randomUUID(),actors.get(recipient).sessionID]);
  assert.equal(await providers.transaction(tx=>providers.verifyHouseholdOrigins(tx),signal),false,'Wrong actual enrollment cannot be replaced by actor-to-epoch mapping');
  await admin.query('update maintenance_private.app_session_epochs set epoch_id=$1 where session_id=$2',[epoch,actors.get(recipient).sessionID]);
  assert.equal(await providers.transaction(tx=>providers.verifyHouseholdOrigins(tx),signal),true);
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal(context.scope.requestID,f.scope.requestID);
  const scope=f.scope.controllerScope,{leaseToken:_,...fixedScope}=scope;void _;
  await admin.query(`grant execute on function maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.current_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint),maintenance_private.prepared_consent_claim_frame(uuid,uuid,jsonb,jsonb),maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.current_bound_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint) to shared_retirement_backend;
   grant select,update on private.kb_shared_deletion_journal to shared_retirement_backend;`);
  await admin.query((await admin.query("select format('create policy initial_claim_fixture on private.kb_shared_deletion_journal for all to shared_retirement_backend using(request_id=%L::uuid) with check(request_id=%L::uuid and user_id=%L::uuid and scope=%L::jsonb)', $1::text,$1::text,$2::text,$3::text) sql",[scope.requestID,owner,JSON.stringify(fixedScope)])).rows[0].sql);
  coordinator=new pg.Client({host:socket,user:'shared_retirement_backend',database:'postgres'});await coordinator.connect();
  const claimOptions={key,projectID,requestID:scope.requestID,homeID:home,nativeLease:f.scope.nativeLease,rootLease:scope.leaseToken,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null})};
  const claimPort=preparedOuchiClaimModule.createPreparedOuchiClaimPort({...claimOptions,scope,homes:[{homeID:home,successorID:recipient}]});let latePolicyLoss=true;
  const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'claim-ready':async(s,tx)=>{
   const cap=await claimPort.requested(s,tx);if(!cap)return false;
   tx.beforeCommit('initial-claim-adoption',()=>claimPort.adopted(s,cap,tx));
   if(latePolicyLoss)policyLive=false;return true;
  }});
  await assert.rejects(journal.claimPrepared(scope),/Current transaction verification/);policyLive=true;
  assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0].status,'requested','Late policy loss rolls actual root transition back');
  latePolicyLoss=false;assert.equal(await journal.claimPrepared(scope),true);
  const worker=boundScopedModule.createBoundScopedSharedConsent(claimOptions);
  for(const actor of [owner,recipient])assert.equal((await transaction(coordinator,tx=>worker.verifyCurrent(actor,tx))).sessionID,actors.get(actor).sessionID,'Unchanged normal processing gate independently confirms original');
  assert.deepEqual((await admin.query('select * from maintenance_private.scoped_consent_bindings order by actor_id')).rows,originals,'Formal claim never reissues original');
  console.log('Real TOTP household originals and actual session enrollment verified; inventory issuance uses same original session, epoch, signed TOTP time and digest; formal claimPrepared late-policy rollback and same-transaction adoption verified; paired transfer still requires follow-up proof');
 }finally{if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restoreSessions)restoreSessions();await admin.end();}
});
