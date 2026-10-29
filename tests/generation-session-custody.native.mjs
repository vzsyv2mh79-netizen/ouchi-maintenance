import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {startFixtureGoTrue} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {verifyGenerationSessionProfile} from './fixtures/generation-session-custody-20261021/profile.mjs';
// A separate fourth-stage suite, not an abbreviated success claim for the full
// owner-zero regression. Loads the same actual schema and unchanged prerequisites.
test('generation fourth checkpoint: real GoTrue + preserved first-three stages and signed non-deleting session witness',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);assert.equal(process.env.OUCHI_GENERATION_SESSION_TEST,'true');
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();let auth,coordinator,issuer,restore;
 const db={query:(...a)=>admin.query(...a),exec:sql=>admin.query(sql),close:async()=>{},transaction:async work=>{await admin.query('begin');try{const v=await work(db);await admin.query('commit');return v;}catch(e){await admin.query('rollback');throw e;}}};
 const transaction=async(client,work)=>{await client.query('begin');try{await client.query("set local statement_timeout='4500ms'");const v=await runWithTransactionCommitChecks(client,AbortSignal.timeout(10000),work);await client.query('commit');return v;}catch(e){await client.query('rollback');throw e;}};
 const load=async path=>admin.query(readFileSync('tests/fixtures/'+path,'utf8'));
 try{
  await admin.query('create role postgres;create role ouchi_shared_consent_backend login nosuperuser nobypassrls;create role shared_retirement_backend login nosuperuser nobypassrls;create schema auth');await load('auth/rest-bootstrap.sql');
  const projectID='hphifiqyypwyxkzfanod';auth=await startFixtureGoTrue(socket,'https://'+projectID+'.supabase.co/auth/v1');const sessions=[];
  for(const user of [owner,recipient,other]){const password=randomBytes(30).toString('base64url'),email=user+'@fixture.invalid';await auth.createFixtureUser(user,email,password);if(user!==other){const login=await auth.request('/token?grant_type=password',{email,password});sessions.push(JSON.parse(Buffer.from(login.access_token.split('.')[1],'base64url')).session_id);}}
  restore=bindRealAuthSessions(...sessions);await seedHomeHandoffFullSchemaFixture({realAuth:true,completeCatalog:true,databaseFactory:async()=>db});await admin.query('reset role');
  for(const n of ['household-fence.sql','scoped-worker.sql','handoff.sql'])await load('handoff-controller-compatibility/'+n);
  await load('shared-controller-journal.sql');
  await admin.query(`alter table maintenance_private.household_handoff_plans add column root_request_id uuid generated always as ((scope->>'requestID')::uuid) stored;
   alter table maintenance_private.household_family_holds add column root_request_id uuid generated always as ((scope->>'requestID')::uuid) stored;
   alter table maintenance_private.household_handoff_plans add constraint zero_plan_owner_fk foreign key(owner_id) references auth.users(id);
   alter table maintenance_private.household_handoff_plans add constraint zero_plan_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id);
   alter table maintenance_private.household_family_holds add constraint zero_hold_owner_fk foreign key(principal) references auth.users(id);
   alter table maintenance_private.household_family_holds add constraint zero_hold_root_fk foreign key(root_request_id) references private.kb_shared_deletion_journal(request_id);`);
  for(const n of ['ouchi-owner-only-consent.sql','family-attachment-journal.sql','family-attachment-quota.sql','family-attachment-activation.sql','family-attachment-completion.sql','shared-family-stage-store.sql','prelogout-dependencies-20261020/shared-maintenance-native-stage.sql','prelogout-dependencies-20261020/shared-prelogout-receipt-custody.sql','shared-maintenance-prelogout-custody.sql','ouchi-owner-after-logout-consent.sql','ouchi-owner-after-native-consent.sql'])await load(n);
  const stub="create function maintenance_private.allowed_family_attachment_activation(tbl text,before_value jsonb,after_value jsonb)\nreturns boolean language sql security invoker set search_path='' as $$ select false $$;",writers=readFileSync('tests/fixtures/handoff-controller-compatibility/private-writers.sql','utf8');assert.ok(writers.includes(stub));await admin.query(writers.replace(stub,''));
  for(const n of ['restricted-native-executor-20261021/shared-native-owner-profile.sql','shared-native-reviewed-cleanup-20261021/cleanup-owner-profile.sql','ouchi-owner-after-auth-consent.sql','ouchi-owner-terminal-consent.sql','bound-scoped-shared-consent.sql','post-native-seal-consent.sql','ouchi-requested-cancellation-state.sql','requested-preparation-provenance-20261021/legacy-delegate.sql','requested-preparation-provenance-20261021/protocol.sql','family-preparation-generations-20261021/protocol.sql','family-native-preparation-20261021/protocol.sql','generation-family-originals-20261021/protocol.sql','generation-family-handoff-20261021/protocol.sql'])await load(n);
  await admin.query('create role ouchi_retention_checker_backend login nosuperuser nobypassrls nocreatedb nocreaterole noreplication');await load('generation-retention-admission-20261021/protocol.sql');
  await admin.query('grant usage on schema private,maintenance_private to ouchi_shared_consent_backend,shared_retirement_backend;grant select,update on private.kb_shared_deletion_journal to shared_retirement_backend');
  coordinator=new pg.Client({host:socket,user:'shared_retirement_backend',database:'postgres'});issuer=new pg.Client({host:socket,user:'ouchi_shared_consent_backend',database:'postgres'});await coordinator.connect();await issuer.connect();
  await verifyGenerationSessionProfile({admin,coordinator,issuer,auth,transaction,socket,projectID});
 }finally{if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restore)restore();await admin.end();}
});
