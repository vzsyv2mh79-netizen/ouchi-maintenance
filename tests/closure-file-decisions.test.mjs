import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,rs,re,oe} from './fixtures/home-handoff-identifiers.mjs';
import {createClosureOperatorReview} from '../lib/closure-operator-review.mjs';
const bytes=Buffer.from('%PDF-1.7\nSynthetic review file\n'),hash=createHash('sha256').update(bytes).digest('hex');
const confirmations={needs_review:'REQUIRE_ADDITIONAL_FILE_REVIEW',erase_personal_file:'ERASE_REVIEWED_PERSONAL_FILE',retain_family_copy:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'};
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql','20261016123247_ouchi_closure_text_review_snapshot.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016144839_ouchi_closure_file_review_inventory.sql','20261016150215_ouchi_closure_file_review_decisions.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const submission=randomUUID(),review=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,submission])).rows[0].receipt.reviewRequestID;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true)');
 const fileID=randomUUID();await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[fileID,owner,oe,product,bytes.length,hash]);
 await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),owner,oe]);
 const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql,args){const result=await db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');return result;}}),readFileBytes:async()=>new Blob([bytes],{type:'application/pdf'})});
 const scope={reviewRequestID:review,userID:recipient,epochID:re},signal=new AbortController().signal;
 const readInput=async()=>{const row=(await port.fileInventory({...scope,afterFile:null},signal)).items.find(f=>f.attachment_id===fileID);return {...scope,fileID,expectedMetadataDigest:row.metadata_digest};};
 const inspect=async(id=randomUUID())=>port.inspectFile({inspectionID:id,...await readInput()},signal);
 const decision=(inspectionID,action='needs_review',decisionID=randomUUID())=>({...scope,inspectionID,fileID,decisionID,action,evidenceDigest:'a'.repeat(64),confirmation:confirmations[action]});
 return {db,port,scope,signal,fileID,readInput,inspect,decision,submission};
}
test('measured inspection records exact scope and hashes, is idempotent, and never stores file bytes',async()=>{
 const {db,inspect}=await fixture();try{
  const id=randomUUID(),first=await inspect(id);assert.equal(first.inspectionID,id);assert.equal(first.familyRetentionApproved,false);await inspect(id);
  const rows=(await db.query('select to_jsonb(i) value from maintenance_private.closure_file_inspections i')).rows;assert.equal(rows.length,1);assert.equal(rows[0].value.sha256,hash);assert.equal(rows[0].value.inspection_id,id);assert.equal(JSON.stringify(rows).includes('Synthetic review file'),false);assert.equal(Object.hasOwn(rows[0].value,'content'),false);
 }finally{await db.close();}
});
test('latest explicit decision wins; exact older retry does not reactivate it or perform file operations',async()=>{
 const {db,port,signal,readInput,inspect,decision}=await fixture();try{
  const inspected=await inspect(),first=decision(inspected.inspectionID),second=decision(inspected.inspectionID,'retain_family_copy');
  const before=(await db.query('select to_jsonb(f) value from maintenance_private.product_attachments f')).rows;
  await port.recordFileDecision(first,signal);await port.recordFileDecision(second,signal);await port.recordFileDecision(first,signal);
  const current=await port.readFileDecision(await readInput(),signal);assert.equal(current.decisionID,second.decisionID);assert.equal(current.action,'retain_family_copy');assert.equal(current.current,true);assert.equal(current.familyRetentionExecuted,false);assert.equal(current.accountErasureConfirmed,false);
  await assert.rejects(port.recordFileDecision({...first,action:'erase_personal_file',confirmation:confirmations.erase_personal_file},signal),/event conflict/);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_file_decisions')).rows[0].n,2);assert.deepEqual((await db.query('select to_jsonb(f) value from maintenance_private.product_attachments f')).rows,before);
 }finally{await db.close();}
});
test('metadata change makes prior decision noncurrent and requires a new verified inspection',async()=>{
 const {db,port,signal,fileID,readInput,inspect,decision}=await fixture();try{
  const old=await inspect();await port.recordFileDecision(decision(old.inspectionID),signal);
  await db.query("update maintenance_private.product_attachments set created_at=created_at+interval '1 second' where id=$1",[fileID]);
  assert.equal((await port.readFileDecision(await readInput(),signal)).current,false);
  await assert.rejects(port.recordFileDecision(decision(old.inspectionID,'erase_personal_file'),signal),/metadata changed/);
  const fresh=await inspect();await port.recordFileDecision(decision(fresh.inspectionID,'erase_personal_file'),signal);assert.equal((await port.readFileDecision(await readInput(),signal)).current,true);
 }finally{await db.close();}
});
test('retention decision requires remaining family and never treats uploader identity as subject clearance',async()=>{
 const {db,port,signal,inspect,decision}=await fixture();try{
  await db.query('update public.homes set owner_id=null where id=$1',[home]);const inspection=await inspect();assert.equal(inspection.subjectConfirmed,false);
  await assert.rejects(port.recordFileDecision(decision(inspection.inspectionID,'retain_family_copy'),signal),/Remaining family/);
  await port.recordFileDecision(decision(inspection.inspectionID,'needs_review'),signal);
  assert.equal((await db.query('select count(*)::int n from public.home_members where "homeId"=$1',[home])).rows[0].n,1);
 }finally{await db.close();}
});
test('ordinary roles, revoked operator, malformed confirmation and uninspected ID cannot record decisions',async()=>{
 const {db,port,signal,inspect,decision,scope,fileID}=await fixture();try{
  const inspected=await inspect();await assert.rejects(port.recordFileDecision({...decision(inspected.inspectionID),confirmation:'YES'},signal),/Explicit file decision/);await assert.rejects(port.recordFileDecision(decision(randomUUID()),signal),/matching file inspection/);
  for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await assert.rejects(db.query('select maintenance_private.record_closure_file_decision($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),inspected.inspectionID,scope.reviewRequestID,recipient,re,fileID,'needs_review','a'.repeat(64)]),/permission denied/);await db.exec('reset role');}
  await db.exec('update maintenance_private.closure_operator_principals set enabled=false');await assert.rejects(port.recordFileDecision(decision(inspected.inspectionID),signal),/Authorized operator/);
 }finally{await db.close();}
});
test('inspection/decision metadata fences completion and is removed by exact scoped review cleanup cascade',async()=>{
 const {db,port,signal,scope,inspect,decision,submission}=await fixture();try{
  const inspected=await inspect();await port.recordFileDecision(decision(inspected.inspectionID),signal);
  const job=randomUUID(),lease=randomUUID();
  // Explicit synthetic finalization/retention prerequisites, not a dispatcher or real approval.
  await db.exec('set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[recipient,rs,re,submission]);await db.exec('reset role');
  await db.query('delete from public.home_members where user_id=$1',[recipient]);for(const table of ['app_session_epochs','app_epochs','account_access'])await db.query('delete from maintenance_private.'+table+' where user_id=$1',[recipient]);
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,records_erased,inventory_captured,identity_erased,receipt_sessions_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '10 minutes',true,true,true,true)",[job,recipient,re,lease]);
  await db.query('insert into maintenance_private.deletion_receipt_sessions values($1,$2)',[job,rs]);await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[job]);
  const args=[job,recipient,re,lease],complete=async()=>(await db.query('select public.complete_maintenance_account_deletion($1,$2,$3,$4) value',args)).rows[0].value;
  await db.exec('set role service_role');assert.equal(await complete(),false);await db.exec('reset role');
  await db.query('delete from maintenance_private.account_closure_reviews where review_request_id=$1 and user_id=$2 and app_epoch_id=$3',[scope.reviewRequestID,recipient,re]);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_file_inspections')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_file_decisions')).rows[0].n,0);
  await db.exec('set role service_role');assert.equal(await complete(),true);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments')).rows[0].n,1);
 }finally{await db.close();}
});
