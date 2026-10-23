import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import pg from 'pg';
import {startFixtureGoTrue,fixtureTOTP} from './fixtures/scoped-native-gotrue.mjs';
import {owner,recipient,other,home,oe,bindRealAuthSessions} from './fixtures/home-handoff-identifiers.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {createSharedMaintenancePrelogoutCustody,PRELOGOUT_CAPTURE_SQL} from '../lib/shared-maintenance-prelogout-custody.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

test('restricted non-deleting prelogout API pins exact sessions and rechecks actual SQL at owning COMMIT',async()=>{
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
  await admin.query('create role postgres;create role ouchi_prelogout_custody_backend login nosuperuser nobypassrls;create role shared_retirement_backend login nosuperuser nobypassrls;create schema auth');
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
  const sourceDir=process.env.OUCHI_PRELOGOUT_SOURCE_DIR;assert.ok(sourceDir,'Explicit frozen stage dependency directory required');
  for(const [file,hash] of Object.entries({'shared-maintenance-native-stage.sql':'add3566915735db4f34907fb1b5021d366ffb7869f33a69f42c9ad010e17836a','shared-prelogout-receipt-custody.sql':'6d93514eec1e6971886c6f891f394d1636dccbc478682b156c51b043568b1e6d'}))assert.equal(createHash('sha256').update(readFileSync(join(sourceDir,file))).digest('hex'),hash);
  await seedHomeHandoffFullSchemaFixture({realAuth:true,completeCatalog:true,databaseFactory:async()=>db});await admin.query('reset role');
  await admin.query('delete from public.home_members where "homeId"=$1',[home]);
  const native={requestID:randomUUID(),userID:owner,epochID:oe,leaseToken:randomUUID()};
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'c'.repeat(64),apps:[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()},{app:'ouchi-maintenance',requestID:native.requestID,scopeID:oe}]};
  const {leaseToken:_,...fixed}=scope;void _;
  // Real primary password/TOTP sessions; the bystander's session is never copied.
  assert.equal((await auth.request('/user',undefined,actors.get(owner).token)).id,owner);
  for(const file of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await admin.query(readFileSync('tests/fixtures/handoff-controller-compatibility/'+file,'utf8'));
  for(const name of ['journal','quota','activation','inventory-consent','completion'])await admin.query(readFileSync('tests/fixtures/family-attachment-'+name+'.sql','utf8'));
  await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
  await admin.query(readFileSync('tests/fixtures/shared-family-stage-store.sql','utf8'));
  await admin.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1,true)",[native.requestID,owner,oe,native.leaseToken]);
  await admin.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);await admin.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
  const objectID=randomUUID();await admin.query("insert into maintenance_private.account_deletion_objects values($1,$2,$3,$4,'ouchi-product-attachments',$5,false)",[native.requestID,objectID,owner,oe,owner+'/'+oe+'/'+objectID+'.png']);
  await admin.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[owner,randomUUID(),randomUUID()]);
  const receipt=stage=>({...fixed,stage,durable:true});
  await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'processing',$4,clock_timestamp()+interval '5 minutes',$5)",[scope.requestID,owner,fixed,scope.leaseToken,{prepare:receipt('prepare'),'verify-family-before':receipt('verify-family-before')}]);
  await admin.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,scope,native.leaseToken]);
  await admin.query('select maintenance_private.freeze_household_scope($1,$2)',[scope,native.leaseToken]);
  const family=createSharedFamilyStageStore({loadValidatedTargets:async()=>[],verifyReadAuthority:async()=>true});
  await transaction(admin,tx=>family.record(tx,scope,sharedFamilyCoverageDigest([],scope),tx.signal));
  for(const file of ['shared-maintenance-native-stage.sql','shared-prelogout-receipt-custody.sql'])await admin.query(readFileSync(join(sourceDir,file),'utf8'));
  await admin.query(readFileSync('tests/fixtures/shared-maintenance-prelogout-custody.sql','utf8'));
  await admin.query(`grant usage on schema maintenance_private to ouchi_prelogout_custody_backend;
   grant execute on function maintenance_private.ouchi_prelogout_frame(jsonb,uuid,boolean),maintenance_private.ouchi_capture_prelogout_custody(jsonb,uuid) to ouchi_prelogout_custody_backend;
   create function maintenance_private.prelogout_fixture_current_gates(uid uuid,sid uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.user_id=uid and s.id=sid and u.deleted_at is null and(s.not_after is null or s.not_after>clock_timestamp()))$$;
   revoke all on function maintenance_private.prelogout_fixture_current_gates(uuid,uuid) from public;
   grant execute on function maintenance_private.prelogout_fixture_current_gates(uuid,uuid) to ouchi_prelogout_custody_backend;`);
  issuer=new pg.Client({host:socket,user:'ouchi_prelogout_custody_backend',database:'postgres'});await issuer.connect();
  let live=true,calls=0,captures=0;
  const gates=async tx=>{calls++;return live&&(await tx.query('select maintenance_private.prelogout_fixture_current_gates($1,$2) ok',[owner,actors.get(owner).sessionID])).rows[0].ok===true;};
  const api=createSharedMaintenancePrelogoutCustody({verifyCurrentGates:gates});
  const canary=async()=>{
   const queries=[['public.products','true'],['public.maintenance_history','true'],['maintenance_private.account_closure_reviews','true'],['maintenance_private.account_deletion_objects','true'],['auth.sessions','true'],['auth.users','true']];
   const result={};for(const [table,where] of queries)result[table]=(await admin.query(`select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text,'UTF8')),'hex') digest from ${table} t where ${where}`)).rows[0].digest;
   result.request=(await admin.query("select to_jsonb(n)-'receipt_sessions_captured' value from maintenance_private.account_deletion_requests n where id=$1",[native.requestID])).rows[0].value;return result;
  };
  const before=await canary();
  await assert.rejects(transaction(issuer,async tx=>{tx.beforeCommit('late-gate-loss',async()=>{live=false;return true;});await api.capture(tx,scope,native);}),/Current transaction verification/);live=true;
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.shared_prelogout_receipt_custody')).rows[0].n,0,'Late refusal rolls the exact manifest back');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.deletion_receipt_sessions')).rows[0].n,0);
  await assert.rejects(transaction(issuer,tx=>api.capture(tx,{...scope,leaseToken:randomUUID()},native)),/frame refused/);
  assert.deepEqual(await canary(),before);
  // Deterministic actual lock-order proof: hold only native, let the API
  // wait there, then an independent root reclaimer must already be blocked.
  coordinator=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await coordinator.connect();
  const issuerPID=(await issuer.query('select pg_backend_pid() pid')).rows[0].pid,adminPID=(await admin.query('select pg_backend_pid() pid')).rows[0].pid;
  await admin.query('begin');await admin.query('select id from maintenance_private.account_deletion_requests where id=$1 for update',[native.requestID]);
  const callsBefore=calls;const pending=transaction(issuer,tx=>api.capture(tx,scope,native));pending.catch(()=>{});
  let blocked=false;
  for(let i=0;i<100;i++){
   blocked=(await admin.query('select $2::int=any(pg_blocking_pids($1::int)) yes',[issuerPID,adminPID])).rows[0].yes;
   if(blocked)break;await new Promise(resolve=>setTimeout(resolve,5));
  }
  try{assert.equal(blocked,true,'API reached native row held by fixture');assert.equal(calls,callsBefore,'No gate callback ran before root/native pin');
   await coordinator.query('begin');await coordinator.query("set local lock_timeout='150ms'");
   await assert.rejects(coordinator.query('select request_id from private.kb_shared_deletion_journal where request_id=$1 for update',[scope.requestID]),/lock timeout/,'Root is already locked while API waits for native');await coordinator.query('rollback');
  }finally{await admin.query('commit');}
  assert.equal(await pending,true);
  await transaction(issuer,async tx=>{
   const pinned={signal:tx.signal,beforeCommit:tx.beforeCommit,query:async(sql,args)=>{if(sql===PRELOGOUT_CAPTURE_SQL)captures++;return tx.query(sql,args);}};
   assert.equal(await api.capture(pinned,scope,native),true);assert.equal(await api.capture(pinned,scope,native),true);assert.equal(await api.verify(pinned,scope,native),true);
  });assert.equal(captures,1,'Repeated capture does not replace hooks or issue another stage');assert.ok(calls>=5);
  assert.deepEqual(await canary(),before,'No records, closure metadata, objects, identities or sessions erased');
  const snapshot=(await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody')).rows[0];
  assert.deepEqual(snapshot.session_ids,[actors.get(owner).sessionID]);
  assert.equal((await admin.query('select absence_confirmed from maintenance_private.account_deletion_objects where request_id=$1',[native.requestID])).rows[0].absence_confirmed,false);
  await transaction(issuer,tx=>api.capture(tx,scope,native));assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody')).rows[0],snapshot,'Replay preserves exact original');
  await assert.rejects(issuer.query('select * from auth.sessions'),/permission denied/);
  await assert.rejects(issuer.query('select * from maintenance_private.shared_prelogout_receipt_custody'),/permission denied/);
  await assert.rejects(issuer.query('select maintenance_private.run_shared_native_stage($1,$2,$3)',[scope,native.leaseToken,'eraseRecords']),/permission denied/);
  await assert.rejects(issuer.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4)',[native.requestID,owner,oe,native.leaseToken]),/permission denied/);
  assert.equal((await admin.query('select public.capture_maintenance_deletion_receipt_sessions($1,$2,$3,$4) ok',[native.requestID,owner,oe,native.leaseToken])).rows[0].ok,false,'Canonical capture retains its erasure prerequisite');
  // Explicit disposable corruption only: bypass fixture triggers to create a
  // partial persisted set, restore them, then prove the API cannot relabel it.
  await admin.query('alter table maintenance_private.deletion_receipt_sessions disable trigger user');
  await admin.query('delete from maintenance_private.deletion_receipt_sessions where request_id=$1',[native.requestID]);
  await admin.query('alter table maintenance_private.deletion_receipt_sessions enable trigger user');
  await assert.rejects(transaction(issuer,tx=>api.capture(tx,scope,native)),/frame refused/);
  assert.deepEqual((await admin.query('select * from maintenance_private.shared_prelogout_receipt_custody')).rows[0],snapshot);
  console.log('Restricted LOGIN fixed capture API: actual GoTrue session, exact immutable manifest, root-first checked tx, late current-gate rollback, no deletion, partial replay refusal; global inventory/writer coverage and Storage are explicit fixtures');
 }finally{if(issuer)await issuer.end();if(coordinator)await coordinator.end();if(auth)await auth.stop();if(restoreSessions)restoreSessions();await admin.end();}
});
