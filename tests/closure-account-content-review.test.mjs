import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createClosureReviewCoverage} from '../lib/closure-review-coverage.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {createReviewedRetirement} from '../lib/reviewed-retirement.mjs';
import {home,product,owner,recipient} from './fixtures/home-handoff-identifiers.mjs';
const migration='supabase/migrations/20261017025017_ouchi_account_content_retention_review.sql';
const textConfirmation='RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION';
const fileConfirmation='RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION';
const householdConfirmation='RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION';
// Opt-in loopback PostgreSQL with synthetic Auth shape, not GoTrue or TLS.
// The external runner owns a fresh disposable container for each selected case.
const databaseFactory=process.env.OUCHI_ACCOUNT_CONTENT_SQL_TEST==='true'?async()=>{
 const port=Number(process.env.OUCHI_TEST_DB_PORT);assert.ok(Number.isInteger(port)&&port>1024&&port<65536);
 const client=new Client({host:'127.0.0.1',port,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:10000});
 await client.connect();
 const version=(await client.query('show server_version')).rows[0].server_version;assert.match(version,/^17\.6(?:\D|$)/);
 return {query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),close:()=>client.end()};
}:undefined;
async function fixture(){
 const f=await householdCopyFixture({databaseFactory});
 for(const n of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql'])await f.db.exec(readFileSync('supabase/migrations/'+n,'utf8'));
 const readFileBytes=async file=>f.objects.get(file.objectPath);
 const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
 const ports=createAccountContentReviewPorts({connect:f.connect,readFileBytes});
 const coverage=createClosureReviewCoverage({connect:f.connect});
 return {...f,scope,ports,coverage,readFileBytes,upgrade:()=>f.db.exec(readFileSync(migration,'utf8'))};
}
async function captureAndReview(f,coverage,planID=randomUUID(),replacesPlanID=null){
 const scope={...f.scope,planID};
 await coverage.capture({...scope,replacesPlanID,confirmation:replacesPlanID?'REPLACE_COMPLETE_SCOPED_REVIEW':'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);
 let afterKey=null;
 do{
  const page=await coverage.page({...scope,afterKey},f.signal);
  for(const row of page.items)if(row.kind==='text')await coverage.recordTextDecision({...scope,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:textConfirmation},f.signal);
  afterKey=page.nextCursor;
 }while(afterKey);
 const sealEventID=randomUUID();
 await coverage.seal({...scope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);
 return {...scope,sealEventID};
}
test('upgrade invalidates historical sealed retention and prepared copies without promoting old decisions or erasing family data',async()=>{
 const f=await fixture();try{
  await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);
  const sealed=await captureAndReview(f,f.coverage);
  const before=(await f.db.query('select to_jsonb(p) value from public.products p where id=$1',[product])).rows[0].value;
  await f.upgrade();
  const status=await f.ports.coverage.status({planID:sealed.planID,...f.scope},f.signal);
  assert.equal(status.current,false);assert.ok(status.unresolvedCount>0);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_file_decisions where account_content_reviewed')).rows[0].n,0);
  const old=(await f.db.query('select inspection_id from maintenance_private.closure_file_decisions where decision_id=$1',[f.input.decisionID])).rows[0];
  await assert.rejects(f.ports.personalFiles.recordFileDecision({...f.scope,fileID:f.input.fileID,inspectionID:old.inspection_id,decisionID:f.input.decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:fileConfirmation},f.signal),/Fresh account-content review decision required/);
  await assert.rejects(f.port.prepare(f.input,f.signal),/Latest current retention decision required/);
  await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=true');
  await assert.rejects(createReviewedRetirement({connect:f.connect}).execute({...sealed,eventID:randomUUID(),confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},f.signal),/Sealed review changed/);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
  assert.deepEqual((await f.db.query('select to_jsonb(p) value from public.products p where id=$1',[product])).rows[0].value,before);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[f.input.destinationID])).rows[0].state,'staged');
  assert.equal(f.objects.has(f.sourcePath),true);
 }finally{await f.db.close();}
});
test('new scoped manual evidence survives lost commit, binds a verified copy and permits checked retirement while preserving family and Auth',async()=>{
 const f=await fixture();try{
  await f.upgrade();
  const row=(await f.ports.personalFiles.fileInventory({...f.scope,afterFile:null},f.signal)).items.find(x=>x.attachment_id===f.input.fileID);
  const inspection=await f.ports.personalFiles.inspectFile({...f.scope,fileID:f.input.fileID,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()},f.signal);
  const decision={...f.scope,fileID:f.input.fileID,inspectionID:inspection.inspectionID,decisionID:randomUUID(),action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:fileConfirmation};
  f.loseNextCommit();await assert.rejects(f.ports.personalFiles.recordFileDecision(decision,f.signal),/commit acknowledgement lost/);
  const receipt=await f.ports.personalFiles.recordFileDecision(decision,f.signal);assert.equal(receipt.accountErasureConfirmed,false);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_file_decisions where decision_id=$1 and account_content_reviewed',[decision.decisionID])).rows[0].n,1);
  await f.port.prepare({...f.input,decisionID:decision.decisionID},f.signal);await f.port.copy(f.operation,f.signal);
  const sealed=await captureAndReview(f,f.ports.coverage);
  const bindings=(await f.db.query('select bindings from maintenance_private.closure_coverage_plans where plan_id=$1',[sealed.planID])).rows[0].bindings;
  assert.ok(bindings.every(x=>x.accountContentReviewVersion===1));
  assert.equal(bindings.find(x=>x.kind==='household_file').preparedCopy.sourceDecisionID,decision.decisionID);
  await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=true');
  const queued=await createReviewedRetirement({connect:f.connect}).execute({...sealed,eventID:randomUUID(),confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},f.signal);
  assert.equal(queued.state,'retirement_queued');assert.equal(queued.accountErasureConfirmed,false);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in ($1,$2)',[owner,recipient])).rows[0].n,2);
  assert.equal(f.objects.has(f.sourcePath),true,'this classification test does not remove the source');
 }finally{await f.db.close();}
});
test('household retention needs fresh manual evidence; old SQL and direct flag writes remain unavailable to operator and client roles',async()=>{
 const f=await fixture();try{
  await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);
  await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
  const legacy=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:f.readFileBytes});
  const row=(await legacy.fileInventory({...f.scope,afterFile:null},f.signal)).items.find(x=>x.attachment_id===f.input.destinationID);
  const inspected=await legacy.inspectFile({...f.scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()},f.signal);
  const decision={...f.scope,fileID:row.attachment_id,inspectionID:inspected.inspectionID,decisionID:randomUUID(),action:'retain_household_file',evidenceDigest:'a'.repeat(64),confirmation:householdConfirmation};
  await legacy.recordFileDecision(decision,f.signal);await f.upgrade();
  const read={...f.scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest};
  assert.equal((await f.ports.householdFiles.readFileDecision(read,f.signal)).current,false);
  await assert.rejects(f.ports.householdFiles.recordFileDecision(decision,f.signal),/Fresh account-content review decision required/);
  await assert.rejects(legacy.recordFileDecision({...decision,decisionID:randomUUID()},f.signal),/permission denied/);
  const fresh={...decision,decisionID:randomUUID()};await f.ports.householdFiles.recordFileDecision(fresh,f.signal);
  assert.equal((await f.ports.householdFiles.readFileDecision(read,f.signal)).current,true);
  const countBefore=(await f.db.query('select count(*)::int n from maintenance_private.closure_household_file_decisions')).rows[0].n;
  const directSQL='select maintenance_private.record_closure_account_content_household_file_decision($1,$2,$3,$4,$5,$6,$7,$8,$9)';
  const directArgs=[randomUUID(),fresh.inspectionID,fresh.reviewRequestID,fresh.userID,fresh.epochID,fresh.fileID,fresh.action,fresh.evidenceDigest,householdConfirmation];
  await f.db.exec('set role ouchi_closure_operator');
  await assert.rejects(f.db.query(directSQL,[...directArgs.slice(0,8),'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION']),/Explicit account-content decision confirmation required/);
  const foreignArgs=[...directArgs];foreignArgs[3]=owner;
  await assert.rejects(f.db.query(directSQL,foreignArgs),/Current matching review required/);
  await f.db.exec('reset role');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_household_file_decisions')).rows[0].n,countBefore);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){
   await f.db.exec('set role '+role);
   await assert.rejects(f.db.query('update maintenance_private.closure_household_file_decisions set account_content_reviewed=true where decision_id=$1',[decision.decisionID]),/permission denied/);
   await f.db.exec('reset role');
  }
  const privileges=(await f.db.query("select p.proname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service,has_function_privilege('ouchi_closure_operator',p.oid,'execute') operator from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='maintenance_private' and p.proname in ('record_closure_account_content_text_decision','record_closure_account_content_file_decision','record_closure_account_content_household_file_decision')")).rows;
  assert.equal(privileges.length,3);for(const p of privileges){assert.equal(p.anon,false);assert.equal(p.authenticated,false);assert.equal(p.service,false);assert.equal(p.operator,true);}
 }finally{await f.db.close();}
});
