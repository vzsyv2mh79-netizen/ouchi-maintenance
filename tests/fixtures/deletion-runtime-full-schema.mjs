/** Synthetic actors and explicit human-review stand-ins, on a preloaded full
 * migration chain. Never installs SQL, adopts production policy, or sends mail. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createAccountContentReviewPorts} from '../../lib/closure-account-content-review.mjs';
import {createHouseholdCopy} from '../../lib/household-copy.mjs';
import {createReviewedRetirement} from '../../lib/reviewed-retirement.mjs';
import {createPrivateOperatorConnection} from '../../lib/closure-operator-connection.mjs';
import {Client} from 'pg';
export async function seedFullSchemaDeletion({databaseFactory,dbOptions,authPort}){
 assert.equal(process.env.OUCHI_DELETION_RUNTIME_SERVICE_TEST,'true');
 assert.ok(Number.isInteger(authPort)&&authPort>1024&&authPort<65536);
 const db=await databaseFactory();
 try{
  // Latest inspection role and versioned review functions must both exist;
  // the runner separately verifies every pinned migration before this seed.
  assert.equal((await db.query("select exists(select 1 from pg_roles where rolname='ouchi_closure_inspector') and to_regprocedure('maintenance_private.record_closure_account_content_text_decision(uuid,uuid,uuid,uuid,uuid,text,text,text,text)') is not null ready")).rows[0].ready,true);
  await db.query('update maintenance_private.enrollment_policy set require_explicit=true;update maintenance_private.account_closure_review_policy set enabled=true;update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=true;update maintenance_private.attachment_app_budget_policy set writer_coverage_verified=true,enabled=true,budget_bytes=1048576');
  async function actor(){
   const response=await fetch('http://127.0.0.1:'+authPort+'/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:randomUUID()+'@example.invalid',password:randomUUID()+'aA7!'})});assert.equal(response.ok,true);
   const value=await response.json(),session=JSON.parse(Buffer.from(value.access_token.split('.')[1],'base64url')).session_id,id=value.user.id,epoch=randomUUID();
   await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[id,epoch]);await db.query('insert into maintenance_private.account_access values($1,true)',[id]);await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[session,id,epoch]);return {id,session,epoch};
  }
  const departing=await actor(),family=await actor(),home=randomUUID(),product=randomUUID();
  await db.query('insert into public.homes(id,owner_id,name) values($1,$2,$3)',[home,departing.id,'Synthetic family home']);await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,family.id,'Remaining synthetic family']);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Synthetic household appliance']);
  await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[randomUUID(),product,'Synthetic filter care','掃除','ユーザー設定']);
  const role='ouchi_closure_decision_runtime';await db.query(`create role ${role} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-decision-only';grant ouchi_closure_operator to ${role}`);await db.query('insert into maintenance_private.closure_operator_principals values($1,true)',[role]);
  const projectRef='abcdefghijklmnopqrst',connect=createPrivateOperatorConnection({rawConfig:{projectRef,databaseURL:`postgresql://${role}:synthetic@db.${projectRef}.supabase.co/postgres`},expectedProject:projectRef,purpose:'decision',createClient:config=>{
   // Explicit disposable loopback driver alias; managed TLS is not tested.
   assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.database,'postgres');assert.equal(config.user,role);assert.equal(config.host,'db.'+projectRef+'.supabase.co');return new Client({...config,...dbOptions,user:role,password:'synthetic-decision-only',ssl:false});
  }});
  await db.query('set role service_role');const reviewRequestID=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[departing.id,departing.session,departing.epoch,randomUUID()])).rows[0].receipt.reviewRequestID;await db.query('reset role');
  const bytes=Buffer.from('%PDF-1.7\nSynthetic generic manufacturer care sheet\n'),sha=createHash('sha256').update(bytes).digest('hex'),fileID=randomUUID(),sourcePath=`${departing.id}/${departing.epoch}/${fileID}.pdf`;
  await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[fileID,departing.id,departing.epoch,product,bytes.length,sha]);await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),departing.id,departing.epoch]);await db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),sourcePath,bytes.length,'upload']);
  const signal=new AbortController().signal,scope={reviewRequestID,userID:departing.id,epochID:departing.epoch},objects=new Map([[sourcePath,new Blob([bytes],{type:'application/pdf'})]]),ports=createAccountContentReviewPorts({connect,readFileBytes:async file=>objects.get(file.objectPath)});
  const row=(await ports.personalFiles.fileInventory({...scope,afterFile:null},signal)).items[0],inspectionID=randomUUID(),decisionID=randomUUID();assert.equal(row.attachment_id,fileID);
  await ports.personalFiles.inspectFile({...scope,fileID,expectedMetadataDigest:row.metadata_digest,inspectionID},signal);await ports.personalFiles.recordFileDecision({...scope,fileID,inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},signal);
  // Measured memory-copy setup only. Actual object API writes are performed by
  // the service verifier, not presented as shipping copy-flow verification.
  const copy=createHouseholdCopy({connect,storage:{inspectDestination:async m=>objects.get(m.destination.objectPath)??null,readSource:async m=>objects.get(m.source.objectPath)??null,writeDestination:async(m,blob)=>{assert.equal(objects.has(m.destination.objectPath),false);objects.set(m.destination.objectPath,blob);}}}),intentID=randomUUID(),manifest=await copy.prepare({...scope,fileID,decisionID,intentID,destinationID:randomUUID()},signal);await copy.copy({...scope,intentID},signal);
  const coverage=ports.coverage,planID=randomUUID(),coverageScope={...scope,planID};await coverage.capture({...coverageScope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},signal);const page=await coverage.page({...coverageScope,afterKey:null},signal);assert.equal(page.hasMore,false);
  for(const item of page.items)if(item.kind==='text')await coverage.recordTextDecision({...coverageScope,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},signal);
  const sealEventID=randomUUID();await coverage.seal({...coverageScope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},signal);const requestID=randomUUID();await createReviewedRetirement({connect}).execute({...coverageScope,eventID:requestID,sealEventID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},signal);
  return {db,bytes,sourcePath,manifest,cleanupInput:{requestID},identities:{departing:departing.id,family:family.id,home,product},actualGoTrue:true};
 }catch(error){await db.close();throw error;}
}
