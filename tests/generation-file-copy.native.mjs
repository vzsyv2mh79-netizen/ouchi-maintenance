import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,rs,re,oe} from './fixtures/home-handoff-identifiers.mjs';
import {startFixtureStorage} from './fixtures/generation-file-copy-20261021/native-storage.mjs';
import {createDedicatedPostgresConnection} from '../lib/dedicated-postgres-connection.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {createGenerationFileCopy,generationFileScopeDigest,GENERATION_FILE_CALL_SQL} from '../lib/generation-file-copy.mjs';
import {createHouseholdCopyStorage} from '../lib/closure-storage-runtime.mjs';

test('planned generation copy namespace: official Storage bytes + old strict copy nonce/unknown writer boundary',async()=>{
 const socket=process.env.OUCHI_SCOPED_TEST_PG_SOCKET;assert.match(socket??'',/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 const admin=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await admin.connect();let storage;const originalFetch=globalThis.fetch;
 const db={query:(...args)=>admin.query(...args),exec:s=>admin.query(s),transaction:async work=>{await admin.query('begin');try{const v=await work(db);await admin.query('commit');return v;}catch(e){await admin.query('rollback');throw e;}},close:async()=>{}};
 try{
  await admin.query('create role postgres;create role ouchi_generation_file_backend login nosuperuser nobypassrls nocreatedb nocreaterole noreplication');
  await seedHomeHandoffFullSchemaFixture({completeCatalog:true,databaseFactory:async()=>db});await admin.query('reset role');
  await admin.query(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
  // Actual upgraded namespace exists. Legacy copy source refuses without the
  // exact new private context; no legacy gate is silently removed/adopted.
  for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql'])await admin.query(readFileSync('tests/fixtures/handoff-controller-compatibility/'+name,'utf8'));
  const pinnedNames=['public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)','maintenance_private.prepare_household_copy(uuid,uuid,uuid,uuid,uuid,uuid,uuid)','maintenance_private.lock_household_copy_intent(uuid,uuid,uuid,uuid)','maintenance_private.issue_household_copy_write(uuid,uuid,uuid,uuid,uuid,uuid)','maintenance_private.record_household_copy_write_fact(uuid,uuid,uuid,uuid,uuid,uuid,text)'];
  const canonical=(await admin.query('select oid::regprocedure::text f,prosrc from pg_proc where oid=any($1::regprocedure[]) order by 1',[pinnedNames])).rows;
  await admin.query(readFileSync('tests/fixtures/generation-file-copy-20261021/protocol.sql','utf8'));
  assert.deepEqual((await admin.query('select oid::regprocedure::text f,prosrc from pg_proc where oid=any($1::regprocedure[]) order by 1',[pinnedNames])).rows,canonical,'Canonical capture and old measured copy/writer bodies remain unchanged');
  await admin.query("update maintenance_private.account_closure_review_policy set enabled=true;update maintenance_private.attachment_app_budget_policy set enabled=true,writer_coverage_verified=true,budget_bytes=1048576;insert into maintenance_private.closure_operator_principals values('ouchi_generation_file_backend',true)");
  await admin.query('set role service_role');const review=(await admin.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,randomUUID()])).rows[0].receipt.reviewRequestID;await admin.query('reset role');
  const names=['closure_review_file_inventory','read_closure_review_file','record_closure_file_inspection','record_closure_account_content_file_decision','read_closure_file_decision'];
  const funcs=(await admin.query("select oid::regprocedure::text f from pg_proc where pronamespace='maintenance_private'::regnamespace and proname=any($1::text[])",[names])).rows;
  for(const f of funcs)await admin.query('grant execute on function '+f.f+' to ouchi_generation_file_backend');
  storage=await startFixtureStorage(socket);await admin.query('grant usage on schema storage to service_role;grant all on all tables in schema storage to service_role;grant usage,select on all sequences in schema storage to service_role');
  const service=createClient(storage.origin,storage.serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:storage.fetchSDK}}),bucket=service.storage.from('ouchi-product-attachments');assert.equal((await service.storage.createBucket('ouchi-product-attachments',{public:false})).error,null);
  const authBefore={users:(await admin.query('select * from auth.users order by id')).rows,sessions:(await admin.query('select * from auth.sessions order by id')).rows};
  const connect=createDedicatedPostgresConnection({createClient:bounds=>new pg.Client({...bounds,host:socket,user:'ouchi_generation_file_backend',database:'postgres'})});
  const bytes=Buffer.from('%PDF-1.7\nGeneration preparatory official Storage\n'),sha=createHash('sha256').update(bytes).digest('hex');
  const objects=new Map();
  const reviewPort=createAccountContentReviewPorts({connect,readFileBytes:async file=>{const b=objects.get(file.objectPath);assert.ok(b);return b;}}).personalFiles;
  let mode='normal',posts=0,admitted=true;const projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_generation_file';
  globalThis.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(url.origin!==`https://${projectID}.supabase.co`)return originalFetch(input,init);
   assert.ok(url.pathname.startsWith('/storage/v1/object/ouchi-product-attachments/'));assert.ok(['GET','POST'].includes(init.method));assert.equal(init.redirect,'error');
   const headers=new Headers(init.headers);assert.equal(headers.get('apikey'),secretKey);headers.set('authorization','Bearer '+storage.serviceKey);headers.set('apikey',storage.serviceKey);
   if(init.method==='POST'){posts++;assert.equal(headers.get('x-upsert'),'false');}
   const response=await originalFetch(storage.origin+url.pathname.slice('/storage/v1'.length),{...init,headers});
   if(init.method==='POST'&&mode==='withdraw'){assert.equal(response.ok,true);admitted=false;}
   if(init.method==='POST'&&mode==='lost'){assert.equal(response.ok,true);await response.arrayBuffer();throw Error('Synthetic transport lost actual committed Storage response');}
   return response;
  };
  async function file(user=recipient,epoch=re){const id=randomUUID(),path=`${user}/${epoch}/${id}.pdf`;await admin.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$6,$7,$7,true)",[id,user,epoch,product,bytes.length,owner,sha]);await admin.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$4,$5,'settled',clock_timestamp())",[id,randomUUID(),user,owner,epoch]);await admin.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),path,bytes.length,'upload']);assert.equal((await bucket.upload(path,bytes,{contentType:'application/pdf',upsert:false})).error,null);objects.set(path,new Blob([bytes],{type:'application/pdf'}));return {id,path};}
  const family=await file(owner,oe),familyBefore=(await admin.query('select * from maintenance_private.product_attachments where id=$1',[family.id])).rows;
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:recipient,leaseToken:randomUUID(),inventoryDigest:'7'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:re}]};const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,recipient,fixed]);const generationID=randomUUID(),nativeLease=randomUUID(),admission={domain:'OuchiMaintenance/generation-file-preparation-admission/v1',scopeDigest:generationFileScopeDigest(scope),generationID,nativeLease,reviewRequestID:review,confirmedUntil:new Date(Date.now()+300000).toISOString(),namespaceWriterDigest:'a'.repeat(64),reviewEvidenceDigest:'b'.repeat(64)};
  const port=createGenerationFileCopy({scope,generationID,nativeLease,reviewRequestID:review,connect,storage:createHouseholdCopyStorage({projectID,secretKey}),readAdmission:async()=>admitted?{...admission}:null});
  async function plan(){const source=await file(),signal=AbortSignal.timeout(15000),rScope={userID:recipient,epochID:re,reviewRequestID:review};const row=(await reviewPort.fileInventory({...rScope,afterFile:null},signal)).items.find(x=>x.attachment_id===source.id);assert.ok(row);const inspected=await reviewPort.inspectFile({...rScope,fileID:source.id,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()},signal),decisionID=randomUUID();await reviewPort.recordFileDecision({...rScope,fileID:source.id,inspectionID:inspected.inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'c'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},signal);return {source,input:{...rScope,intentID:randomUUID(),decisionID,fileID:source.id,destinationID:randomUUID()},signal};}
  const first=await plan();admitted=false;await assert.rejects(port.prepare(first.input,first.signal),/Independent finite/);admitted=true;
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_file_preparations')).rows[0].n,0,'Unapproved file policy cannot create preparation/capacity');
  await assert.rejects(admin.query('select maintenance_private.require_household_copy_source($1,$2,$3,$4,$5)',[first.input.decisionID,review,recipient,re,first.source.id]),/Shared retirement contract upgrade required/,'Old namespace refusal remains unchanged outside exact typed context');
  const prepared=await port.prepare(first.input,first.signal),operation={intentID:first.input.intentID,reviewRequestID:review,userID:recipient,epochID:re};assert.equal(prepared.state,'reserved');
  const preparationOriginal=(await admin.query('select * from maintenance_private.generation_file_preparations where generation_id=$1',[generationID])).rows;
  assert.equal((await port.copy(operation,first.signal)).state,'copy_verified');assert.equal(posts,1);
  assert.equal((await port.copy(operation,first.signal)).state,'copy_verified');assert.equal(posts,1,'Verified retry does not issue another POST');
  const lost=await plan(),lostManifest=await port.prepare(lost.input,lost.signal),lostOperation={...operation,intentID:lost.input.intentID};const heldCapacity=(await admin.query('select * from maintenance_private.attachment_capacity_claims where claim_id=$1',[lost.input.intentID])).rows;mode='lost';await assert.rejects(port.copy(lostOperation,lost.signal),/upload acknowledgement unconfirmed/);mode='normal';
  assert.equal((await port.status(lostOperation,lost.signal)).writerState,'issued');assert.equal((await port.copy(lostOperation,lost.signal)).state,'pending');assert.deepEqual((await admin.query('select * from maintenance_private.attachment_capacity_claims where claim_id=$1',[lost.input.intentID])).rows,heldCapacity,'Unknown physical copy retains exact reserved capacity');assert.equal(posts,2,'An unknown dispatched writer never repeats POST even when bytes exist');
  const withdrawn=await plan(),withdrawnManifest=await port.prepare(withdrawn.input,withdrawn.signal),withdrawnOperation={...operation,intentID:withdrawn.input.intentID};mode='withdraw';await assert.rejects(port.copy(withdrawnOperation,withdrawn.signal),/Independent finite/);mode='normal';
  assert.equal((await port.status(withdrawnOperation,withdrawn.signal)).writerState,'acknowledged','Observed server ACK may be recorded factually after policy withdrawal, without new I/O authority');admitted=true;assert.equal((await port.copy(withdrawnOperation,withdrawn.signal)).state,'copy_verified');assert.equal(posts,3,'Known acknowledged copy resumes inspection without another POST');
  for(const [source,destination] of [[first.source,prepared.destination],[lost.source,lostManifest.destination],[withdrawn.source,withdrawnManifest.destination]]){const s=await bucket.download(source.path),d=await bucket.download(destination.objectPath);assert.equal(s.error,null);assert.equal(d.error,null);assert.deepEqual(Buffer.from(await s.data.arrayBuffer()),bytes);assert.deepEqual(Buffer.from(await d.data.arrayBuffer()),bytes);}
  assert.deepEqual((await admin.query('select * from maintenance_private.product_attachments where id=$1',[family.id])).rows,familyBefore);assert.deepEqual(Buffer.from(await (await bucket.download(family.path)).data.arrayBuffer()),bytes);
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_requests where user_id=$1',[recipient])).rows[0].n,0);
  await assert.rejects(admin.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '1 minute' where request_id=$1",[scope.requestID,scope.leaseToken]),/not integrated with root transition/);
  const raw=new pg.Client({host:socket,user:'ouchi_generation_file_backend',database:'postgres'});await raw.connect();try{
   await assert.rejects(raw.query('select * from maintenance_private.generation_file_preparations'),/permission denied/);
   await assert.rejects(raw.query('select maintenance_private.prepare_household_copy($1,$2,$3,$4,$5,$6,$7)',Object.values(first.input)),/permission denied/);
   await assert.rejects(raw.query(GENERATION_FILE_CALL_SQL,[generationID,scope,nativeLease,operation,'cleanup',[]]),/Exact requested generation file root/,'No cleanup/activation action is admitted');
  }finally{await raw.end();}
  assert.deepEqual((await admin.query('select * from maintenance_private.generation_file_preparations where generation_id=$1',[generationID])).rows,preparationOriginal,'Retry and subsequent per-file bindings never rewrite the planned generation original');
  assert.deepEqual({users:(await admin.query('select * from auth.users order by id')).rows,sessions:(await admin.query('select * from auth.sessions order by id')).rows},authBefore,'Synthetic Auth identities and sessions stay exact');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_file_copy_contexts')).rows[0].n,0);
  assert.equal((await port.status(operation,AbortSignal.timeout(5000))).activationConfirmed,false);assert.equal((await port.status(operation,AbortSignal.timeout(5000))).sourceEraseConfirmed,false);
  console.log('Generation file preparatory namespace: full pinned135 schema + fixed official Storage filesystem/PG metadata; actual account-content reviewed scoped file + immutable planned generation/root/review binding + measured create-only copy/quota/nonce journal. Lost real POST response remains issued/pending without another POST; source, copied bytes, family file/metadata/Auth/home preserved. Unapproved admission creates no binding; raw private/old RPC/cleanup/root-advance refused. NO activated file-capable native generation, family handoff, source erasure, cancellation, capacity release or hosted/retention/writer approval. TLS/key gateway and independent policy/evidence are synthetic.');
 }finally{globalThis.fetch=originalFetch;if(storage)await storage.stop();await admin.end();}
});
