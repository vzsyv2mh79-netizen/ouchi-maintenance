import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createClosureReviewCoverage} from '../lib/closure-review-coverage.mjs';
import {createReviewedRetirement} from '../lib/reviewed-retirement.mjs';
import {home,product,recipient,owner,os,oe} from './fixtures/home-handoff-identifiers.mjs';
async function fixture({files=false,asOwner=true}={}){
 const f=await householdCopyFixture();for(const n of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql'])await f.db.exec(readFileSync('supabase/migrations/'+n,'utf8'));
 // Synthetic fixture only. No Storage request or real file is removed.
 if(!files)await f.db.query('delete from maintenance_private.product_attachments where id=$1',[f.input.fileID]);
 if(asOwner){await f.db.query('update public.homes set owner_id=$1 where id=$2',[recipient,home]);await f.db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,owner,'Remaining family']);}
 await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true');
 const coverage=createClosureReviewCoverage({connect:f.connect}),reviewed=createReviewedRetirement({connect:f.connect}),scope={planID:randomUUID(),reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
 await coverage.capture({...scope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);
 const page=await coverage.page({...scope,afterKey:null},f.signal);assert.equal(page.hasMore,false);
 for(const row of page.items)if(row.kind==='text')await coverage.recordTextDecision({...scope,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
 const sealEventID=randomUUID();await coverage.seal({...scope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);
 const operation={...scope,eventID:randomUUID(),sealEventID},execute={...operation,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'};
 return {...f,coverage,reviewed,scope,operation,execute};
}
test('reviewed owner retirement preserves family records, detaches without waiting for a recipient and lets a remaining member claim later',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query('select to_jsonb(p) value from public.products p where id=$1',[product])).rows[0].value;
  const receipt=await f.reviewed.execute(f.execute,f.signal);assert.equal(receipt.state,'retirement_queued');assert.equal(receipt.detachedHomeCount,1);assert.equal(receipt.accountErasureConfirmed,false);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);assert.deepEqual((await f.db.query('select to_jsonb(p) value from public.products p where id=$1',[product])).rows[0].value,before);
  assert.equal((await f.db.query('select count(*)::int n from public.home_members where user_id=$1',[recipient])).rows[0].n,0);assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[recipient])).rows[0].enabled,false);
  assert.equal((await f.db.query('select state from maintenance_private.account_closure_reviews where review_request_id=$1',[f.scope.reviewRequestID])).rows[0].state,'retirement_queued');assert.equal((await f.db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[[recipient,owner]])).rows[0].n,2);
  await f.db.exec('update maintenance_private.ownerless_home_policy set enabled=true');const generation=(await f.db.query('select generation from maintenance_private.ownerless_home_generations where home_id=$1',[home])).rows[0].generation;
  await f.db.exec('set role service_role');await f.db.query('select maintenance_private.claim_ownerless_home($1,$2,$3,$4,$5,$6)',[randomUUID(),home,generation,owner,os,oe]);await f.db.exec('reset role');
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
 }finally{await f.db.close();}
});
test('member retirement removes only that membership and closes only that app enrollment',async()=>{
 const f=await fixture({asOwner:false});try{
  const receipt=await f.reviewed.execute(f.execute,f.signal);assert.equal(receipt.detachedHomeCount,0);assert.equal(receipt.departedMembershipCount,1);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[owner])).rows[0].enabled,true);
 }finally{await f.db.close();}
});
test('lost retirement COMMIT recovers the same queued job and never overwrites later family edits',async()=>{
 const f=await fixture();try{
  f.loseNextCommit();await assert.rejects(f.reviewed.execute(f.execute,f.signal),/commit acknowledgement lost/);const status=await f.reviewed.status(f.operation,f.signal);assert.equal(status.deletionRequestID,f.operation.eventID);
  await f.db.query('update public.products set memo=$1 where id=$2',['Later family edit',product]);await f.reviewed.execute(f.execute,f.signal);assert.equal((await f.db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'Later family edit');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,1);
  await assert.rejects(f.reviewed.execute({...f.execute,eventID:randomUUID()},f.signal),/Retirement event conflict/);
 }finally{await f.db.close();}
});
test('policy withdrawal, changed review and attachment-bearing retirement stop before changing owner/account/job',async()=>{
 for(const reason of ['disabled','changed','files']){
  const f=await fixture({files:reason==='files'});try{
   if(reason==='disabled')await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=false');
   if(reason==='changed')await f.db.query('update public.products set memo=$1 where id=$2',['Changed since review',product]);
   await assert.rejects(f.reviewed.execute(f.execute,f.signal),/unavailable|review changed|Attachment retirement/);
   assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[recipient])).rows[0].enabled,true);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
  }finally{await f.db.close();}
 }
});
test('an insert failure after detachment rolls back all home, membership and enrollment mutations',async()=>{
 const f=await fixture();try{
  await f.db.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[f.operation.eventID,owner,oe]);
  await assert.rejects(f.reviewed.execute(f.execute,f.signal),/duplicate key/);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);assert.equal((await f.db.query('select count(*)::int n from public.home_members where user_id=$1',[recipient])).rows[0].n,1);assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[recipient])).rows[0].enabled,true);
 }finally{await f.db.close();}
});
test('ordinary callers cannot execute retirement, forge queued state, or enable the dormant policy',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','service_role']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select maintenance_private.execute_reviewed_retirement($1,$2,$3,$4,$5,$6)',[f.operation.eventID,f.scope.planID,f.scope.reviewRequestID,f.scope.userID,f.scope.epochID,f.operation.sealEventID]),/permission denied/);await assert.rejects(f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=true'),/permission denied/);await f.db.exec('reset role');}
  await f.db.exec('set role service_role');await assert.rejects(f.db.query("update maintenance_private.account_closure_reviews set state='retirement_queued' where review_request_id=$1",[f.scope.reviewRequestID]),/Verified cancellation/);
 }finally{await f.db.close();}
});
test('review metadata cleanup requires exact live job and completed record erasure, preserves family records and never marks completion',async()=>{
 const f=await fixture();try{
  await f.reviewed.execute(f.execute,f.signal);const lease=randomUUID();await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[f.operation.eventID,lease]);
  const args=[f.operation.eventID,f.scope.userID,f.scope.epochID,lease];await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.erase_reviewed_retirement_metadata($1,$2,$3,$4) erased',args)).rows[0].erased,false);
  await f.db.exec('reset role');await f.db.query('update maintenance_private.account_deletion_requests set records_erased=true,inventory_captured=true where id=$1',[f.operation.eventID]);await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.erase_reviewed_retirement_metadata($1,$2,$3,$4) erased',[...args.slice(0,3),randomUUID()])).rows[0].erased,false);assert.equal((await f.db.query('select public.erase_reviewed_retirement_metadata($1,$2,$3,$4) erased',args)).rows[0].erased,true);await f.db.exec('reset role');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_coverage_plans where user_id=$1',[recipient])).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.reviewed_retirements')).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,1);assert.equal((await f.db.query('select state from maintenance_private.account_deletion_requests where id=$1',[f.operation.eventID])).rows[0].state,'running');
 }finally{await f.db.close();}
});

test('server notification-test claim cannot recreate identifying throttle metadata after app retirement',async()=>{
 const f=await fixture();try{
  const endpoint='https://web.push.apple.com/synthetic-retirement-fixture';await f.db.query('insert into public.maintenance_push_subscriptions(user_id,endpoint,p256dh,auth) values($1,$2,$3,$4)',[recipient,endpoint,'p'.repeat(87),'a'.repeat(22)]);
  await f.db.exec('set role service_role');assert.equal((await f.db.query('select * from public.claim_maintenance_push_test($1,$2)',[recipient,endpoint])).rows.length,1);await f.db.exec('reset role');
  await f.reviewed.execute(f.execute,f.signal);await f.db.query('delete from public.maintenance_push_test_limits where user_id=$1',[recipient]);await f.db.exec('set role service_role');await assert.rejects(f.db.query('select * from public.claim_maintenance_push_test($1,$2)',[recipient,endpoint]),/App account closed/);await f.db.exec('reset role');assert.equal((await f.db.query('select count(*)::int n from public.maintenance_push_test_limits where user_id=$1',[recipient])).rows[0].n,0);
 }finally{await f.db.close();}
});
