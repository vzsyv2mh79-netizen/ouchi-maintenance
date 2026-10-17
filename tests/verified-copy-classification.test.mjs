import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createClosureReviewCoverage} from '../lib/closure-review-coverage.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';
import {owner,os,oe} from './fixtures/home-handoff-identifiers.mjs';
const migration='supabase/migrations/20261016165756_ouchi_verified_copy_classification.sql';
async function fixture({copy='verified',upgrade=false}={}){
 const f=await householdCopyFixture();for(const n of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql'])await f.db.exec(readFileSync('supabase/migrations/'+n,'utf8'));
 if(!upgrade){await f.db.exec(readFileSync('supabase/migrations/20261016164313_ouchi_reviewed_retirement_boundary.sql','utf8'));await f.db.exec(readFileSync(migration,'utf8'));await f.db.exec(readFileSync('supabase/migrations/20261016171009_ouchi_attachment_retirement_inventory.sql','utf8'));}
 let manifest=null;if(copy!=='none'){manifest=await f.port.prepare(f.input,f.signal);if(copy==='unknown')f.loseNextWrite();if(copy!=='reserved'){if(copy==='unknown')await assert.rejects(f.port.copy(f.operation,f.signal),/remote write acknowledgement lost/);else await f.port.copy(f.operation,f.signal);}}
 const coverage=createClosureReviewCoverage({connect:f.connect}),scope={planID:randomUUID(),reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID},seal={...scope,eventID:randomUUID(),evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'};
 async function capture(s=scope,replacesPlanID=null){await coverage.capture({...s,replacesPlanID,confirmation:replacesPlanID===null?'CAPTURE_COMPLETE_SCOPED_REVIEW':'REPLACE_COMPLETE_SCOPED_REVIEW'},f.signal);const page=await coverage.page({...s,afterKey:null},f.signal);assert.equal(page.hasMore,false);for(const row of page.items)if(row.kind==='text')await coverage.recordTextDecision({...s,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);}
 return {...f,coverage,scope,seal,manifest,capture};
}
test('verified staged copy is classified by exact inspected source approval and durable ACK, without activation/removal or another subject judgment',async()=>{
 const f=await fixture();try{
  await f.capture();const sealed=await f.coverage.seal(f.seal,f.signal);assert.equal(sealed.current,true);assert.equal(sealed.unresolvedCount,0);assert.equal(sealed.mutationAuthorized,false);
  const bindings=(await f.db.query('select bindings from maintenance_private.closure_coverage_plans where plan_id=$1',[f.scope.planID])).rows[0].bindings,item=bindings.find(r=>r.kind==='household_file');assert.equal(item.preparedCopy.kind,'verified-prepared-copy/v1');assert.equal(item.preparedCopy.intentID,f.input.intentID);assert.equal(item.preparedCopy.sourceDecisionID,f.input.decisionID);assert.equal(item.decisionID,f.input.decisionID);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[f.input.destinationID])).rows[0].state,'staged');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_household_file_decisions')).rows[0].n,0);assert.equal(f.objects.has(f.sourcePath),true);assert.equal(f.calls.filter(c=>c==='write').length,1);
 }finally{await f.db.close();}
});
test('reserved or unknown writer cannot inherit source approval, even with matching destination bytes',async()=>{
 for(const copy of ['reserved','unknown']){const f=await fixture({copy});try{
  await f.capture();await assert.rejects(f.coverage.seal(f.seal,f.signal),/Complete current explicit review/);assert.equal((await f.coverage.status(f.scope,f.signal)).unresolvedCount>0,true);if(copy==='unknown')assert.equal(f.objects.has(f.manifest.destination.objectPath),true);assert.equal(f.objects.has(f.sourcePath),true);
 }finally{await f.db.close();}}
});
test('withdrawn budget, oversubscription or changed original accounting invalidates prepared-copy binding without changing file bytes',async()=>{
 for(const change of ['disabled','over-budget','original-claim']){const f=await fixture();try{
  await f.capture();await f.coverage.seal(f.seal,f.signal);
  // Oversubscription/missing claims require privileged corruption injection;
  // production guards themselves reject both changes before this extra fence.
  if(change==='disabled')await f.db.exec('update maintenance_private.attachment_app_budget_policy set enabled=false');
  if(change==='over-budget'){await assert.rejects(f.db.exec('update maintenance_private.attachment_app_budget_policy set budget_bytes=1'),/Held capacity exceeds/);await f.db.exec('alter table maintenance_private.attachment_app_budget_policy disable trigger attachment_budget_policy_guard;update maintenance_private.attachment_app_budget_policy set budget_bytes=1;alter table maintenance_private.attachment_app_budget_policy enable trigger attachment_budget_policy_guard');}
  if(change==='original-claim'){await assert.rejects(f.db.query('delete from maintenance_private.attachment_capacity_claims where object_path=$1',[f.sourcePath]),/immutable/);await f.db.exec('alter table maintenance_private.attachment_capacity_claims disable trigger attachment_capacity_claim_guard');await f.db.query('delete from maintenance_private.attachment_capacity_claims where object_path=$1',[f.sourcePath]);await f.db.exec('alter table maintenance_private.attachment_capacity_claims enable trigger attachment_capacity_claim_guard');}
  const status=await f.coverage.status(f.scope,f.signal);assert.equal(status.current,false);assert.equal(status.unresolvedCount>0,true);assert.equal(f.objects.has(f.sourcePath),true);
 }finally{await f.db.close();}}
});
test('new source review or source participant closure invalidates an older prepared-copy classification',async()=>{
 for(const change of ['decision','participant']){const f=await fixture();try{
  await f.capture();await f.coverage.seal(f.seal,f.signal);
  if(change==='participant')await f.db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
  else{const scope={reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID},row=(await f.reviewPort.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();await f.reviewPort.inspectFile({...scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await f.reviewPort.recordFileDecision({...scope,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'needs_review',evidenceDigest:'a'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'},f.signal);}
  assert.equal((await f.coverage.status(f.scope,f.signal)).current,false);assert.equal((await f.coverage.seal(f.seal,f.signal)).current,false);
 }finally{await f.db.close();}}
});
test('independent household needs-review decision is never overridden by inherited source approval',async()=>{
 const f=await fixture();try{
  await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
  const scope={reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID},review=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:async file=>f.objects.get(file.objectPath)}),row=(await review.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();
  await review.inspectFile({...scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await review.recordFileDecision({...scope,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'needs_review',evidenceDigest:'a'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'},f.signal);
  // Privileged inconsistent-state fixture: no shipping active->staged port.
  await f.db.query("update maintenance_private.household_attachments set state='staged' where id=$1",[f.input.destinationID]);await f.capture();await assert.rejects(f.coverage.seal(f.seal,f.signal),/Complete current explicit review/);
 }finally{await f.db.close();}
});
test('migration preserves earlier valid no-copy bindings and exposes no raw helper or write permission to client/service/operator roles',async()=>{
 const f=await fixture({copy:'none',upgrade:true});try{
  await f.capture();await f.coverage.seal(f.seal,f.signal);const before=(await f.db.query('select bindings from maintenance_private.closure_coverage_plans where plan_id=$1',[f.scope.planID])).rows[0].bindings;
  await f.db.exec(readFileSync(migration,'utf8'));assert.equal((await f.coverage.status(f.scope,f.signal)).current,true);assert.deepEqual((await f.db.query('select bindings from maintenance_private.closure_coverage_plans where plan_id=$1',[f.scope.planID])).rows[0].bindings,before);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select maintenance_private.prepared_household_copy_for_coverage($1,$2)',[f.scope.planID,f.input.destinationID]),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});

test('a different participant review cannot borrow an earlier prepared copy even after its own matching source inspection',async()=>{
 const f=await fixture();try{
  await f.db.exec('set role service_role');const reviewRequestID=(await f.db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[owner,os,oe,randomUUID()])).rows[0].receipt.reviewRequestID;await f.db.exec('reset role');
  const other={reviewRequestID,userID:owner,epochID:oe},row=(await f.reviewPort.fileInventory({...other,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();
  await f.reviewPort.inspectFile({...other,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await f.reviewPort.recordFileDecision({...other,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
  const scope={...other,planID:randomUUID()};await f.capture(scope);assert.equal((await f.db.query('select maintenance_private.prepared_household_copy_for_coverage($1,$2) receipt',[scope.planID,f.input.destinationID])).rows[0].receipt,null);
  await assert.rejects(f.coverage.seal({...scope,eventID:randomUUID(),evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal),/Complete current explicit review/);
 }finally{await f.db.close();}
});
