import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createClosureReviewCoverage} from '../lib/closure-review-coverage.mjs';
import {createClosureHouseholdFileReview} from '../lib/closure-household-file-review.mjs';
import {home,product,recipient} from './fixtures/home-handoff-identifiers.mjs';
async function fixture(){
 const f=await householdCopyFixture();for(const n of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql'])await f.db.exec(readFileSync('supabase/migrations/'+n,'utf8'));
 const coverage=createClosureReviewCoverage({connect:f.connect}),scope={planID:randomUUID(),reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
 const capture=()=>coverage.capture({...scope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);
 const sealInput={...scope,eventID:randomUUID(),evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'};
 async function pages(s=scope){let afterKey=null,rows=[];do{const p=await coverage.page({...s,afterKey},f.signal);rows.push(...p.items);afterKey=p.nextCursor;}while(afterKey);return rows;}
 async function approve(s=scope){for(const row of await pages(s)){if(row.kind!=='text')continue;const full=await coverage.readText({...s,itemKey:row.item_key},f.signal);assert.equal(full.digest,row.content_digest);await coverage.recordTextDecision({...s,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal);}}
 return {...f,coverage,scope,capture,sealInput,pages,approve};
}
test('one complete snapshot includes household scope, all text including nicknames/category, and personal files; no raw text is duplicated',async()=>{
 const f=await fixture();try{
  await f.db.query('update public.home_members set nickname=$1 where user_id=$2',['Synthetic PRIVATE nickname',recipient]);await f.db.query('update public.products set memo=$1 where id=$2',['Synthetic PRIVATE memo',product]);
  const receipt=await f.capture(),rows=await f.pages();assert.equal(receipt.itemCount,rows.length);assert.equal(receipt.current,true);assert.equal(receipt.mutationAuthorized,false);
  assert.ok(rows.some(r=>r.kind==='scope'));assert.ok(rows.some(r=>r.item_key.endsWith(':nickname')));assert.ok(rows.some(r=>r.item_key.endsWith(':categoryId')));assert.ok(rows.some(r=>r.kind==='personal_file'));
  const stored=JSON.stringify((await f.db.query('select * from maintenance_private.closure_coverage_items')).rows);assert.equal(stored.includes('Synthetic PRIVATE'),false);
  await assert.rejects(f.coverage.seal(f.sealInput,f.signal),/Complete current explicit review/);await f.approve();const sealed=await f.coverage.seal(f.sealInput,f.signal);assert.equal(sealed.state,'sealed');assert.equal(sealed.current,true);assert.equal(sealed.unresolvedCount,0);assert.equal(sealed.accountErasureConfirmed,false);assert.equal(sealed.mutationAuthorized,false);
 }finally{await f.db.close();}
});
test('new/deleted fields, new files, family scope and later file decisions invalidate exact captured coverage',async()=>{
 for(const change of ['text','deleted-text','new-file','member','decision']){
  const f=await fixture();try{
   if(change==='deleted-text')await f.db.query('update public.products set memo=$1 where id=$2',['Text to remove',product]);
   await f.capture();await f.approve();await f.coverage.seal(f.sealInput,f.signal);
   if(change==='text')await f.db.query('update public.products set memo=$1 where id=$2',['Later personal note',product]);
   if(change==='deleted-text')await f.db.query('update public.products set memo=null where id=$1',[product]);
   if(change==='new-file')await f.db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256) select $1,$2,instance_id,$3,12,'application/pdf',$4 from maintenance_private.closure_home_instances where home_id=$2",[randomUUID(),home,product,'a'.repeat(64)]);
   if(change==='member')await f.db.query('update public.home_members set nickname=$1 where user_id=$2',['Changed family label',recipient]);
   if(change==='decision'){
    const row=(await f.reviewPort.fileInventory({reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID,afterFile:null},f.signal)).items[0];
    const inspected=await f.reviewPort.inspectFile({reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()},f.signal);
    await f.reviewPort.recordFileDecision({reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID,fileID:row.attachment_id,inspectionID:inspected.inspectionID,decisionID:randomUUID(),action:'needs_review',evidenceDigest:'c'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'},f.signal);
   }
   const status=await f.coverage.status(f.scope,f.signal);assert.equal(status.state,'sealed');assert.equal(status.current,false);const retry=await f.coverage.seal(f.sealInput,f.signal);assert.equal(retry.current,false);assert.equal(retry.sealEventID,f.sealInput.eventID);
  }finally{await f.db.close();}
 }
});
test('a newer needs-review text decision wins over older approval retries; replacement is explicit and old plan never revives',async()=>{
 const f=await fixture();try{
  await f.capture();await f.approve();const row=(await f.pages()).find(r=>r.kind==='text'),decision={...f.scope,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'};
  await f.coverage.recordTextDecision(decision,f.signal);await f.coverage.recordTextDecision({...decision,eventID:randomUUID(),action:'needs_review',confirmation:'REQUIRE_ADDITIONAL_TEXT_REVIEW'},f.signal);await f.coverage.recordTextDecision(decision,f.signal);
  await assert.rejects(f.coverage.seal(f.sealInput,f.signal),/Complete current explicit review/);const next={...f.scope,planID:randomUUID()};
  await assert.rejects(f.coverage.capture({...next,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal),/explicitly replaced/);
  await f.coverage.capture({...next,replacesPlanID:f.scope.planID,confirmation:'REPLACE_COMPLETE_SCOPED_REVIEW'},f.signal);assert.equal((await f.coverage.status(f.scope,f.signal)).state,'superseded');
  await assert.rejects(f.coverage.seal(f.sealInput,f.signal),/Open coverage required/);assert.equal((await f.coverage.status(next,f.signal)).unresolvedCount>0,true);
 }finally{await f.db.close();}
});
test('staged verified copy binds source approval; an active household file requires its own current inspection and decision',async()=>{
 const f=await fixture();try{
  const m=await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);await f.capture();await f.approve();assert.equal((await f.coverage.seal(f.sealInput,f.signal)).current,true);
  await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
  const hs={reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID},hr=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:async file=>f.objects.get(file.objectPath)});
  const row=(await hr.fileInventory({...hs,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();await hr.inspectFile({...hs,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);
  await hr.recordFileDecision({...hs,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'retain_household_file',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal);
  const next={...f.scope,planID:randomUUID()};await f.coverage.capture({...next,replacesPlanID:f.scope.planID,confirmation:'REPLACE_COMPLETE_SCOPED_REVIEW'},f.signal);await f.approve(next);
  assert.equal((await f.coverage.seal({...f.sealInput,planID:next.planID,eventID:randomUUID()},f.signal)).current,true);assert.equal(f.objects.has(m.destination.objectPath),true);assert.equal(f.objects.has(f.sourcePath),true);await f.db.query("update maintenance_private.household_copy_writes set phase='issued',acknowledged_at=null where intent_id=$1",[f.input.intentID]);assert.equal((await f.coverage.status(next,f.signal)).current,false);
 }finally{await f.db.close();}
});
test('lost capture/seal COMMIT recovers immutable IDs; conflicting evidence and ordinary callers cannot seal',async()=>{
 const f=await fixture();try{
  f.loseNextCommit();await assert.rejects(f.capture(),/commit acknowledgement lost/);await f.capture();assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_coverage_plans')).rows[0].n,1);await f.approve();
  f.loseNextCommit();await assert.rejects(f.coverage.seal(f.sealInput,f.signal),/commit acknowledgement lost/);const recovered=await f.coverage.seal(f.sealInput,f.signal);assert.equal(recovered.sealEventID,f.sealInput.eventID);
  await assert.rejects(f.coverage.seal({...f.sealInput,evidenceDigest:'d'.repeat(64)},f.signal),/seal event conflict/);
  for(const role of ['anon','authenticated','service_role']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select maintenance_private.seal_closure_coverage($1,$2,$3,$4,$5,$6)',[f.sealInput.eventID,f.scope.planID,f.scope.reviewRequestID,f.scope.userID,f.scope.epochID,'b'.repeat(64)]),/permission denied/);await assert.rejects(f.db.query('delete from maintenance_private.closure_coverage_plans'),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});

test('bounded snapshot overflow rolls back replacement instead of silently truncating coverage',async()=>{
 const f=await fixture();try{
  await f.capture();await f.db.query('insert into public.products(id,"homeId","categoryId",name) select gen_random_uuid(),$1,$2,$3||g::text from generate_series(1,5001) g',[home,'air','Synthetic bulk ']);
  await assert.rejects(f.coverage.capture({...f.scope,planID:randomUUID(),replacesPlanID:f.scope.planID,confirmation:'REPLACE_COMPLETE_SCOPED_REVIEW'},f.signal),/bounded review limit/);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_coverage_plans')).rows[0].n,1);assert.equal((await f.coverage.status(f.scope,f.signal)).state,'open');
 }finally{await f.db.close();}
});
test('snapshot paging is immutable across later writes and oversized text cannot receive a truncated approval',async()=>{
 const f=await fixture();try{
  await f.db.query('insert into public.products(id,"homeId","categoryId",name) select gen_random_uuid(),$1,$2,$3||g::text from generate_series(1,30) g',[home,'air','Synthetic page ']);
  await f.db.query('update public.products set memo=$1 where id=$2',['x'.repeat(65537),product]);const captured=await f.capture(),rows=await f.pages();assert.equal(rows.length,captured.itemCount);assert.equal(rows.length>50,true);
  const memo=rows.find(r=>r.record_id===product&&r.field_name==='memo');await assert.rejects(f.coverage.readText({...f.scope,itemKey:memo.item_key},f.signal),/separate bounded review/);
  await assert.rejects(f.coverage.recordTextDecision({...f.scope,itemKey:memo.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal),/separate bounded review/);
  await f.db.query('update public.products set memo=$1 where id=$2',['Later edit',product]);assert.deepEqual(await f.pages(),rows);assert.equal((await f.coverage.status(f.scope,f.signal)).current,false);
 }finally{await f.db.close();}
});

test('a residual file from a former home creates an unresolved scope gap until explicit legacy context and recapture',async()=>{
 const f=await fixture();try{
  await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
  const hs={reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID},hr=createClosureHouseholdFileReview({connect:f.connect,readFileBytes:async file=>f.objects.get(file.objectPath)}),row=(await hr.fileInventory({...hs,afterFile:null},f.signal)).items[0],inspectionID=randomUUID();
  await hr.inspectFile({...hs,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID},f.signal);await hr.recordFileDecision({...hs,fileID:row.attachment_id,inspectionID,decisionID:randomUUID(),action:'retain_household_file',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},f.signal);
  await f.db.query('delete from public.home_members where user_id=$1',[recipient]);await f.capture();const rows=await f.pages();assert.ok(rows.some(r=>r.kind==='scope_gap'));await assert.rejects(f.coverage.seal(f.sealInput,f.signal),/Complete current explicit review/);
  await f.reviewPort.recordLegacyContext({reviewRequestID:f.scope.reviewRequestID,userID:f.scope.userID,epochID:f.scope.epochID,eventID:randomUUID(),homeID:home,action:'confirmed',evidenceDigest:'a'.repeat(64),confirmation:'CONFIRM_REVIEWED_LEGACY_CONTEXT'},f.signal);
  assert.equal((await f.coverage.status(f.scope,f.signal)).current,false);const next={...f.scope,planID:randomUUID()};await f.coverage.capture({...next,replacesPlanID:f.scope.planID,confirmation:'REPLACE_COMPLETE_SCOPED_REVIEW'},f.signal);assert.equal((await f.pages(next)).some(r=>r.kind==='scope_gap'),false);await f.approve(next);assert.equal((await f.coverage.seal({...f.sealInput,planID:next.planID,eventID:randomUUID()},f.signal)).state,'sealed');
 }finally{await f.db.close();}
});

test('explicit full-text redaction handles member composite keys and category, makes snapshot stale, and never replays over a later family edit',async()=>{
 for(const field of ['nickname','categoryId']){
  const f=await fixture();try{
   await f.capture();const row=(await f.pages()).find(r=>r.field_name===field),replacement=field==='nickname'?'家族':'air-neutral',redact={...f.scope,itemKey:row.item_key,eventID:randomUUID(),expectedDigest:row.content_digest,replacement,confirmation:'REDACT_REVIEWED_COVERAGE_TEXT'};
   f.loseNextCommit();await assert.rejects(f.coverage.redactText(redact,f.signal),/commit acknowledgement lost/);assert.equal((await f.coverage.status(f.scope,f.signal)).current,false);
   if(field==='nickname')await f.db.query('update public.home_members set nickname=$1 where "homeId"=$2 and user_id=$3',['Later family label',home,recipient]);else await f.db.query('update public.products set "categoryId"=$1 where id=$2',['Later family category',product]);
   await f.coverage.redactText(redact,f.signal);const actual=field==='nickname'?(await f.db.query('select nickname value from public.home_members where "homeId"=$1 and user_id=$2',[home,recipient])).rows[0].value:(await f.db.query('select "categoryId" value from public.products where id=$1',[product])).rows[0].value;
   assert.equal(actual,field==='nickname'?'Later family label':'Later family category');await assert.rejects(f.coverage.redactText({...redact,replacement:'different'},f.signal),/redaction conflict/);
  }finally{await f.db.close();}
 }
});

test('transport refuses fabricated completion/authority, malformed scope and unconfirmed redaction before a caller can act',async()=>{
 const scope={planID:randomUUID(),reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID()},signal=new AbortController().signal;
 const valid={kind:'closure-coverage/v1',planID:scope.planID,reviewRequestID:scope.reviewRequestID,epochID:scope.epochID,state:'open',itemCount:1,current:true,unresolvedCount:1,sealEventID:null,accountErasureConfirmed:false,mutationAuthorized:false};
 for(const patch of [{accountErasureConfirmed:true},{mutationAuthorized:true},{itemCount:'1'},{unresolvedCount:2},{state:'superseded'},{state:'sealed'},{planID:randomUUID()}]){
  const port=createClosureReviewCoverage({connect:async()=>({abort(){},async close(){},async query(sql){return {rows:sql.startsWith('select maintenance_private.read_closure_coverage')?[{receipt:{...valid,...patch}}]:[]};}})});
  await assert.rejects(port.status(scope,signal),/observation unconfirmed/);
 }
 let calls=0;const port=createClosureReviewCoverage({connect:async()=>{calls++;throw Error('Unexpected connection');}});
 await assert.rejects(port.seal({...scope,eventID:randomUUID(),evidenceDigest:'a'.repeat(64),confirmation:'YES'},signal),/Explicit coverage seal/);
 await assert.rejects(port.redactText({...scope,itemKey:'text:products:'+randomUUID()+':memo',eventID:randomUUID(),expectedDigest:'a'.repeat(64),replacement:{bad:'input'},confirmation:'REDACT_REVIEWED_COVERAGE_TEXT'},signal),/Explicit coverage text redaction/);assert.equal(calls,0);
});
