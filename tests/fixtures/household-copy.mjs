import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './home-handoff-full-schema.mjs';
import {owner,recipient,product,rs,re,oe} from './home-handoff-identifiers.mjs';
import {createClosureOperatorReview} from '../../lib/closure-operator-review.mjs';
import {createHouseholdCopy} from '../../lib/household-copy.mjs';
export async function householdCopyFixture({accountOriginal=true,budget=1024,storageHooks={},journal=true}={}){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role;alter table auth.users add column email text;alter table auth.users add column encrypted_password text;alter table auth.sessions add column aal text default $$aal1$$;alter table auth.sessions add column refreshed_at timestamp;create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,secret text)');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261014061618_ouchi_closure_review_private_access.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql','20261016123247_ouchi_closure_text_review_snapshot.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016132410_ouchi_ownerless_management_status.sql','20261016142322_ouchi_home_management_private_access.sql','20261016143928_ouchi_ownerless_closure_review_scope.sql','20261016144216_ouchi_management_claim_erasure.sql','20261016144839_ouchi_closure_file_review_inventory.sql','20261016150215_ouchi_closure_file_review_decisions.sql','20261016151202_ouchi_household_attachment_custody.sql','20261016152254_ouchi_attachment_physical_budget.sql','20261016153743_ouchi_household_copy_intents.sql','20261016160108_ouchi_household_copy_write_journal.sql'].filter(n=>journal||!n.includes('household_copy_write_journal')))await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const bytes=Buffer.from('%PDF-1.7\nSynthetic household copy\n'),sha=createHash('sha256').update(bytes).digest('hex'),fileID=randomUUID(),submission=randomUUID(),signal=new AbortController().signal;
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');const review=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,submission])).rows[0].receipt.reviewRequestID;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true)');await db.query('update maintenance_private.attachment_app_budget_policy set writer_coverage_verified=true,enabled=true,budget_bytes=$1',[budget]);
 await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[fileID,owner,oe,product,bytes.length,sha]);await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),owner,oe]);
 const sourcePath=`${owner}/${oe}/${fileID}.pdf`;if(accountOriginal)await db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),sourcePath,bytes.length,'upload']);
 let lose=null,writeFailure=false,ackFailure=false;
 const connect=async()=>{let phase='any',begun=false;return {
  abort(){},async close(){if(begun){await db.query('ROLLBACK');begun=false;}},
  async query(sql,args){
   if(sql.includes('record_household_copy_write_fact')&&ackFailure){ackFailure=false;throw Error('ACK transaction interrupted');}
   const r=await db.query(sql,args);
   if(sql==='BEGIN'||sql==='BEGIN READ ONLY'){begun=true;await db.exec('set local role ouchi_closure_operator');}
   if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;
   if(sql.includes('issue_household_copy_write'))phase='writer_issue';
   if(sql.includes('record_household_copy_write_fact'))phase='writer_ack';
   if(sql.includes('confirm_household_copy_bytes'))phase='copy_confirm';
   if(sql==='COMMIT'&&(lose==='any'||lose===phase)){lose=null;throw Error('commit acknowledgement lost');}return r;
  }
 };};
 const reviewPort=createClosureOperatorReview({connect,readFileBytes:async()=>new Blob([bytes],{type:'application/pdf'})});const scope={reviewRequestID:review,userID:recipient,epochID:re};const row=(await reviewPort.fileInventory({...scope,afterFile:null},signal)).items[0];const inspected=await reviewPort.inspectFile({...scope,fileID,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()},signal);
 const decisionID=randomUUID();await reviewPort.recordFileDecision({...scope,fileID,inspectionID:inspected.inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},signal);
 const objects=new Map([[sourcePath,new Blob([bytes],{type:'application/pdf'})]]),calls=[];
 const storage={inspectDestination:async m=>{calls.push('inspect');return objects.get(m.destination.objectPath)??null;},readSource:async m=>{calls.push('source');await storageHooks.readSource?.(m);return objects.get(m.source.objectPath)??null;},writeDestination:async(m,blob)=>{calls.push('write');await storageHooks.writeDestination?.(m,blob);if(objects.has(m.destination.objectPath))throw Error('Overwrite forbidden');objects.set(m.destination.objectPath,blob);if(writeFailure){writeFailure=false;throw Error('remote write acknowledgement lost');}}};
 const port=createHouseholdCopy({connect,storage}),input={...scope,intentID:randomUUID(),decisionID,fileID,destinationID:randomUUID()};const operation={...scope,intentID:input.intentID};
 return {db,port,connect,input,operation,signal,bytes,objects,calls,sourcePath,submission,loseNextCommit:(phase='any')=>{lose=phase;},loseNextWrite:()=>{writeFailure=true;},failNextAckQuery:()=>{ackFailure=true;},reviewPort};
}
