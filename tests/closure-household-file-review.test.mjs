import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';
import {home,product,recipient,owner,rs} from './fixtures/home-handoff-identifiers.mjs';
async function fixture(){
 const f=await householdCopyFixture();await f.db.exec(readFileSync('supabase/migrations/20261016161923_ouchi_closure_household_file_review.sql','utf8'));
 const manifest=await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);
 // Privileged fixture activation only; shipping activation remains unavailable.
 await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
 const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
 let badBytes=false,byteReads=0;const review=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:async file=>{byteReads++;return badBytes?new Blob(['wrong'],{type:file.mime}):f.objects.get(file.objectPath);}});
 const inventory=()=>review.fileInventory({...scope,afterFile:null},f.signal);
 const input=async()=>{const row=(await inventory()).items.find(r=>r.attachment_id===f.input.destinationID);return {...scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest};};
 return {...f,manifest,scope,review,inventory,readInput:input,badBytes:()=>{badBytes=true;},byteReads:()=>byteReads};
}
test('current family sees household file without uploader identity; measured inspection never implies subject approval or erasure',async()=>{
 const f=await fixture();try{
  const page=await f.inventory();assert.equal(page.items.length,1);assert.equal(page.consistentSnapshot,false);assert.equal(page.subjectConfirmed,false);assert.equal(page.accountErasureConfirmed,false);
  const input=await f.readInput(),receipt=await f.review.readFile(input,f.signal);assert.equal(receipt.file.objectPath,f.manifest.destination.objectPath);assert.equal(Object.hasOwn(receipt.file,'uploaderID'),false);assert.equal(Object.hasOwn(receipt.file,'uploaderEpoch'),false);
  const inspected=await f.review.inspectFile({...input,inspectionID:randomUUID()},f.signal);assert.equal(inspected.subjectConfirmed,false);assert.equal(inspected.householdRetentionApproved,false);assert.deepEqual(Buffer.from(await inspected.content.arrayBuffer()),f.bytes);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_household_file_inspections')).rows[0].n,1);assert.equal(f.objects.has(f.sourcePath),true);
 }finally{await f.db.close();}
});
test('household decision events are exact and ordered; retry cannot revive older approval or execute retention/removal',async()=>{
 const f=await fixture();try{
  const input=await f.readInput(),inspectionID=randomUUID();await f.review.inspectFile({...input,inspectionID},f.signal);
  const decision={...f.scope,fileID:input.fileID,inspectionID,decisionID:randomUUID(),action:'retain_household_file',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'};
  await f.review.recordFileDecision(decision,f.signal);assert.equal((await f.review.readFileDecision(input,f.signal)).current,true);
  const later={...decision,decisionID:randomUUID(),action:'needs_review',confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'};await f.review.recordFileDecision(later,f.signal);await f.review.recordFileDecision(decision,f.signal);
  const current=await f.review.readFileDecision(input,f.signal);assert.equal(current.decisionID,later.decisionID);assert.equal(current.action,'needs_review');assert.equal(current.householdRetentionExecuted,false);assert.equal(current.accountErasureConfirmed,false);
  await assert.rejects(f.review.recordFileDecision({...decision,evidenceDigest:'b'.repeat(64)},f.signal),/event conflict/);
  assert.equal(f.objects.has(f.sourcePath),true);assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
 }finally{await f.db.close();}
});
test('stale metadata, non-active custody, unknown writers and wrong bytes refuse inspection without a durable false measurement',async()=>{
 const f=await fixture();try{
  const input=await f.readInput();f.badBytes();await assert.rejects(f.review.inspectFile({...input,inspectionID:randomUUID()},f.signal),/content mismatch/);
  await f.db.query('update maintenance_private.household_attachments set removal_pending=true where id=$1',[input.fileID]);await assert.rejects(f.review.readFile(input,f.signal),/metadata changed/);
  const fresh=await f.readInput();await assert.rejects(f.review.inspectFile({...fresh,inspectionID:randomUUID()},f.signal),/Settled verified/);
  await f.db.query('update maintenance_private.household_attachments set removal_pending=false where id=$1',[input.fileID]);
  await f.db.query("update maintenance_private.household_copy_writes set phase='issued',acknowledged_at=null where intent_id=$1",[f.input.intentID]);
  const pending=await f.readInput();await assert.rejects(f.review.inspectFile({...pending,inspectionID:randomUUID()},f.signal),/Settled verified/);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_household_file_inspections')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('lost inspection COMMIT is recovered with the same immutable ID, and a missing remaining family invalidates retention',async()=>{
 const f=await fixture();try{
  const input=await f.readInput(),inspectionID=randomUUID();f.loseNextCommit();await assert.rejects(f.review.inspectFile({...input,inspectionID},f.signal),/commit acknowledgement lost/);
  await f.review.inspectFile({...input,inspectionID},f.signal);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_household_file_inspections')).rows[0].n,1);
  const decision={...f.scope,fileID:input.fileID,inspectionID,decisionID:randomUUID(),action:'retain_household_file',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'};
  await f.review.recordFileDecision(decision,f.signal);await f.db.query('update public.homes set owner_id=null where id=$1',[home]);
  assert.equal((await f.review.readFileDecision(input,f.signal)).current,false);await assert.rejects(f.review.recordFileDecision({...decision,decisionID:randomUUID()},f.signal),/Remaining family required/);
 }finally{await f.db.close();}
});
test('current/legacy household scope and residual copy links discover candidates, never unrelated households',async()=>{
 const f=await fixture();try{
  const local=randomUUID(),foreign=randomUUID(),otherHome=randomUUID(),otherProduct=randomUUID();
  await f.db.query('insert into public.homes(id,owner_id) values($1,$2)',[otherHome,owner]);await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[otherProduct,otherHome,'air','Synthetic other appliance']);
  async function add(id,h,p){await f.db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256) select $1,$2,instance_id,$3,12,'application/pdf',$4 from maintenance_private.closure_home_instances where home_id=$2",[id,h,p,'a'.repeat(64)]);}
  await add(local,home,product);await add(foreign,otherHome,otherProduct);
  assert.deepEqual(new Set((await f.inventory()).items.map(r=>r.attachment_id)),new Set([local,f.input.destinationID]));
  await f.db.query('delete from public.home_members where user_id=$1',[recipient]);assert.deepEqual((await f.inventory()).items.map(r=>r.attachment_id),[f.input.destinationID]);
  await f.reviewPort.recordLegacyContext({...f.scope,eventID:randomUUID(),homeID:home,action:'confirmed',evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_REVIEWED_LEGACY_CONTEXT'},f.signal);
  assert.deepEqual(new Set((await f.inventory()).items.map(r=>r.attachment_id)),new Set([local,f.input.destinationID]));
 }finally{await f.db.close();}
});
test('51-row lookahead gives bounded pages without claiming full coverage; invalid cursors and public roles refuse',async()=>{
 const f=await fixture();try{
  for(let i=0;i<52;i++)await f.db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256) values($1,$2,$3,$4,12,'application/pdf',$5)",[randomUUID(),home,f.manifest.destination.homeInstanceID,product,'a'.repeat(64)]);
  const first=await f.inventory();assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.equal(first.consistentSnapshot,false);
  const second=await f.review.fileInventory({...f.scope,afterFile:first.nextCursor},f.signal);assert.equal(second.items.length,3);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(r=>r.attachment_id)).size,53);
  await assert.rejects(f.review.fileInventory({...f.scope,afterFile:'../foreign'},f.signal),/Scoped file review/);
  for(const role of ['anon','authenticated','service_role']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select * from maintenance_private.closure_review_household_file_inventory($1,$2,$3,null)',Object.values(f.scope)),/permission denied/);await assert.rejects(f.db.query('select maintenance_private.read_closure_review_household_file($1,$2,$3,$4,$5)',[...Object.values(f.scope),f.input.destinationID,first.items.find(v=>v.attachment_id===f.input.destinationID)?.metadata_digest??'a'.repeat(64)]),/permission denied/);await assert.rejects(f.db.query('select maintenance_private.record_closure_household_file_inspection($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),...Object.values(f.scope),f.input.destinationID,'a'.repeat(64),'a'.repeat(64),12]),/permission denied/);if(role!=='service_role')await assert.rejects(f.db.query('select * from maintenance_private.closure_household_file_inspections'),/permission denied/);await assert.rejects(f.db.query('delete from maintenance_private.closure_household_file_inspections'),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});

test('disabled operator or cancelled review cannot start a household content read',async()=>{
 const f=await fixture();try{
  const input=await f.readInput();await f.db.exec('update maintenance_private.closure_operator_principals set enabled=false');
  await assert.rejects(f.review.inspectFile({...input,inspectionID:randomUUID()},f.signal),/Authorized operator/);assert.equal(f.byteReads(),0);
  await f.db.exec('update maintenance_private.closure_operator_principals set enabled=true;set role service_role');
  await f.db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[f.input.userID,rs,f.input.epochID,f.submission]);
  await f.db.exec('reset role');
  await assert.rejects(f.review.inspectFile({...input,inspectionID:randomUUID()},f.signal),/Current matching review/);assert.equal(f.byteReads(),0);
 }finally{await f.db.close();}
});
