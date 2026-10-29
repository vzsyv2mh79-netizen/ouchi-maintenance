import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,home,oe,product,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {completionSetup} from './fixtures/post-seal-family-setup.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {join} from 'node:path';
import {boundScopedModule,preparedOuchiClaimModule,initialFamilyModule,preNativeLogoutModule} from './fixtures/scoped-shared-consent-module.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {createDeletionJournal} from './fixtures/kakei-completion/lib/shared-deletion-journal.mjs';

test('separate post-logout pre-native history verifies actual initial origins and full retained family checkpoint',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();
 let auth,issuer,coordinator,restoreSessions,runtime=null,rootScope=null;
 const db={query:(...a)=>admin.query(...a),exec:sql=>admin.query(sql),close:async()=>{},transaction:async work=>{
  const client=runtime??admin;await client.query('begin');try{
   if(runtime)await client.query('select request_id from private.kb_shared_deletion_journal where request_id=$1 for update',[rootScope.requestID]);
   const value=await runWithTransactionCommitChecks(client,AbortSignal.timeout(10000),work);await client.query('commit');return value;
  }catch(e){await client.query('rollback');throw e;}
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
  const sourceDir=process.env.OUCHI_PRELOGOUT_SOURCE_DIR;assert.ok(sourceDir,'Explicit frozen fixture metadata ACL required');
  const workerSQL=readFileSync(join(sourceDir,'initial-family-runtime-worker.sql'));assert.equal(createHash('sha256').update(workerSQL).digest('hex'),'2c0a55bbaaabe81344c29254a39cf519b6d4e7c4f1b0ee1a8ae3771c1e60442c');
  const key=randomBytes(32),policyReader=Object.assign(async()=>Object.freeze({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>true});
  let originalOptions;
  const c=await completionSetup({includeKakei:true,schemaOptions:{realAuth:true,completeCatalog:true,databaseFactory:async()=>db},beforeFreeze:async(db,id)=>{
   await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);await db.query('update maintenance_private.account_deletion_requests set inventory_captured=true where id=$1',[id]);
  },beforeInitialConsents:async context=>{
   const s=context.controllerScope;rootScope=s;const {leaseToken:_,...fixed}=s;void _;
   await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
   await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[s.requestID,owner,fixed]);
   for(const file of ['scoped-shared-consent-auth.sql','bound-scoped-shared-consent.sql','prepared-scoped-shared-consent.sql','initial-family-consent-identity.sql'])await admin.query(readFileSync('tests/fixtures/'+file,'utf8'));
   await admin.query(`grant usage on schema private,maintenance_private,public to ouchi_shared_consent_backend,shared_retirement_backend;
    grant execute on function maintenance_private.prepared_scoped_shared_consent_auth(uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,bigint),maintenance_private.record_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,jsonb,text,bigint,bigint),maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.pin_initial_family_consent(uuid,uuid,uuid,uuid),maintenance_private.current_initial_family_identity(uuid,uuid,uuid,uuid,uuid,bigint,bigint),maintenance_private.read_initial_household_origin(uuid,uuid,uuid,uuid,uuid),maintenance_private.record_initial_household_consent(uuid,uuid,uuid,uuid,uuid,text,text,uuid,bigint,bigint) to ouchi_shared_consent_backend;
    grant execute on function maintenance_private.read_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.current_prepared_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint),maintenance_private.prepared_consent_claim_frame(uuid,uuid,jsonb,jsonb),maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid),maintenance_private.current_bound_scoped_consent(uuid,uuid,uuid,uuid,uuid,bigint,bigint) to shared_retirement_backend;`);
   issuer=new pg.Client({host:socket,user:'ouchi_shared_consent_backend',database:'postgres'});await issuer.connect();coordinator=new pg.Client({host:socket,user:'shared_retirement_backend',database:'postgres'});await coordinator.connect();
   originalOptions={key,projectID,requestID:s.requestID,homeID:home,nativeLease:context.scope.nativeLease,rootLease:s.leaseToken,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null})};
   const providers=initialFamilyModule.createInitialFamilyConsentProviders({...originalOptions,scope:s,plan:context.consentPlan,householdKey:context.householdKey,transaction:work=>transaction(issuer,work)});
   return {providers,accessTokenForActor:actor=>actors.get(actor).token};
  },beforeInventoryConsents:async({f})=>{
   for(const [schema,table] of [['public','home_members'],['public','products'],['maintenance_private','product_attachments'],['maintenance_private','attachment_write_attempts'],['maintenance_private','account_deletion_requests'],['maintenance_private','family_attachment_inventory_consents']]){
    // Fixture-only metadata ACL, deliberately not a production least-privilege claim.
    await admin.query('grant select,update on '+schema+'.'+table+' to ouchi_shared_consent_backend');
    await admin.query('create policy initial_issuer_read on '+schema+'.'+table+' for select to ouchi_shared_consent_backend using(true)');
    await admin.query('create policy initial_issuer_lock on '+schema+'.'+table+' for update to ouchi_shared_consent_backend using(true) with check(false)');
   }
   await admin.query('grant insert on maintenance_private.family_attachment_inventory_consents to ouchi_shared_consent_backend;create policy initial_issuer_insert on maintenance_private.family_attachment_inventory_consents for insert to ouchi_shared_consent_backend with check(true)');
   assert.equal(f.scope.homeID,home);
  },beforeFamilyActivation:async({s})=>{
   const scope=s.f.scope.controllerScope,{leaseToken:_,...fixed}=scope;void _;
   await admin.query('grant select,update on private.kb_shared_deletion_journal to shared_retirement_backend');
   await admin.query((await admin.query("select format('create policy archive_root_fixture on private.kb_shared_deletion_journal for all to shared_retirement_backend using(request_id=%L::uuid) with check(request_id=%L::uuid and user_id=%L::uuid and scope=%L::jsonb)', $1::text,$1::text,$2::text,$3::text) sql",[scope.requestID,owner,JSON.stringify(fixed)])).rows[0].sql);
   const port=preparedOuchiClaimModule.createPreparedOuchiClaimPort({...originalOptions,scope,homes:[{homeID:home,successorID:recipient}]});
   const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'claim-ready':async(value,tx)=>{const cap=await port.requested(value,tx);if(!cap)return false;tx.beforeCommit('adopt-before-family',()=>port.adopted(value,cap,tx));return true;}});
   assert.equal(await journal.claimPrepared(scope),true);
   await admin.query(workerSQL.toString());await admin.query('grant select on maintenance_private.household_principal_fences to shared_retirement_backend;create policy historical_fixture_fence_read on maintenance_private.household_principal_fences for select to shared_retirement_backend using(true)');await admin.query('grant select on public.maintenance_tasks,public.maintenance_history to shared_retirement_backend;create policy historical_fixture_tasks_read on public.maintenance_tasks for select to shared_retirement_backend using(true);create policy historical_fixture_history_read on public.maintenance_history for select to shared_retirement_backend using(true)');runtime=coordinator;
  }});
  c.clean();assert.equal((await c.finish()).state,'complete');runtime=null;
  const f=c.s.f,scope=f.scope.controllerScope,{leaseToken:_,...fixed}=scope;void _;
  await admin.query(readFileSync('tests/fixtures/shared-family-stage-store.sql','utf8'));
  const receipt=stage=>({...fixed,stage,durable:true});
  await admin.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[scope.requestID,{prepare:receipt('prepare')}]);
  const targets=[{scope:f.scope,plan:c.plan}],family=createSharedFamilyStageStore({loadValidatedTargets:async()=>targets,verifyReadAuthority:async()=>true});await transaction(admin,tx=>family.record(tx,scope,sharedFamilyCoverageDigest(targets,scope),tx.signal));
  await admin.query(readFileSync('tests/fixtures/pre-native-after-logout-consent.sql','utf8'));
  await admin.query('grant execute on function maintenance_private.read_pre_native_after_logout_consent(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to shared_retirement_backend');
  const originals=(await admin.query('select payload,signature from maintenance_private.scoped_consent_bindings order by actor_id')).rows;
  let live=true;
  const port=preNativeLogoutModule.createPreNativeAfterLogoutConsent({key,requestID:scope.requestID,homeID:home,rootLease:scope.leaseToken,nativeRequestID:f.scope.nativeRequestID,ownerEpoch:oe,nativeLease:f.scope.nativeLease,verifyReadAuthority:async(tx,authority,signal)=>{
   assert.equal(signal,tx.signal);assert.equal(authority.requestID,scope.requestID);return live;
  }});
  assert.equal(await transaction(coordinator,tx=>port.read(owner,tx)),null,'Missing exact verify-sessions-before receipt refuses');
  await admin.query('update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1',[scope.requestID,{'verify-family-before':receipt('verify-family-before'),'verify-sessions-before':receipt('verify-sessions-before')}]);
  assert.equal(await transaction(coordinator,tx=>port.read(owner,tx)),null,'Actual owner sessions still present: receipt is not absence');
  const loggedOut=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{authorization:'Bearer '+actors.get(owner).token}});assert.equal(loggedOut.status,204);
  assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1',[owner])).rows[0].n,0);
  for(const original of originals){const found=await transaction(coordinator,async tx=>{const first=await port.read(original.payload.userID,tx);assert.deepEqual(await port.readSnapshot(original.payload.userID,tx),first);return first;});assert.deepEqual(found,{kind:'pre-native-after-logout-historical-consent-only',...original});}
  // Actual current snapshot and hold failures, using disposable metadata
  // corruption only. Restore every guard before any positive confirmation.
  const oldName=(await admin.query('select name from public.products where id=$1',[product])).rows[0].name;
  await admin.query('alter table public.products disable trigger household_write_fence');
  assert.equal(await transaction(coordinator,tx=>port.read(owner,tx)),null,'Disabled writer guard refuses even unchanged content');
  await admin.query('update public.products set name=$2 where id=$1',[product,'Changed fixture snapshot']);
  await admin.query('alter table public.products enable trigger household_write_fence');
  assert.equal(await transaction(coordinator,tx=>port.read(owner,tx)),null,'Changed current family content cannot use immutable receipts');
  await admin.query('alter table public.products disable trigger household_write_fence');await admin.query('update public.products set name=$2 where id=$1',[product,oldName]);await admin.query('alter table public.products enable trigger household_write_fence');
  const hold=(await admin.query('select * from maintenance_private.household_family_holds where home_id=$1',[home])).rows[0];
  await admin.query('delete from maintenance_private.household_family_holds where home_id=$1',[home]);
  assert.equal(await transaction(coordinator,tx=>port.read(owner,tx)),null,'Missing retained hold refuses');
  await admin.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[hold.home_id,hold.principal,hold.scope]);
  assert.ok(await transaction(coordinator,tx=>port.read(owner,tx)));
  const ordered={...fixed,apps:[...fixed.apps].reverse()},early=Object.fromEntries(['prepare','verify-family-before','verify-sessions-before','erase:kakei','verify:kakei'].map(k=>[k,{...ordered,stage:k,durable:true}]));early['handoff-family']={...ordered,stage:'handoff-family',durable:true,familyCoverageDigest:'d'.repeat(64)};
  const grammar=async r=>(await admin.query('select maintenance_private.pre_native_logout_prerequisites($1,$2) ok',[ordered,r])).rows[0].ok;
  assert.equal(await grammar(early),true);const missingPrior={...early};delete missingPrior['verify:kakei'];assert.equal(await grammar(missingPrior),false,'Earlier app verify is required in exact order');
  assert.equal(await grammar({...early,prepare:{...early.prepare,durable:'true'}}),false);assert.equal(await grammar({...early,'erase:ouchi-maintenance':{}}),false);
  const current=boundScopedModule.createBoundScopedSharedConsent(originalOptions);assert.equal(await transaction(coordinator,tx=>current.verifyCurrent(owner,tx)),null,'Current reader still refuses vanished Auth');
  await admin.query('create table maintenance_private.pre_native_test_markers(id uuid primary key);grant select,insert on maintenance_private.pre_native_test_markers to shared_retirement_backend');
  await assert.rejects(transaction(coordinator,async tx=>{assert.ok(await port.read(owner,tx));await tx.query("insert into maintenance_private.pre_native_test_markers values($1)",[randomUUID()]);live=false;}),/Current transaction verification/);live=true;
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.pre_native_test_markers')).rows[0].n,0,'Late read authority refusal rolls staged metadata back');
  for(const field of ['rootLease','nativeRequestID','ownerEpoch','nativeLease'])assert.equal(await transaction(coordinator,tx=>preNativeLogoutModule.createPreNativeAfterLogoutConsent({...originalOptions,requestID:scope.requestID,homeID:home,nativeRequestID:f.scope.nativeRequestID,ownerEpoch:oe,nativeLease:f.scope.nativeLease,verifyReadAuthority:async()=>true,[field]:randomUUID()}).read(owner,tx)),null,field);
  assert.deepEqual((await admin.query('select payload,signature from maintenance_private.scoped_consent_bindings order by actor_id')).rows,originals,'Historical reads never rewrite or extend originals');
  assert.equal((await admin.query('select state from maintenance_private.account_deletion_requests where id=$1',[f.scope.nativeRequestID])).rows[0].state,'running');
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  for(const table of ['auth.sessions','maintenance_private.scoped_consent_bindings'])await assert.rejects(coordinator.query('select * from '+table),/permission denied/);
  console.log('Actual initial household/inventory TOTP originals, real family activation/completion and global logout; distinct pre-native historical read and unchanged current denial; Storage/global coverage/readiness and metadata ACL remain fixtures');
 }finally{if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restoreSessions)restoreSessions();await admin.end();}
});
