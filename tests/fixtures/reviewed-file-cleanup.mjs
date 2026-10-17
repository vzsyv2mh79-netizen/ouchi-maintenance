import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {householdCopyFixture} from './household-copy.mjs';
import {createClosureReviewCoverage} from '../../lib/closure-review-coverage.mjs';
import {createAccountContentReviewPorts} from '../../lib/closure-account-content-review.mjs';
import {createReviewedFileCleanup} from '../../lib/reviewed-file-cleanup.mjs';
import {createReviewedRetirement} from '../../lib/reviewed-retirement.mjs';
import {home,owner,recipient} from './home-handoff-identifiers.mjs';
export async function reviewedCleanupFixture({move=true,asOwner=false,enabled=true,beforeCoverage,databaseFactory,accountContentReview=false}={}){
 const f=await householdCopyFixture({databaseFactory});for(const n of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql','20261016174056_ouchi_retired_attachment_ids.sql','20261016174506_ouchi_reviewed_file_cleanup_observation.sql','20261016175505_ouchi_reviewed_file_finalization.sql','20261016180316_ouchi_reviewed_cleanup_prelude.sql','20261016181203_ouchi_deletion_tail_checkpoints.sql','20261016183107_ouchi_closure_submission_progress.sql','20261016191435_ouchi_closure_read_custody.sql'])await f.db.exec(readFileSync('supabase/migrations/'+n,'utf8'));
 if(asOwner){await f.db.query('update public.homes set owner_id=$1 where id=$2',[recipient,home]);await f.db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,owner,'Remaining family']);}
 if(beforeCoverage)await beforeCoverage(f);
 let manifest=null;if(move){manifest=await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);}else{
  const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID},row=(await f.reviewPort.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();
  await f.reviewPort.inspectFile({...scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await f.reviewPort.recordFileDecision({...scope,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'erase_personal_file',evidenceDigest:'a'.repeat(64),confirmation:'ERASE_REVIEWED_PERSONAL_FILE'},f.signal);
 }
 await f.db.query('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=$1',[enabled]);
 // Explicit current protocol opt-in. The caller must install its SQL and
 // replace any historical file decision in beforeCoverage; no fallback.
 const coverage=accountContentReview?createAccountContentReviewPorts({connect:f.connect}).coverage:createClosureReviewCoverage({connect:f.connect}),retire=createReviewedRetirement({connect:f.connect}),scope={planID:randomUUID(),reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
 await coverage.capture({...scope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);const page=await coverage.page({...scope,afterKey:null},f.signal);assert.equal(page.hasMore,false);for(const item of page.items)if(item.kind==='text')await coverage.recordTextDecision({...scope,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
 const sealEventID=randomUUID();await coverage.seal({...scope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);
 const execute={...scope,eventID:randomUUID(),sealEventID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},operation={...execute};delete operation.confirmation;
 return {...f,coverage,retire,scope,execute,operation,manifest};
}

export async function reviewedCleanupReadyFixture(options={}){
 const f=await reviewedCleanupFixture(options);await f.retire.execute(f.execute,f.signal);
 const leaseToken=randomUUID();await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[f.execute.eventID,leaseToken]);
 await f.db.exec('insert into maintenance_private.retirement_file_principals values(session_user,true)');
 const cleanupInput={requestID:f.execute.eventID,userID:f.scope.userID,epochID:f.scope.epochID,leaseToken,kind:'personal_file',fileID:f.input.fileID};
 const connect=async opts=>{const c=await f.connect(opts);return {...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql==='BEGIN')await f.db.exec('set local role ouchi_retirement_file_executor');return result;}};};
 let calls=0;const storage={cleanup:async m=>{calls++;if(m.retained)assert.equal(f.objects.has(m.retained.objectPath),true);f.objects.delete(m.source.objectPath);return {sourceAbsenceObserved:true,deleteAcknowledged:true,capacityReleaseAuthorized:false};}};
 const cleanupPort=createReviewedFileCleanup({connect,storage});
 return {...f,cleanupPort,cleanupInput,cleanupConnect:connect,cleanupStorage:storage,cleanupCalls:()=>calls};
}
