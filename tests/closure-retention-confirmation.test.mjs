import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClosureReviewCoverage} from '../lib/closure-review-coverage.mjs';
import {createClosureOperatorReview} from '../lib/closure-operator-review.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';

test('personal-information-only acknowledgements cannot authorize the prepared retention adapters',async t=>{
 let connections=0;
 const connect=async()=>{connections++;throw Error('Must refuse before database access');};
 const signal=AbortSignal.timeout(10000);
 const scope={reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID()};
 const file={...scope,fileID:randomUUID(),inspectionID:randomUUID(),decisionID:randomUUID(),evidenceDigest:'a'.repeat(64)};
 await t.test('text',async()=>{
  await assert.rejects(createClosureReviewCoverage({connect}).recordTextDecision({...scope,planID:randomUUID(),eventID:randomUUID(),itemKey:'text:products:'+randomUUID()+':memo',action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal),/Explicit coverage text decision required/);
 });
 await t.test('personal source file',async()=>{
  await assert.rejects(createClosureOperatorReview({connect}).recordFileDecision({...file,action:'retain_family_copy',confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal),/Explicit file decision required/);
 });
 await t.test('household file',async()=>{
  await assert.rejects(createClosureHouseholdFileReview({connect}).recordFileDecision({...file,action:'retain_household_file',confirmation:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal),/Explicit file decision required/);
 });
 assert.equal(connections,0);
 // This proves only explicit acknowledgement validation. Authorship discovery,
 // the operator's actual judgement, and SQL approval are independent requirements.
});
