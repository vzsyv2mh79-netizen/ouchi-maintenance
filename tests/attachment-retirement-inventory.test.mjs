import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createClosureReviewCoverage} from '../lib/closure-review-coverage.mjs';
import {createReviewedRetirement} from '../lib/reviewed-retirement.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';
import {home,product,owner,os,oe,recipient} from './fixtures/home-handoff-identifiers.mjs';
async function fixture({move=true,asOwner=false,enabled=true}={}){
 const f=await householdCopyFixture();for(const n of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql'])await f.db.exec(readFileSync('supabase/migrations/'+n,'utf8'));
 if(asOwner){await f.db.query('update public.homes set owner_id=$1 where id=$2',[recipient,home]);await f.db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,owner,'Remaining family']);}
 let manifest=null;if(move){manifest=await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);}else{
  const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID},row=(await f.reviewPort.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();
  await f.reviewPort.inspectFile({...scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await f.reviewPort.recordFileDecision({...scope,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'erase_personal_file',evidenceDigest:'a'.repeat(64),confirmation:'ERASE_REVIEWED_PERSONAL_FILE'},f.signal);
 }
 await f.db.query('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=$1',[enabled]);
 const coverage=createClosureReviewCoverage({connect:f.connect}),retire=createReviewedRetirement({connect:f.connect}),scope={planID:randomUUID(),reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
 await coverage.capture({...scope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);const page=await coverage.page({...scope,afterKey:null},f.signal);assert.equal(page.hasMore,false);for(const item of page.items)if(item.kind==='text')await coverage.recordTextDecision({...scope,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal);
 const sealEventID=randomUUID();await coverage.seal({...scope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);
 const execute={...scope,eventID:randomUUID(),sealEventID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},operation={...execute};delete operation.confirmation;
 return {...f,coverage,retire,scope,execute,operation,manifest};
}
test('checked activation, typed inventory, owner detachment and app closure commit atomically while source bytes/capacity remain',async()=>{
 for(const asOwner of [false,true]){const f=await fixture({asOwner});try{
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[f.input.destinationID])).rows[0].state,'staged');
  const result=await f.retire.execute(f.execute,f.signal);assert.equal(result.accountErasureConfirmed,false);assert.equal(result.detachedHomeCount,asOwner?1:0);
  const files=(await f.db.query('select * from maintenance_private.reviewed_retirement_files where request_id=$1 order by kind',[result.deletionRequestID])).rows;assert.equal(files.length,2);const personal=files.find(f=>f.kind==='personal_file'),household=files.find(f=>f.kind==='household_file');assert.equal(personal.action,'move_to_household');assert.equal(personal.retained_asset_id,f.input.destinationID);assert.equal(personal.state,'pending');assert.equal(household.action,'retain_household_file');assert.equal(household.state,'retained');assert.equal(household.uploader_id,null);assert.equal(household.uploader_epoch,null);
  const origin=(await f.db.query('select * from maintenance_private.household_attachment_origins where attachment_id=$1',[f.input.destinationID])).rows[0];assert.equal(origin.sha256,f.manifest.destination.sha256);assert.equal(Object.hasOwn(origin,'user_id'),false);assert.equal(Object.hasOwn(origin,'app_epoch_id'),false);
  await f.db.exec('set role service_role');const visible=(await f.db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[owner,os,oe,f.input.destinationID])).rows[0].item;await f.db.exec('reset role');assert.equal(visible.objectPath,f.manifest.destination.objectPath);assert.equal(f.objects.has(f.sourcePath),true);assert.equal(f.objects.has(visible.objectPath),true);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);assert.equal((await f.db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,1);
 }finally{await f.db.close();}}
});
test('lost activation/retirement COMMIT recovers same fact and never duplicates origins, jobs or file inventory',async()=>{
 const f=await fixture();try{
  f.loseNextCommit();await assert.rejects(f.retire.execute(f.execute,f.signal),/commit acknowledgement lost/);assert.equal((await f.retire.status(f.operation,f.signal)).deletionRequestID,f.execute.eventID);await f.retire.execute(f.execute,f.signal);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.reviewed_retirement_files')).rows[0].n,2);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_attachment_origins')).rows[0].n,1);assert.equal(f.calls.filter(c=>c==='write').length,1);
 }finally{await f.db.close();}
});
test('withdrawn attachment rollout or changed source budget refuses before activation, job, inventory or app closure',async()=>{
 for(const change of ['disabled','budget']){const f=await fixture({enabled:change!=='disabled'});try{
  if(change==='budget')await f.db.exec('update maintenance_private.attachment_app_budget_policy set enabled=false');
  await assert.rejects(f.retire.execute(f.execute,f.signal),/Attachment retirement executor required|Sealed review changed/);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments')).rows[0].state,'staged');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_attachment_origins')).rows[0].n,0);assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[recipient])).rows[0].enabled,true);
 }finally{await f.db.close();}}
});
test('pending source cleanup protects retained destination and identifying source metadata; a legacy worker cannot finalize it',async()=>{
 const f=await fixture();try{
  await f.retire.execute(f.execute,f.signal);await assert.rejects(f.db.query("update maintenance_private.household_attachments set removal_pending=true where id=$1",[f.input.destinationID]),/cleanup dependency/);await assert.rejects(f.db.query('delete from maintenance_private.household_attachments where id=$1',[f.input.destinationID]),/cleanup dependency/);
  await assert.rejects(f.db.query('delete from maintenance_private.product_attachments where id=$1',[f.input.fileID]),/Pending household copy|cleanup must be confirmed/);
  const lease=randomUUID();await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[f.execute.eventID,lease]);await f.db.exec('set role service_role');const args=[f.execute.eventID,f.scope.userID,f.scope.epochID,lease];assert.equal((await f.db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) ok',args)).rows[0].ok,false);assert.equal((await f.db.query('select public.erase_reviewed_retirement_metadata($1,$2,$3,$4) ok',args)).rows[0].ok,false);
 }finally{await f.db.close();}
});
test('personal erasure is a typed pending source, not immediate deletion, and blocks old record erasure even without a copy intent',async()=>{
 const f=await fixture({move:false});try{
  await f.retire.execute(f.execute,f.signal);const item=(await f.db.query('select * from maintenance_private.reviewed_retirement_files')).rows[0];assert.equal(item.kind,'personal_file');assert.equal(item.action,'erase_personal_file');assert.equal(item.state,'pending');assert.equal(item.retained_asset_id,null);assert.equal((await f.db.query('select removal_pending from maintenance_private.product_attachments')).rows[0].removal_pending,true);assert.equal(f.objects.has(f.sourcePath),true);
  const lease=randomUUID();await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[f.execute.eventID,lease]);await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) ok',[f.execute.eventID,f.scope.userID,f.scope.epochID,lease])).rows[0].ok,false);
 }finally{await f.db.close();}
});
test('account-independent household proof survives simulated future journal minimization without changing household metadata digest',async()=>{
 const f=await fixture();try{
  await f.retire.execute(f.execute,f.signal);const scope={reviewRequestID:f.scope.reviewRequestID,userID:owner,epochID:oe},read=async()=>(await f.db.query('select * from maintenance_private.closure_review_household_files($1,$2,$3) where attachment_id=$4',[scope.reviewRequestID,owner,oe,f.input.destinationID])).rows[0];
  const before=await read();assert.equal(before.write_state,'settled');
  // Privileged isolated fixture simulates a future verified cleanup. No claim
  // is made that physical absence, capacity release or real cleanup is proven.
  await f.db.exec('delete from maintenance_private.reviewed_retirement_files;delete from maintenance_private.household_copy_writes;delete from maintenance_private.household_copy_intents');
  const after=await read();assert.equal(after.write_state,'settled');assert.equal(after.metadata_digest,before.metadata_digest);assert.deepEqual(after.descriptor,before.descriptor);assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
 }finally{await f.db.close();}
});
test('client, service and raw operator roles cannot create origin/inventory rows or invoke the internal staging helper',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select maintenance_private.stage_reviewed_retirement_files($1,$2,$3,$4,$5)',[f.execute.eventID,f.scope.planID,f.scope.reviewRequestID,f.scope.userID,f.scope.epochID]),/permission denied/);await assert.rejects(f.db.exec('delete from maintenance_private.household_attachment_origins'),/permission denied/);await assert.rejects(f.db.exec('delete from maintenance_private.reviewed_retirement_files'),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});

test('established household files retain their real custody type for both retention and personal erasure, with no invented uploader identity',async()=>{
 for(const erase of [false,true]){
  const f=await fixture({move:false});try{
   // Independent mature-custody fixture. Earlier tests prove checked creation;
   // this fixture models its account-independent proof after source cleanup.
   const actor=randomUUID(),epoch=randomUUID(),reviewID=randomUUID(),h=randomUUID(),p=randomUUID(),file=randomUUID();
   await f.db.query('insert into auth.users(id) values($1)',[actor]);await f.db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[actor,epoch]);await f.db.query('insert into maintenance_private.account_access values($1,true)',[actor]);
   await f.db.query('insert into public.homes(id,owner_id) values($1,$2)',[h,actor]);await f.db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[h,owner,'Remaining household family']);await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[p,h,'air','Established household appliance']);
   const instance=(await f.db.query('select instance_id from maintenance_private.closure_home_instances where home_id=$1',[h])).rows[0].instance_id,sha=(await f.db.query('select sha256 from maintenance_private.product_attachments where id=$1',[f.input.fileID])).rows[0].sha256;
   await f.db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256,state) values($1,$2,$3,$4,$5,'application/pdf',$6,'active')",[file,h,instance,p,f.bytes.length,sha]);
   await f.db.query("insert into maintenance_private.household_attachment_origins(attachment_id,home_instance_id,size_bytes,mime,sha256,write_receipt_id,acknowledged_at,measured_at) values($1,$2,$3,'application/pdf',$4,$5,now(),now())",[file,instance,f.bytes.length,sha,randomUUID()]);
   await f.db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),`households/${instance}/${file}.pdf`,f.bytes.length,'household-copy']);
   await f.db.query('insert into maintenance_private.account_closure_reviews(review_request_id,user_id,app_epoch_id,submission_id) values($1,$2,$3,$4)',[reviewID,actor,epoch,randomUUID()]);
   const scope={reviewRequestID:reviewID,userID:actor,epochID:epoch},hr=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:async()=>new Blob([f.bytes],{type:'application/pdf'})}),row=(await hr.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();assert.equal(row.write_state,'settled');
   await hr.inspectFile({...scope,fileID:file,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await hr.recordFileDecision({...scope,fileID:file,inspectionID,decisionID:randomUUID(),action:erase?'erase_personal_file':'retain_household_file',evidenceDigest:'a'.repeat(64),confirmation:erase?'ERASE_REVIEWED_PERSONAL_FILE':'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal);
   const plan={...scope,planID:randomUUID()};await f.coverage.capture({...plan,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);for(const item of (await f.coverage.page({...plan,afterKey:null},f.signal)).items)if(item.kind==='text')await f.coverage.recordTextDecision({...plan,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal);
   const sealEventID=randomUUID();await f.coverage.seal({...plan,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);const eventID=randomUUID();await f.retire.execute({...plan,eventID,sealEventID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},f.signal);
   const typed=(await f.db.query('select * from maintenance_private.reviewed_retirement_files where request_id=$1',[eventID])).rows;assert.equal(typed.length,1);assert.equal(typed[0].kind,'household_file');assert.equal(typed[0].uploader_id,null);assert.equal(typed[0].uploader_epoch,null);assert.equal(typed[0].state,erase?'pending':'retained');
   const lease=randomUUID();await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=now()+interval '10 minutes' where id=$1",[eventID,lease]);await f.db.exec('set role service_role');const args=[eventID,actor,epoch,lease];assert.equal((await f.db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) ok',args)).rows[0].ok,true);
   const visible=(await f.db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[owner,os,oe,file])).rows[0].item;if(erase){assert.equal(visible,null);assert.equal((await f.db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) ok',args)).rows[0].ok,false);}else assert.equal(visible.id,file);
  }finally{await f.db.close();}
 }
});

test('failure at final review transition rolls back activation, origin, typed inventory, ownership, enrollment and job together',async()=>{
 const f=await fixture({asOwner:true});try{
  await f.db.exec("create function maintenance_private.fail_retirement_fixture() returns trigger language plpgsql set search_path='' as $$begin if new.state='retirement_queued' then raise exception 'Synthetic final transition failure';end if;return new;end;$$;create trigger zz_fail_retirement_fixture before update on maintenance_private.account_closure_reviews for each row execute function maintenance_private.fail_retirement_fixture()");
  await assert.rejects(f.retire.execute(f.execute,f.signal),/Synthetic final transition failure/);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments')).rows[0].state,'staged');for(const table of ['reviewed_retirement_files','household_attachment_origins','account_deletion_requests','reviewed_retirements'])assert.equal((await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[recipient])).rows[0].enabled,true);assert.equal(f.objects.has(f.sourcePath),true);assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
 }finally{await f.db.close();}
});

test('an old paired-app contract refuses reviewed retirement rather than silently changing shared ownership',async()=>{
 const f=await fixture();try{
  await f.db.exec('create table maintenance_private.household_write_routes(id integer primary key)');await assert.rejects(f.retire.execute(f.execute,f.signal),/Shared retirement contract upgrade required/);assert.equal((await f.db.query('select state from maintenance_private.household_attachments')).rows[0].state,'staged');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await f.db.close();}
});
