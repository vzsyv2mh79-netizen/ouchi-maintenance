import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewedCleanupReadyFixture as setup} from './fixtures/reviewed-file-cleanup.mjs';
import {createReviewedFileCleanup,createReviewedFileFinalization} from '../lib/reviewed-file-cleanup.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';
import {owner} from './fixtures/home-handoff-identifiers.mjs';
test('current typed lease pins source and retained origin, records API absence, retry is read-only and capacity/queue remain held',async()=>{
 const f=await setup();try{
  assert.equal(await f.cleanupPort.status(f.cleanupInput,f.signal),null);const receipt=await f.cleanupPort.cleanup(f.cleanupInput,f.signal);assert.equal(receipt.sourceAbsenceObserved,true);assert.equal(receipt.accountErasureConfirmed,false);assert.equal(receipt.capacityReleaseAuthorized,false);assert.equal(f.objects.has(f.sourcePath),false);assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
  assert.deepEqual(await f.cleanupPort.cleanup(f.cleanupInput,f.signal),receipt);assert.equal(f.cleanupCalls(),1);assert.equal((await f.db.query('select state from maintenance_private.reviewed_retirement_files where kind=\'personal_file\'')).rows[0].state,'pending');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.product_attachments')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('lost COMMIT recovers exact observation without another source DELETE',async()=>{
 const f=await setup();try{
  f.loseNextCommit();await assert.rejects(f.cleanupPort.cleanup(f.cleanupInput,f.signal),/commit acknowledgement lost/);assert.equal((await f.cleanupPort.status(f.cleanupInput,f.signal)).sourceAbsenceObserved,true);await f.cleanupPort.cleanup(f.cleanupInput,f.signal);assert.equal(f.cleanupCalls(),1);
 }finally{await f.db.close();}
});
test('expired/foreign lease, changed source fingerprint, unknown writer, missing pinned fingerprint and disabled policy stop before I/O',async()=>{
 for(const variant of ['expired','foreign','changed','unknown-writer','legacy','policy','principal']){
  const f=await setup();try{
   if(variant==='expired')await f.db.exec("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second'");
   if(variant==='foreign')f.cleanupInput.leaseToken=randomUUID();
   if(variant==='changed')await f.db.exec("update maintenance_private.attachment_write_attempts set settled_at=settled_at+interval '1 second'");
   if(variant==='unknown-writer')await f.db.exec("update maintenance_private.attachment_write_attempts set state='started',settled_at=null");
   if(variant==='legacy')await f.db.exec('update maintenance_private.reviewed_retirement_files set cleanup_fingerprint=null');
   if(variant==='policy')await f.db.exec('update maintenance_private.reviewed_retirement_policy set attachments_enabled=false');
   if(variant==='principal')await f.db.exec('update maintenance_private.retirement_file_principals set enabled=false');
   await assert.rejects(f.cleanupPort.cleanup(f.cleanupInput,f.signal),/lease required|fingerprint changed|writer required|Pinned pending|unavailable|Authorized/);assert.equal(f.cleanupCalls(),0);assert.equal(f.objects.has(f.sourcePath),true);
  }finally{await f.db.close();}
 }
});
test('provider failure after deleting source and lost SQL acknowledgement preserve queue; later retry probes and records',async()=>{
 const f=await setup();try{
  let fail=true;const p=createReviewedFileCleanup({connect:f.cleanupConnect,storage:{cleanup:async(...args)=>{const result=await f.cleanupStorage.cleanup(...args);if(fail){fail=false;throw Error('Synthetic transport uncertainty');}return {...result,deleteAcknowledged:false};}}});
  await assert.rejects(p.cleanup(f.cleanupInput,f.signal),/transport uncertainty/);assert.equal(await p.status(f.cleanupInput,f.signal),null);assert.equal((await p.cleanup(f.cleanupInput,f.signal)).deleteAcknowledged,false);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);
 }finally{await f.db.close();}
});
test('caller cannot supply paths, absence booleans, mismatched kinds or bypass minimum role boundaries',async()=>{
 const f=await setup();try{
  for(const bad of [{...f.cleanupInput,objectPath:f.sourcePath},{...f.cleanupInput,sourceAbsenceObserved:true},{...f.cleanupInput,kind:'unknown'}])await assert.rejects(f.cleanupPort.cleanup(bad,f.signal),/Exact leased/);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){
   await f.db.exec('set role '+role);await assert.rejects(f.db.query('select maintenance_private.lock_reviewed_file_cleanup($1,$2,$3,$4,$5,$6)',[f.cleanupInput.requestID,f.cleanupInput.userID,f.cleanupInput.epochID,f.cleanupInput.leaseToken,f.cleanupInput.kind,f.cleanupInput.fileID]),/permission denied/);await f.db.exec('reset role');
  }
  await f.db.exec('set role ouchi_retirement_file_executor');for(const table of ['retirement_file_principals','retirement_file_absence_observations','reviewed_retirement_files','product_attachments','household_attachments','retired_attachment_ids'])await assert.rejects(f.db.exec('select * from maintenance_private.'+table),/permission denied/);await f.db.exec('reset role');
  assert.equal(f.cleanupCalls(),0);
 }finally{await f.db.close();}
});
test('personal erase captures the planned removal flag before cleanup and uses no retained copy',async()=>{
 const f=await setup({move:false});try{assert.equal((await f.cleanupPort.cleanup(f.cleanupInput,f.signal)).sourceAbsenceObserved,true);assert.equal(f.cleanupCalls(),1);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_attachments')).rows[0].n,0);}finally{await f.db.close();}
});

test('established household source uses account-independent origin and a typed private path through cleanup observation',async()=>{
 const f=await setup({move:false});try{
   const actor=randomUUID(),epoch=randomUUID(),reviewID=randomUUID(),h=randomUUID(),p=randomUUID(),file=randomUUID();
   await f.db.query('insert into auth.users(id) values($1)',[actor]);await f.db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[actor,epoch]);await f.db.query('insert into maintenance_private.account_access values($1,true)',[actor]);
   await f.db.query('insert into public.homes(id,owner_id) values($1,$2)',[h,actor]);await f.db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[h,owner,'Remaining household family']);await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[p,h,'air','Established household appliance']);
   const instance=(await f.db.query('select instance_id from maintenance_private.closure_home_instances where home_id=$1',[h])).rows[0].instance_id,sha=(await f.db.query('select sha256 from maintenance_private.product_attachments where id=$1',[f.input.fileID])).rows[0].sha256;
   await f.db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256,state) values($1,$2,$3,$4,$5,'application/pdf',$6,'active')",[file,h,instance,p,f.bytes.length,sha]);
   await f.db.query("insert into maintenance_private.household_attachment_origins(attachment_id,home_instance_id,size_bytes,mime,sha256,write_receipt_id,acknowledged_at,measured_at) values($1,$2,$3,'application/pdf',$4,$5,now(),now())",[file,instance,f.bytes.length,sha,randomUUID()]);
   await f.db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),`households/${instance}/${file}.pdf`,f.bytes.length,'household-copy']);
   await f.db.query('insert into maintenance_private.account_closure_reviews(review_request_id,user_id,app_epoch_id,submission_id) values($1,$2,$3,$4)',[reviewID,actor,epoch,randomUUID()]);
   const scope={reviewRequestID:reviewID,userID:actor,epochID:epoch},hr=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:async()=>new Blob([f.bytes],{type:'application/pdf'})}),row=(await hr.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();assert.equal(row.write_state,'settled');
   await hr.inspectFile({...scope,fileID:file,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await hr.recordFileDecision({...scope,fileID:file,inspectionID,decisionID:randomUUID(),action:'erase_personal_file',evidenceDigest:'a'.repeat(64),confirmation:'ERASE_REVIEWED_PERSONAL_FILE'},f.signal);
   const plan={...scope,planID:randomUUID()};await f.coverage.capture({...plan,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);for(const item of (await f.coverage.page({...plan,afterKey:null},f.signal)).items)if(item.kind==='text')await f.coverage.recordTextDecision({...plan,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
   const sealEventID=randomUUID();await f.coverage.seal({...plan,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);const eventID=randomUUID();await f.retire.execute({...plan,eventID,sealEventID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},f.signal);

   const path=`households/${instance}/${file}.pdf`;f.objects.set(path,new Blob([f.bytes],{type:'application/pdf'}));
   const leaseToken=randomUUID();await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[eventID,leaseToken]);
   const input={requestID:eventID,userID:actor,epochID:epoch,leaseToken,kind:'household_file',fileID:file};
   const port=createReviewedFileCleanup({connect:f.cleanupConnect,storage:{cleanup:async(m,signal)=>{assert.equal(Object.hasOwn(m.source,'uploaderID'),false);assert.equal(m.source.objectPath,path);return f.cleanupStorage.cleanup(m,signal);}}});
   const observed=await port.cleanup(input,f.signal);assert.equal(observed.sourceAbsenceObserved,true);assert.equal(observed.capacityReleaseAuthorized,false);assert.equal(f.objects.has(path),false);
   await assert.rejects(f.db.query('delete from maintenance_private.household_attachments where id=$1',[file]),/cleanup must be confirmed/);
   const finalizer=createReviewedFileFinalization({connect:f.cleanupConnect});assert.equal((await finalizer.finalize(input,f.signal)).sourceMetadataErased,true);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_attachments where id=$1',[file])).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_attachment_origins where attachment_id=$1',[file])).rows[0].n,0);
 }finally{await f.db.close();}
});
test('cancellation after physical I/O does not commit observation; retry under same typed scope can reconcile',async()=>{
 const f=await setup(),controller=new AbortController();try{
  const p=createReviewedFileCleanup({connect:f.cleanupConnect,storage:{cleanup:async(m,signal)=>{const result=await f.cleanupStorage.cleanup(m,signal);controller.abort(Error('Synthetic cleanup cancelled'));return result;}}});
  await assert.rejects(p.cleanup(f.cleanupInput,controller.signal),/cancelled/);assert.equal(await f.cleanupPort.status(f.cleanupInput,f.signal),null);assert.equal(f.objects.has(f.sourcePath),false);assert.equal((await f.cleanupPort.cleanup(f.cleanupInput,f.signal)).sourceAbsenceObserved,true);
 }finally{await f.db.close();}
});
test('lease expiry after Storage I/O refuses receipt commit and keeps source metadata and capacity',async()=>{
 const f=await setup();try{
  await f.db.exec("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()+interval '1 second'");
  const p=createReviewedFileCleanup({connect:f.cleanupConnect,storage:{cleanup:async(m,signal)=>{const result=await f.cleanupStorage.cleanup(m,signal);await new Promise(resolve=>setTimeout(resolve,1100));return result;}}});
  await assert.rejects(p.cleanup(f.cleanupInput,f.signal),/lease required/);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.retirement_file_absence_observations')).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.product_attachments')).rows[0].n,1);
  await f.db.exec("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()+interval '10 minutes'");assert.equal((await f.cleanupPort.cleanup(f.cleanupInput,f.signal)).sourceAbsenceObserved,true);
 }finally{await f.db.close();}
});
