import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import ts from 'typescript';
import {completionSetup} from './fixtures/post-seal-family-setup.mjs';
import {owner,recipient,home,oe,os,rs} from './fixtures/home-handoff-identifiers.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {boundScopedModule} from './fixtures/scoped-shared-consent-module.mjs';
import {deletionStages} from '../lib/shared-deletion-protocol.mjs';

const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const domain='OuchiMaintenance/scoped-shared-consent-auth/v1';
const source=readFileSync('lib/post-native-seal-consent.ts','utf8').replace("import {SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';",`const SCOPED_SHARED_CONSENT_DOMAIN=${JSON.stringify(domain)};`);
const {createPostNativeSealConsent}=await import(compile(source));

test('post-seal archive uses all 135 migrations, real family completion SQL and actual native completion seal',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;
 assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();
 let coordinator,c;
 const db={query:(...a)=>admin.query(...a),exec:sql=>admin.query(sql),close:async()=>{},transaction:async work=>{
  await admin.query('begin');try{const value=await work(db);await admin.query('commit');return value;}catch(e){await admin.query('rollback');throw e;}
 }};
 try{
  await admin.query('create role postgres;create role shared_retirement_backend login nosuperuser nobypassrls');
  c=await completionSetup({schemaOptions:{completeCatalog:true,databaseFactory:async()=>db},beforeFreeze:async(db,id)=>{
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
  // These original signed records are synthetic issuance fixtures. Existing
  // independent GoTrue tests prove issuance separately; never claim real MFA here.
  const key=randomBytes(32),originals=[];
  const h=(await admin.query('select * from maintenance_private.household_handoff_plans where home_id=$1',[home])).rows[0];
  for(const [actor,session] of [[owner,os],[recipient,rs]]){
   const at=Date.now()-1200000;
   const payload={requestID:s.requestID,homeID:home,userID:actor,sessionID:session,aal:'aal2',authenticatedAt:at,authStateDigest:'a'.repeat(64),proofDomain:domain,expiresAt:at+600000};
   const signature=createHmac('sha256',key).update('OuchiMaintenance/original-scoped-consent/v1\n'+JSON.stringify(payload)).digest('hex');
   await admin.query('insert into maintenance_private.scoped_consent_bindings values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp())',[s.requestID,home,actor,session,at,payload.authStateDigest,domain,payload,signature,payload.expiresAt,h.scope,h.plan]);
   originals.push({payload,signature});
  }
  await admin.query('grant usage on schema maintenance_private to shared_retirement_backend;grant execute on function maintenance_private.read_post_native_seal_consent(uuid,uuid,uuid,uuid,uuid,uuid,uuid),maintenance_private.read_scoped_consent(uuid,uuid,uuid,uuid,uuid) to shared_retirement_backend');
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
  await admin.query('delete from auth.refresh_tokens where session_id in(select id from auth.sessions where user_id=$1)',[owner]);
  await admin.query('delete from auth.sessions where user_id=$1',[owner]);
  await admin.query('delete from auth.users where id=$1',[owner]);
  assert.deepEqual(await transaction(tx=>port.read(owner,tx)),{kind:'post-native-seal-historical-consent-only',...originals[0]});
  // Fixture owner records synthetic cross-app/Auth checks only AFTER the
  // synthetic owner Auth row is absent. This proves SQL stage binding, not
  // actual GoTrue logout/Admin API nor current remote Storage byte custody.
  await admin.query("update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1",[s.requestID,Object.fromEntries(deletionStages(s).filter(k=>!['complete','handoff-family'].includes(k)).map(k=>[k,receipt(k)]))]);
  const beforeRelease=(await admin.query('select receipts from private.kb_shared_deletion_journal where request_id=$1',[s.requestID])).rows[0].receipts;
  const grammar=async receipts=>(await admin.query('select maintenance_private.post_native_root_prerequisites($1,$2) ok',[fixed,receipts])).rows[0].ok;
  assert.equal(await grammar(beforeRelease),true);
  assert.equal(await grammar({...beforeRelease,prepare:{...beforeRelease.prepare,durable:'true'}}),false,'A string is not durable boolean evidence');
  assert.equal(await grammar({...beforeRelease,prepare:{...beforeRelease.prepare,familyCoverageDigest:coverage}}),false,'Family extension is forbidden on other stages');
  const plainFamily={...beforeRelease['handoff-family']};delete plainFamily.familyCoverageDigest;
  assert.equal(await grammar({...beforeRelease,'handoff-family':plainFamily}),false,'Plain family receipt cannot replace required extended checkpoint');
  assert.equal(await grammar({...beforeRelease,'handoff-family':{...beforeRelease['handoff-family'],familyCoverageDigest:'not-a-digest'}}),false);
  await assert.rejects(admin.query("update private.kb_shared_deletion_journal set receipts=jsonb_set(receipts,'{handoff-family,familyCoverageDigest}',to_jsonb($2::text)) where request_id=$1",[s.requestID,'c'.repeat(64)]),/Immutable controller family receipt/,'A plausible forged digest still cannot replace the actual immutable checkpoint');
  await admin.query('grant execute on function maintenance_private.release_post_native_family_holds(uuid,uuid,uuid,uuid,uuid) to shared_retirement_backend;grant usage on schema private to shared_retirement_backend;');
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
  await assert.rejects(transaction(async tx=>{
   assert.ok(await port.read(owner,tx));
   assert.equal((await release(tx)).rows[0].value,true);
   assert.equal((await tx.query('select maintenance_private.post_seal_fixture_complete_root($1,$2) value',[s.requestID,{...receipt('complete'),inventoryDigest:'b'.repeat(64)}])).rows[0].value,true);
   assert.equal(await port.readSnapshot(owner,tx),null,'Wrong global completion receipt refuses historical authority');
  }),/Current transaction verification/);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.post_native_family_releases')).rows[0].n,0,'Wrong COMPLETE rolls release receipt back');
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
  await admin.query("update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second' where user_id=$1",[owner]);
  assert.ok(await transaction(tx=>port.read(owner,tx)),'Sealed global authority does not revive or require an active worker lease');
  // Simulate loss of immutable evidence only in this disposable fixture, after
  // all successful stage tests. Historical reads must fail closed. No mutation
  // bypass or altered guard is shipped with the reader.
  await admin.query('alter table maintenance_private.family_attachment_completion_receipts disable trigger user');
  await admin.query('delete from maintenance_private.family_attachment_completion_receipts where request_id=$1',[s.requestID]);
  await admin.query('alter table maintenance_private.family_attachment_completion_receipts enable trigger user');
  assert.equal(await transaction(tx=>port.read(owner,tx)),null,'Missing actual family/Storage receipt is not replaced by root COMPLETE');
  console.log('Canonical 135-source native seal and app-registration erasure; original expired proof retained after synthetic Auth removal; immutable family/attachment SQL receipts; no real Auth or physical Storage claim');
 }finally{if(coordinator)await coordinator.end();await admin.end();}
});
