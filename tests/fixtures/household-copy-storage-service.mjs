/** Explicit loopback-only Storage + real PostgreSQL fixture. The managed
 * gateway's opaque-key exchange and TLS are simulated, never production proof. */
import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {createDedicatedPostgresConnection} from '../../lib/dedicated-postgres-connection.mjs';
import {createClosureOperatorReview} from '../../lib/closure-operator-review.mjs';
import {createHouseholdCopy} from '../../lib/household-copy.mjs';
import {createClosureHouseholdFileReview} from '../../lib/closure-household-file-review.mjs';
import {createClosureReviewCoverage} from '../../lib/closure-review-coverage.mjs';
import {createReviewedRetirement} from '../../lib/reviewed-retirement.mjs';
assert.equal(process.env.OUCHI_COPY_STORAGE_SERVICE_TEST,'true');
Error.stackTraceLimit=0;
const dbPort=Number(process.env.OUCHI_TEST_DB_PORT),storagePort=Number(process.env.OUCHI_TEST_STORAGE_PORT);
assert.ok([dbPort,storagePort].every(p=>Number.isInteger(p)&&p>1024&&p<65536));
const options={host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'auth_test',query_timeout:5000},db=new Client(options);
const projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_copy_fixture',origin=`https://${projectID}.supabase.co`,local=`http://127.0.0.1:${storagePort}`,bucket='ouchi-product-attachments';
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),message=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
const serviceJWT=message+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(message).digest('base64url');
const originalFetch=globalThis.fetch,modules=new Map(),signal=new AbortController().signal;
function compile(name){if(name.endsWith('.mjs'))return import.meta.resolve('../../lib/'+name);if(modules.has(name))return modules.get(name);let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;}
const {createHouseholdCopyStorage}=await import(compile('household-copy-storage'));
let mode='normal',postCount=0,entered,release,webCustody;const cases=[];
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith('/storage/v1/object/'+bucket+'/')||(init.method==='DELETE'&&url.pathname==='/storage/v1/object/'+bucket));assert.ok(['GET','POST','DELETE'].includes(init.method));assert.equal(init.redirect,'error');
 const headers=new Headers(init.headers);assert.equal(headers.get('apikey'),secretKey);headers.set('authorization','Bearer '+serviceJWT);headers.set('apikey',serviceJWT);
 if(init.method==='POST'){postCount++;assert.equal(headers.get('x-upsert'),'false');assert.ok(url.pathname.includes('/households/'));}
 const response=await originalFetch(local+url.pathname.slice('/storage/v1'.length),{...init,headers});
 if(!response.ok)console.error(JSON.stringify({localStorageStatus:response.status,localStorageError:(await response.clone().text()).slice(0,2000)}));
 if(init.method==='POST'&&mode==='lost-response'){assert.equal(response.ok,true);await response.arrayBuffer();throw Error('Synthetic lost response after actual Storage commit');}
 if(init.method==='POST'&&mode==='held-response'){assert.equal(response.ok,true);const body=await response.arrayBuffer();entered();await new Promise(r=>{release=r;});return new Response(body,{status:response.status,headers:response.headers});}
 return response;
};
try{
 await db.connect();
 await db.query(readFileSync('supabase/migrations/20261016174056_ouchi_retired_attachment_ids.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261016174506_ouchi_reviewed_file_cleanup_observation.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261016175505_ouchi_reviewed_file_finalization.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261016180316_ouchi_reviewed_cleanup_prelude.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261016181203_ouchi_deletion_tail_checkpoints.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261016183107_ouchi_closure_submission_progress.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261016191435_ouchi_closure_read_custody.sql','utf8'));
 // Explicit SYNTHETIC custody deadline, not an adopted production policy.
 await db.query('update maintenance_private.closure_read_policy set enabled=true,lifetime_seconds=3600');
 const seed=(await db.query('select user_id,app_epoch_id,source_descriptor from maintenance_private.household_copy_intents limit 1')).rows[0];assert.ok(seed);
 const userID=seed.user_id,epochID=seed.app_epoch_id,productID=seed.source_descriptor.productID;
 const session=(await db.query('select id from auth.sessions where user_id=$1 order by created_at desc limit 1',[userID])).rows[0].id;
 await db.query('set role service_role');const reviewRequestID=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[userID,session,epochID,randomUUID()])).rows[0].receipt.reviewRequestID;await db.query('reset role');
 const connection=createDedicatedPostgresConnection({createClient:bounds=>new Client({...options,...bounds,user:'ouchi_file_operator_ci_login',password:'synthetic-file-review-ci-only'})});
 const connect=async opts=>{const c=await connection(opts);return {...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql==='BEGIN')await c.query('set local role ouchi_closure_operator');return result;}};};
 const admin=createClient(local,serviceJWT,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,local);assert.ok(url.pathname.startsWith('/storage/v1/'));return originalFetch(local+url.pathname.slice('/storage/v1'.length)+url.search,init);}}});
 assert.equal((await admin.storage.createBucket(bucket,{public:false})).error,null);
 const bytes=Buffer.from('%PDF-1.7\nActual disposable Storage service copy\n'),sha=createHash('sha256').update(bytes).digest('hex'),scope={userID,epochID,reviewRequestID};
 const review=createClosureOperatorReview({connect,readFileBytes:async()=>new Blob([bytes],{type:'application/pdf'})}),port=createHouseholdCopy({connect,storage:createHouseholdCopyStorage({projectID,secretKey})});
 async function prepare(){
  const fileID=randomUUID(),sourcePath=`${userID}/${epochID}/${fileID}.pdf`;
  await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[fileID,userID,epochID,productID,bytes.length,sha]);
  await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),userID,epochID]);
  await db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),sourcePath,bytes.length,'upload']);
  assert.equal((await admin.storage.from(bucket).upload(sourcePath,new Blob([bytes],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error,null);
  const row=(await review.fileInventory({...scope,afterFile:null},signal)).items.find(v=>v.attachment_id===fileID);assert.ok(row);
  const inspected=await review.inspectFile({...scope,fileID,inspectionID:randomUUID(),expectedMetadataDigest:row.metadata_digest},signal),decisionID=randomUUID();
  await review.recordFileDecision({...scope,fileID,inspectionID:inspected.inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
  const input={...scope,fileID,decisionID,intentID:randomUUID(),destinationID:randomUUID()},operation={...scope,intentID:input.intentID},manifest=await port.prepare(input,signal);return {input,operation,manifest,sourcePath};
 }
 async function preserved(f){
  const source=await admin.storage.from(bucket).download(f.sourcePath);assert.equal(source.error,null);assert.deepEqual(Buffer.from(await source.data.arrayBuffer()),bytes);
  const dest=await admin.storage.from(bucket).download(f.manifest.destination.objectPath);assert.equal(dest.error,null);assert.deepEqual(Buffer.from(await dest.data.arrayBuffer()),bytes);
  assert.equal((await db.query('select state from maintenance_private.household_attachments where id=$1',[f.input.destinationID])).rows[0].state,'staged');
 }
 const first=await prepare();assert.equal((await port.copy(first.operation,signal)).state,'copy_verified');assert.equal(postCount,1);await port.copy(first.operation,signal);assert.equal(postCount,1);await preserved(first);cases.push('real Storage filesystem and metadata plus actual restricted SQL: measured copy succeeds, repeat is read-only, source remains and destination stays staged');
 // Test-only privileged activation, not a shipping activation dispatcher.
 await db.query("update maintenance_private.household_attachments set state='active' where id=$1",[first.input.destinationID]);
 const {createClosureHouseholdFileStorageReader}=await import(compile('closure-household-file-storage-reader'));
 const householdReview=createClosureHouseholdFileReview({connect,readFileBytes:createClosureHouseholdFileStorageReader({projectID,secretKey})});
 const householdRow=(await householdReview.fileInventory({...scope,afterFile:null},signal)).items.find(f=>f.attachment_id===first.input.destinationID);assert.ok(householdRow);
 const householdRead={...scope,fileID:householdRow.attachment_id,expectedMetadataDigest:householdRow.metadata_digest},householdInspectionID=randomUUID();
 const householdInspection=await householdReview.inspectFile({...householdRead,inspectionID:householdInspectionID},signal);assert.equal(householdInspection.subjectConfirmed,false);assert.deepEqual(Buffer.from(await householdInspection.content.arrayBuffer()),bytes);
 const householdDecisionID=randomUUID();await householdReview.recordFileDecision({...scope,fileID:householdRead.fileID,inspectionID:householdInspectionID,decisionID:householdDecisionID,action:'needs_review',evidenceDigest:'a'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'},signal);
 assert.equal((await householdReview.readFileDecision(householdRead,signal)).decisionID,householdDecisionID);
 cases.push('real restricted SQL holds household file scope through shipping bounded SDK private GET and measured inspection receipt; review decision records without source removal or erasure claim; activation is privileged fixture only');

 const lost=await prepare();mode='lost-response';await assert.rejects(port.copy(lost.operation,signal));assert.equal((await port.status(lost.operation,signal)).writerState,'issued');assert.equal((await port.copy(lost.operation,signal)).state,'pending');assert.equal(postCount,2);await preserved(lost);cases.push('actual Storage accepted bytes but transport lost response: durable issued writer blocks another POST even though destination matches');
 const held=await prepare();mode='held-response';const gate=new Promise(r=>{entered=r;}),abort=new AbortController(),running=port.copy(held.operation,abort.signal);await gate;abort.abort(Error('caller closed'));await assert.rejects(running,/caller closed/);release();
 assert.equal((await port.status(held.operation,signal)).writerState,'issued');assert.equal((await port.copy(held.operation,signal)).state,'pending');assert.equal(postCount,3);await preserved(held);cases.push('caller cancellation while real Storage response is withheld leaves the persisted writer issued, prevents retry and preserves actual original/copy bytes');
 assert.equal((await db.query('select count(*)::int n from maintenance_private.household_copy_writes where phase=\'issued\'')).rows[0].n,2);
 // Separate clean synthetic household proves the positive seal path in real
 // PostgreSQL. Review intake here is an explicit privileged fixture, not Auth.
 const cleanUser=randomUUID(),cleanEpoch=randomUUID(),cleanReview=randomUUID(),cleanHome=randomUUID(),cleanProduct=randomUUID();
 await db.query('insert into auth.users(id,email) values($1,$2)',[cleanUser,randomUUID()+'@example.invalid']);await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[cleanUser,cleanEpoch]);
 await db.query('insert into public.homes(id,owner_id) values($1,$2)',[cleanHome,cleanUser]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[cleanProduct,cleanHome,'air','Synthetic clean product']);
 await db.query('insert into maintenance_private.account_closure_reviews(review_request_id,user_id,app_epoch_id,submission_id) values($1,$2,$3,$4)',[cleanReview,cleanUser,cleanEpoch,randomUUID()]);
 const coverage=createClosureReviewCoverage({connect}),coverageScope={planID:randomUUID(),reviewRequestID:cleanReview,userID:cleanUser,epochID:cleanEpoch};
 const captured=await coverage.capture({...coverageScope,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},signal);assert.equal(captured.current,true);
 const beforeRedaction=await coverage.page({...coverageScope,afterKey:null},signal),category=beforeRedaction.items.find(i=>i.field_name==='categoryId');assert.ok(category);
 const redact={...coverageScope,eventID:randomUUID(),itemKey:category.item_key,expectedDigest:category.content_digest,replacement:'reviewed-air',confirmation:'REDACT_REVIEWED_COVERAGE_TEXT'};
 await coverage.redactText(redact,signal);assert.equal((await coverage.status(coverageScope,signal)).current,false);
 await db.query('update public.products set "categoryId"=$1 where id=$2',['Later family category',cleanProduct]);await coverage.redactText(redact,signal);assert.equal((await db.query('select "categoryId" from public.products where id=$1',[cleanProduct])).rows[0].categoryId,'Later family category');
 const oldCoveragePlan=coverageScope.planID;coverageScope.planID=randomUUID();await coverage.capture({...coverageScope,replacesPlanID:oldCoveragePlan,confirmation:'REPLACE_COMPLETE_SCOPED_REVIEW'},signal);
 const page=await coverage.page({...coverageScope,afterKey:null},signal);assert.equal(page.hasMore,false);
 for(const item of page.items){if(item.kind!=='text')continue;const full=await coverage.readText({...coverageScope,itemKey:item.item_key},signal);assert.equal(full.digest,item.content_digest);await coverage.recordTextDecision({...coverageScope,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);}
 const seal=await coverage.seal({...coverageScope,eventID:randomUUID(),evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},signal);assert.equal(seal.state,'sealed');assert.equal(seal.current,true);assert.equal(seal.mutationAuthorized,false);
 await db.query('update public.products set memo=$1 where id=$2',['Later synthetic personal information',cleanProduct]);assert.equal((await coverage.status(coverageScope,signal)).current,false);
 cases.push('real restricted PostgreSQL coverage redaction retry preserves later family edit; recaptured full scope accepts explicit text decisions and immutable seal, later new text makes it stale, never a deletion permit');
 // Current no-attachment MVP path: genuine concurrent Data API roles,
 // GoTrue sessions and restricted operator retirement. Storage remains untouched.
 const authPort=Number(process.env.OUCHI_TEST_AUTH_PORT);assert.ok(Number.isInteger(authPort)&&authPort>1024&&authPort<65536);
 async function actor(){
  const email=randomUUID()+'@example.invalid',password=randomUUID()+'aA7!';
  const response=await originalFetch(`http://127.0.0.1:${authPort}/signup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.ok,true);const data=await response.json(),claims=JSON.parse(Buffer.from(data.access_token.split('.')[1],'base64url')),a={id:data.user.id,session:claims.session_id,epoch:randomUUID(),token:data.access_token,email,password};
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[a.id,a.epoch]);await db.query('insert into maintenance_private.account_access values($1,true)',[a.id]);await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[a.session,a.id,a.epoch]);return a;
 }
 const departing=await actor(),family=await actor(),retireHome=randomUUID(),retireProduct=randomUUID();
 await db.query('insert into public.homes(id,owner_id) values($1,$2)',[retireHome,departing.id]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[retireProduct,retireHome,'air','Synthetic retirement product']);await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[retireHome,family.id,'Synthetic remaining family']);
 await db.query('set role service_role');const retirementReview=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[departing.id,departing.session,departing.epoch,randomUUID()])).rows[0].receipt.reviewRequestID;await db.query('reset role');
 await db.query('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true');
 let retirementScope={planID:randomUUID(),reviewRequestID:retirementReview,userID:departing.id,epochID:departing.epoch};
 async function sealRetirement(replacesPlanID=null){
  await coverage.capture({...retirementScope,replacesPlanID,confirmation:replacesPlanID===null?'CAPTURE_COMPLETE_SCOPED_REVIEW':'REPLACE_COMPLETE_SCOPED_REVIEW'},signal);
  const page=await coverage.page({...retirementScope,afterKey:null},signal);assert.equal(page.hasMore,false);
  for(const item of page.items)if(item.kind==='text')await coverage.recordTextDecision({...retirementScope,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
  const sealEventID=randomUUID();await coverage.seal({...retirementScope,eventID:sealEventID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},signal);return sealEventID;
 }
 const retiredPort=createReviewedRetirement({connect}),firstSeal=await sealRetirement();
 const familyWriter=new Client({...options,application_name:'ouchi_retirement_family_write'}),closedWriter=new Client({...options,application_name:'ouchi_retirement_closed_write'}),oldSnapshot=new Client({...options,application_name:'ouchi_retirement_old_snapshot'});
 await familyWriter.connect();await closedWriter.connect();await oldSnapshot.connect();let releaseRetirement,retiring;
 async function authenticate(c,a){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:a.id,session_id:a.session,role:'authenticated'})]);}
 async function waitLock(name){let waited=false;for(let n=0;n<60;n++){waited=(await db.query("select exists(select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock') waiting",[name])).rows[0].waiting;if(waited)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waited,true);}
 try{
  await authenticate(familyWriter,family);await familyWriter.query('begin');assert.equal((await familyWriter.query('update public.products set memo=$1 where id=$2',['Concurrent family note',retireProduct])).rowCount,1);
  const staleInput={...retirementScope,eventID:randomUUID(),sealEventID:firstSeal,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'};
  const blocked=retiredPort.execute(staleInput,signal).then(value=>({value}),error=>({error}));
  let observed=false;for(let n=0;n<60;n++){observed=(await db.query("select exists(select 1 from pg_stat_activity where usename='ouchi_file_operator_ci_login' and query like '%execute_reviewed_retirement%' and wait_event_type='Lock') waiting")).rows[0].waiting;if(observed)break;await new Promise(r=>setTimeout(r,10));}assert.equal(observed,true);
  await familyWriter.query('commit');const stale=await blocked;assert.match(stale.error?.message??'',/Sealed review changed/);assert.equal((await db.query('select owner_id from public.homes where id=$1',[retireHome])).rows[0].owner_id,departing.id);
  const priorPlan=retirementScope.planID;retirementScope={...retirementScope,planID:randomUUID()};const freshSeal=await sealRetirement(priorPlan),input={...retirementScope,eventID:randomUUID(),sealEventID:freshSeal,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'};
  await authenticate(oldSnapshot,departing);await oldSnapshot.query('begin isolation level repeatable read');assert.equal((await oldSnapshot.query('select id from public.products where id=$1',[retireProduct])).rowCount,1);
  let reached;const enteredRetirement=new Promise(r=>{reached=r;}),heldPort=createReviewedRetirement({connect:async opts=>{const c=await connect(opts);return {...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql.includes('execute_reviewed_retirement')){reached();await new Promise(r=>{releaseRetirement=r;});}return result;}};}});
  retiring=heldPort.execute(input,signal);void retiring.catch(()=>{});await enteredRetirement;
  await authenticate(closedWriter,departing);const staleWrite=closedWriter.query('update public.products set memo=$1 where id=$2',['Must not apply',retireProduct]).then(r=>({rowCount:r.rowCount}),error=>({error}));await waitLock('ouchi_retirement_closed_write');releaseRetirement();const detached=await retiring;assert.equal(detached.detachedHomeCount,1);assert.equal(detached.accountErasureConfirmed,false);
  const denied=await staleWrite;assert.ok(denied.rowCount===0||/App account closed/.test(denied.error?.message??''));await assert.rejects(oldSnapshot.query('update public.products set memo=$1 where id=$2',['Stale snapshot overwrite',retireProduct]),/Fresh app writes require read committed/);await oldSnapshot.query('rollback');
  assert.equal((await db.query('select memo from public.products where id=$1',[retireProduct])).rows[0].memo,'Concurrent family note');assert.equal((await db.query('select owner_id from public.homes where id=$1',[retireHome])).rows[0].owner_id,null);
  assert.equal((await familyWriter.query('update public.products set memo=$1 where id=$2',['After retirement family edit',retireProduct])).rowCount,1);
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[departing.id])).rows[0].n,1);assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[input.eventID])).rows[0].state,'pending');
  const statusScope={...input};delete statusScope.confirmation;assert.equal((await retiredPort.status(statusScope,signal)).deletionRequestID,input.eventID);
  await db.query('set role service_role');await assert.rejects(db.query('select * from public.claim_maintenance_push_test($1,$2)',[departing.id,'https://web.push.apple.com/synthetic-retirement-fixture']),/App account closed/);await db.query('reset role');
  cases.push('real Auth plus concurrent authenticated writers: retirement waits and rejects a changed seal; fresh retirement preserves family home/data, blocks queued departing-writer and stale RR writes, while remaining family can edit; queued job only, no global Auth deletion');
 }finally{releaseRetirement?.();if(retiring)await retiring.catch(()=>{});await familyWriter.end();await closedWriter.end();await oldSnapshot.end();}
 // Complete source->verified staged clone->classification using actual
 // Storage reads. This must not activate a file or bypass retirement guards.
 mode='normal';const copyOwner=await actor(),copyFamily=await actor(),copyHome=randomUUID(),copyProduct=randomUUID(),sourceFileID=randomUUID();
 await db.query('insert into public.homes(id,owner_id) values($1,$2)',[copyHome,copyOwner.id]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[copyProduct,copyHome,'air','Synthetic staged-copy product']);await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[copyHome,copyFamily.id,'Synthetic copy family']);
 const actualSourcePath=`${copyOwner.id}/${copyOwner.epoch}/${sourceFileID}.pdf`;
 await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[sourceFileID,copyOwner.id,copyOwner.epoch,copyProduct,bytes.length,sha]);
 await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[sourceFileID,randomUUID(),copyOwner.id,copyOwner.epoch]);
 await db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),actualSourcePath,bytes.length,'upload']);assert.equal((await admin.storage.from(bucket).upload(actualSourcePath,new Blob([bytes],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error,null);
 await db.query('set role service_role');const fileReviewID=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[copyOwner.id,copyOwner.session,copyOwner.epoch,randomUUID()])).rows[0].receipt.reviewRequestID;await db.query('reset role');
 const fileScope={reviewRequestID:fileReviewID,userID:copyOwner.id,epochID:copyOwner.epoch},{createClosureFileStorageReader}=await import(compile('closure-file-storage-reader')),sourceReview=createClosureOperatorReview({connect,readFileBytes:createClosureFileStorageReader({projectID,secretKey})});
 const fileRow=(await sourceReview.fileInventory({...fileScope,afterFile:null},signal)).items[0],sourceInspectionID=randomUUID(),sourceDecisionID=randomUUID();await sourceReview.inspectFile({...fileScope,fileID:sourceFileID,expectedMetadataDigest:fileRow.metadata_digest,inspectionID:sourceInspectionID},signal);
 await sourceReview.recordFileDecision({...fileScope,fileID:sourceFileID,inspectionID:sourceInspectionID,decisionID:sourceDecisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
 const cloneInput={...fileScope,fileID:sourceFileID,decisionID:sourceDecisionID,intentID:randomUUID(),destinationID:randomUUID()},cloneOp={...fileScope,intentID:cloneInput.intentID};await port.prepare(cloneInput,signal);assert.equal((await port.copy(cloneOp,signal)).state,'copy_verified');
 const cloneCoverage={...fileScope,planID:randomUUID()};await coverage.capture({...cloneCoverage,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},signal);const clonePage=await coverage.page({...cloneCoverage,afterKey:null},signal);assert.equal(clonePage.hasMore,false);
 for(const item of clonePage.items)if(item.kind==='text')await coverage.recordTextDecision({...cloneCoverage,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
 const cloneSealID=randomUUID();assert.equal((await coverage.seal({...cloneCoverage,eventID:cloneSealID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},signal)).current,true);
 const cloneBinding=(await db.query('select bindings from maintenance_private.closure_coverage_plans where plan_id=$1',[cloneCoverage.planID])).rows[0].bindings.find(i=>i.kind==='household_file');assert.equal(cloneBinding.preparedCopy.sourceDecisionID,sourceDecisionID);assert.equal(cloneBinding.preparedCopy.intentID,cloneInput.intentID);
 assert.equal((await db.query('select state from maintenance_private.household_attachments where id=$1',[cloneInput.destinationID])).rows[0].state,'staged');await db.query('set role service_role');assert.equal((await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[copyFamily.id,copyFamily.session,copyFamily.epoch,cloneInput.destinationID])).rows[0].item,null);await db.query('reset role');
 await assert.rejects(retiredPort.execute({...cloneCoverage,eventID:randomUUID(),sealEventID:cloneSealID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},signal),/Attachment retirement executor required/);assert.equal((await db.query('select owner_id from public.homes where id=$1',[copyHome])).rows[0].owner_id,copyOwner.id);
 assert.equal((await admin.storage.from(bucket).download(actualSourcePath)).error,null);assert.equal(postCount,4);
 cases.push('actual Storage source inspection and acknowledged staged clone bind to exact source approval and held capacity, allowing complete scoped classification while file stays hidden and attachment retirement/source removal remain refused');
 // Enabling only the disposable fixture's attachment boundary must activate
 // the exact verified clone and queue typed cleanup without removing a byte.
 await db.query('update maintenance_private.reviewed_retirement_policy set attachments_enabled=true');const photoRetire={...cloneCoverage,eventID:randomUUID(),sealEventID:cloneSealID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'};
 await db.query("create role ouchi_progress_ci_login login password 'synthetic-progress-ci-only';grant ouchi_closure_progress_reader to ouchi_progress_ci_login");
 const progressConnection=createDedicatedPostgresConnection({createClient:bounds=>new Client({...options,...bounds,user:'ouchi_progress_ci_login',password:'synthetic-progress-ci-only'})});
 const {createClosureSubmissionProgressServer}=await import(compile('closure-submission-progress')),{createDeletionReceiptGetUser}=await import(compile('deletion-receipt-auth'));
 const progressGetUser=createDeletionReceiptGetUser({supabaseURL:origin,publishableKey:'sb_publishable_synthetic_progress_only',fetcher:async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,origin);assert.equal(url.pathname,'/auth/v1/user');const response=await originalFetch(`http://127.0.0.1:${authPort}/user`,init);return new Response(response.body,{status:response.status,headers:response.headers});
 }});
 const {createClosureReadCustodyServer}=await import(compile('closure-read-custody'));
 await db.query("create role ouchi_receipt_register_ci_login login password 'synthetic-register-ci-only';grant ouchi_closure_receipt_registrar to ouchi_receipt_register_ci_login;create role ouchi_receipt_read_ci_login login password 'synthetic-read-ci-only';grant ouchi_closure_receipt_reader to ouchi_receipt_read_ci_login");
 const registrarConnection=createDedicatedPostgresConnection({createClient:bounds=>new Client({...options,...bounds,user:'ouchi_receipt_register_ci_login',password:'synthetic-register-ci-only'})});
 const receiptReaderConnection=createDedicatedPostgresConnection({createClient:bounds=>new Client({...options,...bounds,user:'ouchi_receipt_read_ci_login',password:'synthetic-read-ci-only'})});
 let loseRegistrationCommit=true;
 const registrarConnect=async opts=>{const c=await registrarConnection(opts);let registration=false;return {...c,query:async(sql,args)=>{const r=await c.query(sql,args);if(sql.includes('register_closure_read_credential'))registration=true;if(sql==='COMMIT'&&registration&&loseRegistrationCommit){loseRegistrationCommit=false;throw Error('Synthetic receipt registration COMMIT reply lost');}return r;}};};
 const describeRead=createClosureReadCustodyServer({enabled:true,action:'describe',getUser:progressGetUser,connect:registrarConnect});
 const registerRead=createClosureReadCustodyServer({enabled:true,action:'register',getUser:progressGetUser,connect:registrarConnect});
 const readSaved=createClosureReadCustodyServer({enabled:true,action:'status',connect:receiptReaderConnection});
 const custodyRequest=(body,{auth,token}={})=>new Request('https://example.invalid/prepared/closure-read',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{}),...(token?{'x-ouchi-closure-read':token}:{})},body:JSON.stringify(body)});
 const progressServer=createClosureSubmissionProgressServer({enabled:true,connect:progressConnection,getUser:progressGetUser});
 const progressRequest=(actor,scope,submissionID)=>new Request('https://example.invalid/api/account/closure-review/progress',{method:'POST',headers:{authorization:'Bearer '+actor.token,'content-type':'application/json'},body:JSON.stringify({expectedEpochID:scope.epochID,submissionID})});
 const photoSubmission=(await db.query('select submission_id from maintenance_private.account_closure_reviews where review_request_id=$1',[fileScope.reviewRequestID])).rows[0].submission_id;
 let photoReceipt;
 if(process.env.OUCHI_WEB_CUSTODY_REACT_TEST==='true'){
  const {startWebCustodyServiceFixture}=await import('./web-custody-react-service.mjs');
  webCustody=await startWebCustodyServiceFixture({handlers:{describe:createClosureReadCustodyServer({enabled:true,action:'describe',getUser:progressGetUser,connect:registrarConnection}),register:createClosureReadCustodyServer({enabled:true,action:'register',getUser:progressGetUser,connect:registrarConnection}),status:readSaved},scope:{account:copyOwner.id,epochID:fileScope.epochID,submissionID:photoSubmission,requestID:photoRetire.eventID},actor:copyOwner,db,authPort,fetcher:originalFetch,beforeRegistration:async browserSessionID=>{
   // Explicit privileged fixture for a previously enrolled browser session.
   // No late post-retirement session is granted access or inserted in receipts.
   assert.equal((await db.query('select user_id from auth.sessions where id=$1',[browserSessionID])).rows[0].user_id,copyOwner.id);
   await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[browserSessionID,copyOwner.id,fileScope.epochID]);
   photoReceipt=await retiredPort.execute(photoRetire,signal);
  }});
  cases.push('actual shipping CloudAccount and Supabase SDK login/restore/local logout with disposable GoTrue, pre-retirement fixture session binding captured by actual retirement, shipping encrypted browser vault and custody UI through restricted PostgreSQL; lost registration acknowledgement retains original key and no-Auth UI reads pending status, unrelated original Auth session remains');
 }else photoReceipt=await retiredPort.execute(photoRetire,signal);
 assert.equal(photoReceipt.detachedHomeCount,1);assert.equal(photoReceipt.accountErasureConfirmed,false);assert.equal((await db.query('select owner_id from public.homes where id=$1',[copyHome])).rows[0].owner_id,null);
 const firstProgress=await progressServer(progressRequest(copyOwner,fileScope,photoSubmission));assert.equal(firstProgress.status,200);assert.deepEqual(await firstProgress.json(),{kind:'app-closure-progress/v1',state:'pending',requestID:photoRetire.eventID,epochID:fileScope.epochID,submissionID:photoSubmission});
 assert.equal((await progressServer(progressRequest(copyFamily,fileScope,photoSubmission))).status,404);assert.equal((await progressServer(progressRequest(copyOwner,fileScope,randomUUID()))).status,404);
 const sessionLocker=new Client(options);await sessionLocker.connect();let lockedReady;const locked=new Promise(resolve=>{lockedReady=resolve;});
 try{
  const deadlineServer=createClosureSubmissionProgressServer({enabled:true,connect:progressConnection,getUser:async(token,signal)=>{const verified=await progressGetUser(token,signal);assert.equal(verified.error,null);await db.query("update auth.sessions set not_after=clock_timestamp()+interval '250 milliseconds' where id=$1",[copyOwner.session]);await sessionLocker.query('begin');await sessionLocker.query('select id from auth.sessions where id=$1 for update',[copyOwner.session]);lockedReady();return verified;}});
  const delayed=deadlineServer(progressRequest(copyOwner,fileScope,photoSubmission));await locked;let waited=false;
  for(let i=0;i<60;i++){const activity=(await db.query("select count(*)::int n from pg_stat_activity where usename='ouchi_progress_ci_login' and wait_event_type='Lock'")).rows[0].n;if(activity){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(waited,true);await new Promise(resolve=>setTimeout(resolve,350));await sessionLocker.query('commit');assert.equal((await delayed).status,404);
 }finally{await sessionLocker.query('rollback');await sessionLocker.end();await db.query('update auth.sessions set not_after=null where id=$1',[copyOwner.session]);}
 cases.push('real Auth verification precedes an unchanged original-session row lock wait across not_after; fresh SQL clock recheck refuses progress after deadline even though the queued read began while session was valid');

 const custodyBase={requestID:photoRetire.eventID,expectedEpochID:fileScope.epochID,submissionID:photoSubmission};
 const windowResponse=await describeRead(custodyRequest(custodyBase,{auth:copyOwner.token}));assert.equal(windowResponse.status,200);const readWindow=await windowResponse.json();
 const readCredentialID=randomUUID(),readToken=Buffer.alloc(32,43).toString('base64url'),readBody={...custodyBase,credentialID:readCredentialID},registrationBody={...readBody,expiresAt:readWindow.expiresAt};
 assert.equal((await describeRead(custodyRequest(custodyBase,{auth:copyFamily.token}))).status,404);
 assert.equal((await registerRead(custodyRequest(registrationBody,{auth:copyOwner.token,token:readToken}))).status,503);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_read_credentials where request_id=$1',[photoRetire.eventID])).rows[0].n,webCustody?2:1);
 const registeredRead=await registerRead(custodyRequest(registrationBody,{auth:copyOwner.token,token:readToken}));assert.equal(registeredRead.status,200);assert.equal((await registeredRead.json()).registered,true);
 assert.equal((await readSaved(custodyRequest(readBody,{token:readToken}))).status,200);
 assert.equal((await readSaved(custodyRequest(readBody,{token:Buffer.alloc(32,44).toString('base64url')}))).status,404);
 for(const field of ['expectedEpochID','submissionID','requestID','credentialID'])assert.equal((await readSaved(custodyRequest({...readBody,[field]:randomUUID()},{token:readToken}))).status,404);
 for(const [connection,table] of [[registrarConnection,'auth.sessions'],[receiptReaderConnection,'maintenance_private.closure_read_credentials']]){const c=await connection({signal});try{await assert.rejects(c.query('select * from '+table),/permission denied/);}finally{await c.close();}}
 cases.push('real GoTrue bearer and separate minimum registrar/reader logins register an Ouchi-only saved device token; lost COMMIT reply returns unconfirmed then exact saved-token retry succeeds; wrong token/job/epoch/submission/device refused and no raw Auth/credential access');
 const custodyLocker=new Client(options);await custodyLocker.connect();
 try{
  let authReady;const waiting=new Promise(resolve=>{authReady=resolve;});
  const delayedRegister=createClosureReadCustodyServer({enabled:true,action:'register',connect:registrarConnection,getUser:async(token,signal)=>{const result=await progressGetUser(token,signal);assert.equal(result.error,null);await db.query("update auth.sessions set not_after=clock_timestamp()+interval '250 milliseconds' where id=$1",[copyOwner.session]);await custodyLocker.query('begin');await custodyLocker.query('select request_id from maintenance_private.closure_read_windows where request_id=$1 for update',[photoRetire.eventID]);authReady();return result;}});
  const registering=delayedRegister(custodyRequest({...registrationBody,credentialID:randomUUID()},{auth:copyOwner.token,token:readToken}));await waiting;
  let waited=false;for(let i=0;i<60;i++){if((await db.query("select count(*)::int n from pg_stat_activity where usename='ouchi_receipt_register_ci_login' and wait_event_type='Lock'")).rows[0].n){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(waited,true);
  await new Promise(resolve=>setTimeout(resolve,350));await custodyLocker.query('commit');assert.equal((await registering).status,404);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_read_credentials where request_id=$1',[photoRetire.eventID])).rows[0].n,webCustody?2:1);
  assert.equal((await readSaved(custodyRequest(readBody,{token:readToken}))).status,200);
  cases.push('actual registrar waits on unchanged window row while original Auth session crosses deadline; post-lock fresh Auth clock refuses registration, while previously saved capability still reads without Auth and does not remove shared session');
 }finally{await custodyLocker.query('rollback');await db.query('update auth.sessions set not_after=null where id=$1',[copyOwner.session]);}
 try{
  await db.query("update maintenance_private.closure_read_windows set expires_at=clock_timestamp()+interval '250 milliseconds' where request_id=$1",[photoRetire.eventID]);await custodyLocker.query('begin');await custodyLocker.query('select request_id from maintenance_private.closure_read_windows where request_id=$1 for update',[photoRetire.eventID]);
  const reading=readSaved(custodyRequest(readBody,{token:readToken}));let waited=false;for(let i=0;i<60;i++){if((await db.query("select count(*)::int n from pg_stat_activity where usename='ouchi_receipt_read_ci_login' and wait_event_type='Lock'")).rows[0].n){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(waited,true);
  await new Promise(resolve=>setTimeout(resolve,350));await custodyLocker.query('commit');assert.equal((await reading).status,404);
  cases.push('actual capability reader waits on unchanged window lock across expiry then fresh clock refuses status; no stale deadline or completed flag is accepted');
 }finally{await custodyLocker.query('rollback');await custodyLocker.end();await db.query('update maintenance_private.closure_read_windows set expires_at=$2 where request_id=$1',[photoRetire.eventID,readWindow.expiresAt]);}
 if(process.env.OUCHI_WEB_CUSTODY_SERVICE_TEST==='true'&&!webCustody){
  const {startWebCustodyServiceFixture}=await import(process.env.OUCHI_WEB_CUSTODY_REACT_TEST==='true'?'./web-custody-react-service.mjs':'./web-custody-local-service.mjs');
  webCustody=await startWebCustodyServiceFixture({handlers:{describe:describeRead,register:registerRead,status:readSaved},scope:{account:copyOwner.id,epochID:fileScope.epochID,submissionID:photoSubmission,requestID:photoRetire.eventID},actor:copyOwner,db,authPort,fetcher:originalFetch});
  cases.push('actual browser shipping encrypted IndexedDB vault and read client through owned loopback HTTP to shipping custody handlers, real GoTrue bearer and dedicated PostgreSQL registrar/reader: lost committed registration reply retains one original key/deadline, page restart probes without registration retry, no-Auth browser context reads pending status');
 }
 const additional=await Promise.all(Array.from({length:9},()=>registerRead(custodyRequest({...registrationBody,credentialID:randomUUID()},{auth:copyOwner.token,token:readToken}))));assert.equal(additional.filter(r=>r.status===200).length,webCustody?6:7);assert.equal(additional.filter(r=>r.status===503).length,webCustody?3:2);assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_read_credentials where request_id=$1',[photoRetire.eventID])).rows[0].n,8);
 cases.push('nine concurrent actual registrar transactions admit only remaining fixed device credential slots; serialized per-job admission enforces eight total without implicit rotation or expiry extension');


 const typedFiles=(await db.query('select * from maintenance_private.reviewed_retirement_files where request_id=$1',[photoRetire.eventID])).rows;assert.equal(typedFiles.length,2);assert.equal(typedFiles.find(f=>f.kind==='personal_file').state,'pending');assert.equal(typedFiles.find(f=>f.kind==='household_file').uploader_id,null);
 await db.query('set role service_role');const retained=(await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[copyFamily.id,copyFamily.session,copyFamily.epoch,cloneInput.destinationID])).rows[0].item;await db.query('reset role');assert.ok(retained);const retainedBlob=await admin.storage.from(bucket).download(retained.objectPath);assert.equal(retainedBlob.error,null);assert.deepEqual(Buffer.from(await retainedBlob.data.arrayBuffer()),bytes);assert.equal((await admin.storage.from(bucket).download(actualSourcePath)).error,null);
 const householdOrigin=(await db.query('select * from maintenance_private.household_attachment_origins where attachment_id=$1',[cloneInput.destinationID])).rows[0];assert.equal(householdOrigin.sha256,sha);assert.equal(Object.hasOwn(householdOrigin,'user_id'),false);
 await assert.rejects(db.query('update maintenance_private.household_attachments set removal_pending=true where id=$1',[cloneInput.destinationID]),/cleanup dependency/);assert.equal((await retiredPort.execute(photoRetire,signal)).deletionRequestID,photoRetire.eventID);assert.equal(postCount,4);
 cases.push('real Auth/Storage/PostgreSQL checked photo activation and owner detachment commit with typed pending source cleanup; remaining family reads identical bytes after departure, original still exists and dependent destination cannot be removed; no completed erasure claim');
 // Transport-only synthetic source objects: these are NOT the queued retirement
 // original above, and never authorize SQL metadata/capacity finalization.
 const {createReviewedFileCleanupStorage}=await import(compile('reviewed-file-cleanup-storage'));
 const cleanup=createReviewedFileCleanupStorage({projectID,secretKey}),heldCapacityBefore=(await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n;
 const queuedBefore=(await db.query("select count(*)::int n from maintenance_private.reviewed_retirement_files where state='pending'")).rows[0].n;
 const routedFetch=globalThis.fetch;
 async function transportManifest(){
  const attachmentID=randomUUID(),objectPath=`${copyOwner.id}/${copyOwner.epoch}/${attachmentID}.pdf`;
  assert.equal((await admin.storage.from(bucket).upload(objectPath,new Blob([bytes],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error,null);
  return {requestID:randomUUID(),kind:'personal_file',homeInstanceID:retained.homeInstanceID,
   source:{attachmentID,uploaderID:copyOwner.id,uploaderEpoch:copyOwner.epoch,objectPath,sizeBytes:bytes.length,mime:'application/pdf',sha256:sha},
   retained:{attachmentID:cloneInput.destinationID,objectPath:retained.objectPath,sizeBytes:bytes.length,mime:'application/pdf',sha256:sha}};
 }
 for(const lostResponse of [false,true]){
  const m=await transportManifest();let deletes=0;
  globalThis.fetch=async(input,init)=>{const response=await routedFetch(input,init);if(init.method==='DELETE'){deletes++;assert.deepEqual(JSON.parse(init.body),{prefixes:[m.source.objectPath]});if(lostResponse){assert.equal(response.ok,true);await response.arrayBuffer();throw Error('Synthetic lost DELETE response after actual Storage commit');}}return response;};
  assert.deepEqual(await cleanup.cleanup(m,signal),{sourceAbsenceObserved:true,deleteAcknowledged:!lostResponse,capacityReleaseAuthorized:false});
  assert.equal(deletes,1);assert.equal((await cleanup.cleanup(m,signal)).deleteAcknowledged,false);assert.equal(deletes,1);
  const missing=await admin.storage.from(bucket).download(m.source.objectPath);assert.equal(missing.error?.code,'NoSuchKey');
  assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(retained.objectPath)).data.arrayBuffer()),bytes);
  globalThis.fetch=routedFetch;
 }
 cases.push('shipping bounded cleanup SDK transport against actual Storage deletes only independent synthetic source objects after measuring retained copy; exact NoSuchKey probe and lost-response replay never reissue DELETE; capacity release always unauthorized, no worker/metadata finalization');
 const bad=await transportManifest();bad.retained.sha256='0'.repeat(64);bad.source.sha256='0'.repeat(64);let badDeletes=0;globalThis.fetch=async(input,init)=>{if(init.method==='DELETE')badDeletes++;return routedFetch(input,init);};
 await assert.rejects(cleanup.cleanup(bad,signal),/content mismatch/);assert.equal(badDeletes,0);assert.equal((await admin.storage.from(bucket).download(bad.source.objectPath)).error,null);globalThis.fetch=routedFetch;
 assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,heldCapacityBefore);assert.equal((await db.query("select count(*)::int n from maintenance_private.reviewed_retirement_files where state='pending'")).rows[0].n,queuedBefore);assert.equal((await admin.storage.from(bucket).download(actualSourcePath)).error,null);
 cases.push('actual retained bytes mismatch prevents DELETE; typed retirement original and pending queue remain intact, held capacity unchanged');
 // An INSERT command whose initial snapshot predates tombstone COMMIT must
 // wait at the shared UUID lock, then take a fresh VOLATILE trigger snapshot.
 const contender=new Client(options);await contender.connect();
 try{
  const retiredID=randomUUID(),sourceRow=(await db.query('select * from maintenance_private.product_attachments limit 1')).rows[0];
  await db.query('begin');await db.query('insert into maintenance_private.retired_attachment_ids(attachment_id) values($1)',[retiredID]);
  const pid=(await contender.query('select pg_backend_pid() pid')).rows[0].pid;
  const inserting=contender.query(`insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking)
   values($1,$2,$3,$4,$5,$6,'stored',$7,$8,$8,true)`,[retiredID,sourceRow.user_id,sourceRow.app_epoch_id,sourceRow.product_id,sourceRow.size_bytes,sourceRow.mime,sourceRow.captured_owner_id,sourceRow.sha256]).then(()=>({success:true}),error=>({error}));
  let waiting=false;
  for(let i=0;i<100;i++){const activity=(await db.query('select wait_event from pg_stat_activity where pid=$1',[pid])).rows[0];if(activity?.wait_event==='advisory'){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(waiting,true);await db.query('commit');const admission=await inserting;assert.match(admission.error?.message??'',/cannot be reused/);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[retiredID])).rows[0].n,0);
  // Old RR and serializable snapshots do not receive any reuse permission.
  for(const level of ['repeatable read','serializable']){await contender.query('begin isolation level '+level);await contender.query('select count(*) from maintenance_private.retired_attachment_ids');await assert.rejects(contender.query('insert into maintenance_private.retired_attachment_ids(attachment_id) values($1)',[randomUUID()]),/Fresh attachment identity/);await contender.query('rollback');}
 }finally{await db.query('rollback');await contender.end();}
 cases.push('actual PostgreSQL concurrent INSERT waits for retirement UUID lock; after tombstone COMMIT its fresh trigger rejects reuse despite statement-start snapshot; repeatable-read/serializable tombstone writers refused');
 // Genuine typed source cleanup through a separately provisioned minimum role.
 // No raw tables/Auth grants and no general deletion-worker lease bypass.
 await db.query("create role ouchi_cleanup_ci_login login password 'synthetic-cleanup-ci-only';grant ouchi_retirement_file_executor to ouchi_cleanup_ci_login;insert into maintenance_private.retirement_file_principals values('ouchi_cleanup_ci_login',true)");
 const cleanupConnection=createDedicatedPostgresConnection({createClient:bounds=>new Client({...options,...bounds,user:'ouchi_cleanup_ci_login',password:'synthetic-cleanup-ci-only'})});
 let loseCleanupCommit=true,typedDeletes=0;
 const cleanupConnect=async options=>{const c=await cleanupConnection(options);let observed=false;return {...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql.includes('record_reviewed_file_absence'))observed=true;if(sql==='COMMIT'&&observed&&loseCleanupCommit){loseCleanupCommit=false;throw Error('Synthetic cleanup COMMIT acknowledgement lost');}return result;}};};
 const {createReviewedFileCleanup}=await import('../../lib/reviewed-file-cleanup.mjs');
 const typedCleanup=createReviewedFileCleanup({connect:cleanupConnect,storage:cleanup}),cleanupLease=randomUUID();
 await db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[photoRetire.eventID,cleanupLease]);
 const typedInput={requestID:photoRetire.eventID,userID:copyOwner.id,epochID:copyOwner.epoch,leaseToken:cleanupLease,kind:'personal_file',fileID:sourceFileID};
 globalThis.fetch=async(input,init)=>{if(init.method==='DELETE'){typedDeletes++;assert.deepEqual(JSON.parse(init.body),{prefixes:[actualSourcePath]});}return routedFetch(input,init);};
 assert.equal(await typedCleanup.status(typedInput,signal),null);await assert.rejects(typedCleanup.cleanup(typedInput,signal),/COMMIT acknowledgement lost/);
 const typedReceipt=await typedCleanup.status(typedInput,signal);assert.equal(typedReceipt.sourceAbsenceObserved,true);assert.equal(typedReceipt.deleteAcknowledged,true);assert.equal(typedReceipt.capacityReleaseAuthorized,false);assert.equal(typedReceipt.accountErasureConfirmed,false);
 assert.deepEqual(await typedCleanup.cleanup(typedInput,signal),typedReceipt);assert.equal(typedDeletes,1);assert.equal((await admin.storage.from(bucket).download(actualSourcePath)).error?.code,'NoSuchKey');assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(retained.objectPath)).data.arrayBuffer()),bytes);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,heldCapacityBefore);assert.equal((await db.query("select count(*)::int n from maintenance_private.reviewed_retirement_files where state='pending'")).rows[0].n,queuedBefore);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[sourceFileID])).rows[0].n,1);
 for(const table of ['auth.users','maintenance_private.product_attachments']){const restricted=await cleanupConnection({signal});try{await assert.rejects(restricted.query('select * from '+table),/permission denied/);}finally{await restricted.close();}}
 globalThis.fetch=routedFetch;
 cases.push('real dedicated minimum cleanup login locks exact reviewed job/source/writers/destination, deletes actual retired source through bounded SDK and records API absence; lost COMMIT readback/retry never repeats DELETE, family bytes survive, metadata/queue/capacity remain held and account erasure unconfirmed');
 const {createReviewedFileFinalization}=await import('../../lib/reviewed-file-cleanup.mjs');let loseFinalizationCommit=true;
 const finalizerConnect=async options=>{const c=await cleanupConnection(options);let finalized=false;return {...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql.includes('finalize_reviewed_file'))finalized=true;if(sql==='COMMIT'&&finalized&&loseFinalizationCommit){loseFinalizationCommit=false;throw Error('Synthetic finalization COMMIT acknowledgement lost');}return result;}};};
 const finalizer=createReviewedFileFinalization({connect:finalizerConnect}),heldBytesBefore=(await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes;
 const householdDigest=async()=>(await db.query('select metadata_digest from maintenance_private.closure_review_household_files($1,$2,$3) where attachment_id=$4',[fileScope.reviewRequestID,copyFamily.id,copyFamily.epoch,cloneInput.destinationID])).rows[0].metadata_digest;
 const priorHouseholdDigest=await householdDigest();assert.equal(await finalizer.status(typedInput,signal),null);
 const {createReviewedDeletionPrelude}=await import('../../lib/reviewed-deletion-prelude.mjs');const prelude=createReviewedDeletionPrelude({connect:cleanupConnect,cleanup:typedCleanup,finalization:finalizer}),workerScope={requestID:typedInput.requestID,userID:typedInput.userID,epochID:typedInput.epochID,leaseToken:typedInput.leaseToken};await assert.rejects(prelude.prepare(workerScope,signal),/finalization COMMIT acknowledgement lost/);assert.equal(await prelude.prepare(workerScope,signal),true);const finalizedReceipt=await finalizer.status(typedInput,signal);assert.equal(finalizedReceipt.sourceMetadataErased,true);assert.equal(finalizedReceipt.capacityBytesHeld,true);assert.equal(finalizedReceipt.capacityReleased,false);assert.equal(finalizedReceipt.accountErasureConfirmed,false);assert.deepEqual(await finalizer.finalize(typedInput,signal),finalizedReceipt);assert.equal(typedDeletes,1);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[sourceFileID])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from maintenance_private.household_copy_intents where intent_id=$1',[cloneInput.intentID])).rows[0].n,0);assert.equal(await householdDigest(),priorHouseholdDigest);assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,heldBytesBefore);
 const opaqueHold=(await db.query('select * from maintenance_private.attachment_capacity_quarantine')).rows;assert.equal(opaqueHold.length,1);assert.deepEqual(Object.keys(opaqueHold[0]).sort(),['hold_id','size_bytes']);assert.equal((await db.query('select count(*)::int n from maintenance_private.retired_attachment_ids where attachment_id=$1',[sourceFileID])).rows[0].n,1);
 await db.query('set role service_role');assert.ok((await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[copyFamily.id,copyFamily.session,copyFamily.epoch,cloneInput.destinationID])).rows[0].item);await db.query('reset role');
 assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(retained.objectPath)).data.arrayBuffer()),bytes);
 cases.push('real minimum cleanup role finalizes exact durable source absence atomically: permanent ID tombstone precedes metadata erase, old ACK copy journal is minimized, household origin/digest and family reads survive, physical byte total unchanged in an opaque hold; lost COMMIT returns same receipt without Storage');
 // Exercise existing service stages after typed finalization. These still do
 // not erase shared Auth, finalize identity or mark the account job complete.
 const {runAccountDeletion}=await import(compile('account-deletion-worker')),{storedDeletionDependencies}=await import(compile('account-deletion-worker-store'));const rpcCalls=[];
 const serviceStages={rpc:async(name,args)=>{
  assert.match(name,/^[a-z_]+$/);assert.deepEqual(Object.keys(args).sort(),['target_epoch','target_lease','target_request','target_user']);rpcCalls.push(name);
  await db.query('begin');try{await db.query('set local role service_role');const result=await db.query('select public.'+name+'($1,$2,$3,$4) value',[args.target_request,args.target_user,args.target_epoch,args.target_lease]);await db.query('commit');return {data:result.rows[0].value,error:null};}catch(error){await db.query('rollback');throw error;}
 }};
 let nativeTailCalls=0,identityTailCalls=0;const dependencies=storedDeletionDependencies(serviceStages,{prepareReviewedAttachments:scope=>prelude.prepare(scope,signal),eraseNativeDevices:async()=>{nativeTailCalls++;return false;},finalizeIdentityAndRetention:async()=>{identityTailCalls++;throw Error('Unverified identity tail must not run');},markComplete:async()=>{throw Error('Unverified completion must not run');}},signal);
 assert.deepEqual(await runAccountDeletion(workerScope,dependencies,signal),{state:'pending'});assert.equal(nativeTailCalls,1);assert.equal(identityTailCalls,0);assert.equal(rpcCalls.includes('erase_maintenance_deletion_records'),false);
 // Explicitly exercise the shipping scoped record adapter independently of
 // the unfinished native tail; do not treat that as a completed worker job.
 assert.equal(await dependencies.eraseRecords(workerScope),true);assert.ok(rpcCalls.indexOf('erase_maintenance_deletion_records')<rpcCalls.indexOf('erase_reviewed_retirement_metadata'));assert.ok(rpcCalls.indexOf('erase_reviewed_retirement_metadata')<rpcCalls.indexOf('erase_maintenance_deletion_closure_metadata'));assert.equal(await prelude.prepare(workerScope,signal),true);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[copyOwner.id])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.reviewed_retirement_files where request_id=$1',[typedInput.requestID])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from maintenance_private.retirement_capacity_moves')).rows[0].n,0);assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,heldBytesBefore);assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[typedInput.requestID])).rows[0].state,'running');assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[copyOwner.id])).rows[0].n,1);
 cases.push('shipping worker invokes private reviewed prelude and stops at explicitly unconfigured native tail, without record/identity/completion side effects; independently exercised shipping record adapter erases reviewed references before parent closure review, then prelude resumes via SQL ordinary mode; held bytes and shared Auth preserved, no full-job completion claim');
 const {storedDeletionFinalization}=await import(compile('account-deletion-finalization-store'));
 const fullDependencies=storedDeletionDependencies(serviceStages,storedDeletionFinalization(serviceStages,signal,scope=>prelude.prepare(scope,signal)),signal);
 assert.deepEqual(await runAccountDeletion(workerScope,fullDependencies,signal),{state:'pending'});
 assert.equal((await db.query('select identity_erased,state from maintenance_private.account_deletion_requests where id=$1',[workerScope.requestID])).rows[0].identity_erased,true);assert.equal((await db.query('select count(*)::int n from maintenance_private.deletion_retention_checks where request_id=$1',[workerScope.requestID])).rows[0].n,0);assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[workerScope.requestID])).rows[0].state,'running');
 assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['service_role','maintenance_private.deletion_retention_checks','INSERT'])).rows[0].allowed,false);
 cases.push('actual stored tail confirms server registration absence after canonical erasers, erases only Ouchi identity and then stops on missing sealed retention evidence; runtime cannot insert checker approval, no remote-device wipe or full completion inferred');
 // Explicit privileged SYNTHETIC retention fixture. It proves the technical
 // completion boundary, not adopted production logs/backups/provider policy.
 await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-isolated-ci-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[workerScope.requestID]);
 let dropCompletionResponse=true;const canonicalRPC=serviceStages.rpc;
 serviceStages.rpc=async(name,args)=>{const result=await canonicalRPC(name,args);if(name==='complete_maintenance_account_deletion'&&dropCompletionResponse){assert.equal(result.data,true);dropCompletionResponse=false;throw Error('Synthetic completion response lost after COMMIT');}return result;};
 assert.deepEqual(await runAccountDeletion(workerScope,fullDependencies,signal),{state:'pending'});assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[workerScope.requestID])).rows[0].state,'complete');
 const callsBeforeRecovery=rpcCalls.length;assert.deepEqual(await runAccountDeletion(workerScope,fullDependencies,signal),{state:'complete'});assert.deepEqual(rpcCalls.slice(callsBeforeRecovery),['maintenance_deletion_completion_is_confirmed']);assert.equal(typedDeletes,1);
 const completedJob=(await db.query('select lease_token,receipt_expires_at,updated_at from maintenance_private.account_deletion_requests where id=$1',[workerScope.requestID])).rows[0];assert.equal(completedJob.lease_token,null);assert.equal(completedJob.receipt_expires_at.getTime()-completedJob.updated_at.getTime(),600000);
 assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[copyOwner.id])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[copyOwner.session])).rows[0].n,1);assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,heldBytesBefore);assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(retained.objectPath)).data.arrayBuffer()),bytes);
 const finalProgress=await progressServer(progressRequest(copyOwner,fileScope,photoSubmission));assert.equal(finalProgress.status,200);assert.equal((await finalProgress.json()).state,'complete');assert.equal(finalProgress.headers.get('cache-control'),'no-store');
 const minimalProgress=await progressConnection({signal});try{await assert.rejects(minimalProgress.query('select * from auth.sessions'),/permission denied/);}finally{await minimalProgress.close();}
 cases.push('real GoTrue bearer plus dedicated minimum progress login discovers exact submission job immediately after app enrollment closes, refuses foreign actor/nonce, and still reads canonical completed receipt after review/epoch metadata erasure; no active-enrollment requirement or raw Auth grants');

 await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[copyOwner.session]);
 try{const completed=await readSaved(custodyRequest(readBody,{token:readToken}));assert.equal(completed.status,200);assert.equal((await completed.json()).state,'complete');if(webCustody)await webCustody.verify('complete');}finally{await db.query('update auth.sessions set not_after=null where id=$1',[copyOwner.session]);}
 cases.push('saved capability alone reads canonical completed Ouchi job after reviewed/epoch identity erasure and original Auth session expiry; actual worker completion still requires privileged synthetic retention evidence and never implies local device cleanup');

 // Explicit disposable expiry simulation proves the bridge shares receipt GC.
 await db.query("update maintenance_private.account_deletion_requests set updated_at=clock_timestamp()-interval '20 minutes',receipt_expires_at=clock_timestamp()-interval '10 minutes' where id=$1",[workerScope.requestID]);assert.equal((await progressServer(progressRequest(copyOwner,fileScope,photoSubmission))).status,404);
 await db.query('set role service_role');await db.query('select public.prune_maintenance_completed_deletion_receipts(500)');await db.query('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_submission_jobs where request_id=$1',[workerScope.requestID])).rows[0].n,0);
 cases.push('expired completed receipt is unavailable rather than complete; canonical receipt pruning cascades saved-submission bridge, so minimized review metadata is not retained indefinitely');

 assert.equal((await readSaved(custodyRequest(readBody,{token:readToken}))).status,404);for(const table of ['closure_read_credentials','closure_read_windows'])assert.equal((await db.query('select count(*)::int n from maintenance_private.'+table+' where request_id=$1',[workerScope.requestID])).rows[0].n,0);
 if(webCustody){await webCustody.verify(null);cases.push('actual browser page restart reads canonical complete after app identity erasure and original session expiry; after real SQL receipt pruning the same encrypted credential remains locally but status is unavailable, with no register/describe retry, Auth header or inferred completion');}
 cases.push('canonical completed-job expiry/pruning cascades all eight Ouchi device credentials and anchored window; a still-known token cannot revive or extend status after pruning');

 cases.push('with explicitly privileged synthetic retention evidence, actual worker resumes identity checkpoint, canonical completion commits finite receipt and clears lease; lost final reply recovers completion checkpoint only, without Storage/native/record replay; original shared Auth/session and family bytes survive, physical capacity remains held');
 // Fresh photo-owning actor: one actual worker invocation from queued source
 // metadata through Storage cleanup, scoped records, identity and completion.
 // Retention evidence remains an explicitly privileged synthetic prerequisite.
 {
 mode='normal';const copyOwner=await actor(),copyFamily=await actor(),copyHome=randomUUID(),copyProduct=randomUUID(),sourceFileID=randomUUID();
 await db.query('insert into public.homes(id,owner_id) values($1,$2)',[copyHome,copyOwner.id]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[copyProduct,copyHome,'air','Synthetic staged-copy product']);await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[copyHome,copyFamily.id,'Synthetic copy family']);
 const actualSourcePath=`${copyOwner.id}/${copyOwner.epoch}/${sourceFileID}.pdf`;
 await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[sourceFileID,copyOwner.id,copyOwner.epoch,copyProduct,bytes.length,sha]);
 await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[sourceFileID,randomUUID(),copyOwner.id,copyOwner.epoch]);
 await db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),actualSourcePath,bytes.length,'upload']);assert.equal((await admin.storage.from(bucket).upload(actualSourcePath,new Blob([bytes],{type:'application/pdf'}),{contentType:'application/pdf',upsert:false})).error,null);
 await db.query('set role service_role');const fileReviewID=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[copyOwner.id,copyOwner.session,copyOwner.epoch,randomUUID()])).rows[0].receipt.reviewRequestID;await db.query('reset role');
 const fileScope={reviewRequestID:fileReviewID,userID:copyOwner.id,epochID:copyOwner.epoch},{createClosureFileStorageReader}=await import(compile('closure-file-storage-reader')),sourceReview=createClosureOperatorReview({connect,readFileBytes:createClosureFileStorageReader({projectID,secretKey})});
 const fileRow=(await sourceReview.fileInventory({...fileScope,afterFile:null},signal)).items[0],sourceInspectionID=randomUUID(),sourceDecisionID=randomUUID();await sourceReview.inspectFile({...fileScope,fileID:sourceFileID,expectedMetadataDigest:fileRow.metadata_digest,inspectionID:sourceInspectionID},signal);
 await sourceReview.recordFileDecision({...fileScope,fileID:sourceFileID,inspectionID:sourceInspectionID,decisionID:sourceDecisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
 const cloneInput={...fileScope,fileID:sourceFileID,decisionID:sourceDecisionID,intentID:randomUUID(),destinationID:randomUUID()},cloneOp={...fileScope,intentID:cloneInput.intentID};await port.prepare(cloneInput,signal);assert.equal((await port.copy(cloneOp,signal)).state,'copy_verified');
 const cloneCoverage={...fileScope,planID:randomUUID()};await coverage.capture({...cloneCoverage,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},signal);const clonePage=await coverage.page({...cloneCoverage,afterKey:null},signal);assert.equal(clonePage.hasMore,false);
 for(const item of clonePage.items)if(item.kind==='text')await coverage.recordTextDecision({...cloneCoverage,itemKey:item.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION'},signal);
 const cloneSealID=randomUUID();assert.equal((await coverage.seal({...cloneCoverage,eventID:cloneSealID,evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},signal)).current,true);

 const freshEvent=randomUUID();await retiredPort.execute({...cloneCoverage,eventID:freshEvent,sealEventID:cloneSealID,confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'},signal);
 const freshScope={requestID:freshEvent,userID:copyOwner.id,epochID:copyOwner.epoch,leaseToken:randomUUID()};await db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '10 minutes' where id=$1",[freshEvent,freshScope.leaseToken]);
 await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-isolated-ci-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[freshEvent]);
 const priorHeld=(await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes;
 assert.equal((await admin.storage.from(bucket).download(actualSourcePath)).error,null);assert.equal((await db.query('select records_erased from maintenance_private.account_deletion_requests where id=$1',[freshEvent])).rows[0].records_erased,false);
 if(process.env.OUCHI_DELETION_DISPATCHER_SERVICE_TEST==='true'){
  await db.query("update maintenance_private.account_deletion_requests set state='pending',lease_token=null,lease_until=null,available_at=clock_timestamp()-interval '1 second' where id=$1",[freshEvent]);
  const ready=(await db.query("select id,state,available_at from maintenance_private.account_deletion_requests where attempts<8 and ((state='pending' and available_at<=clock_timestamp()) or (state='running' and lease_until<=clock_timestamp())) order by requested_at,id")).rows;
  // Earlier independent cases leave a disposable pending job. Temporarily
  // postpone that fixture job (no erasure), then restore its exact timestamp.
  const postponed=ready.filter(row=>row.id!==freshEvent);
  for(const row of postponed){assert.equal(row.state,'pending');await db.query("update maintenance_private.account_deletion_requests set available_at=clock_timestamp()+interval '1 hour' where id=$1",[row.id]);}
  const isolated=(await db.query("select id from maintenance_private.account_deletion_requests where attempts<8 and ((state='pending' and available_at<=clock_timestamp()) or (state='running' and lease_until<=clock_timestamp())) order by requested_at,id")).rows;
  assert.deepEqual(isolated.map(row=>row.id),[freshEvent],'Only the explicit fresh disposable job may be claimed in this witness');
  const {createAccountDeletionDispatcher}=await import(compile('account-deletion-dispatcher'));
  const dispatchDB={storage:admin.storage,rpc:async(name,args)=>{
   if(name!=='claim_maintenance_account_deletion')return serviceStages.rpc(name,args);
   assert.equal(args,undefined);rpcCalls.push(name);await db.query('set role service_role');
   try{return {data:(await db.query('select public.claim_maintenance_account_deletion() value')).rows[0].value,error:null};}finally{await db.query('reset role');}
  }};
  const dispatcher=createAccountDeletionDispatcher({clientForRun:()=>dispatchDB,prepareReviewedAttachments:(scope,boundedSignal)=>prelude.prepare(scope,boundedSignal)});
  assert.deepEqual(await dispatcher.runNext(signal),{state:'complete'});
  assert.equal((await db.query('select attempts from maintenance_private.account_deletion_requests where id=$1',[freshEvent])).rows[0].attempts,1);
  assert.deepEqual(await dispatcher.runNext(signal),{state:'idle'});
  for(const row of postponed){await db.query('update maintenance_private.account_deletion_requests set available_at=$2 where id=$1',[row.id,row.available_at]);assert.equal((await db.query('select available_at from maintenance_private.account_deletion_requests where id=$1',[row.id])).rows[0].available_at.getTime(),row.available_at.getTime());}
  cases.push('Actual PostgreSQL service-only queue claim flows through the shipping dispatcher and reviewed prelude to canonical completion in one bounded invocation; second claim is idle, same synthetic file/Auth/family assertions follow');
 }else{
  assert.deepEqual(await runAccountDeletion(freshScope,fullDependencies,signal),{state:'complete'});
 }
 const freshJob=(await db.query('select state,identity_erased,records_erased from maintenance_private.account_deletion_requests where id=$1',[freshEvent])).rows[0];assert.deepEqual(freshJob,{state:'complete',identity_erased:true,records_erased:true});assert.equal((await admin.storage.from(bucket).download(actualSourcePath)).error?.code,'NoSuchKey');assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[sourceFileID])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.reviewed_retirement_files where request_id=$1',[freshEvent])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from maintenance_private.household_copy_intents where intent_id=$1',[cloneInput.intentID])).rows[0].n,0);assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,priorHeld);
 await db.query('set role service_role');const visible=(await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[copyFamily.id,copyFamily.session,copyFamily.epoch,cloneInput.destinationID])).rows[0].item;await db.query('reset role');assert.ok(visible);assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(visible.objectPath)).data.arrayBuffer()),bytes);assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[copyOwner.id])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[copyOwner.session])).rows[0].n,1);
 }
 cases.push('fresh real Auth photo-owning account completes in one shipping worker invocation: private prelude removes actual source, SQL finalizer minimizes source metadata/journal, canonical scoped registrations/records/identity run, finite receipt completes with synthetic sealed retention prerequisite; remaining family reads identical retained photo and shared Auth/session remain, physical bytes not released');
 let authenticatedRpcAudit=null;if(process.env.OUCHI_RETIREMENT_RPC_HTTP_TEST==='true'){const {verifyRetirementRpcHTTPServices}=await import('./retirement-rpc-http-services.mjs');authenticatedRpcAudit=await verifyRetirementRpcHTTPServices({db,connect,authPort,fetcher:originalFetch});}
 let webPushClaimAudit=null;if(process.env.OUCHI_WEB_PUSH_CLAIM_SERVICE_TEST==='true'){const {verifyWebPushRetirementClaimServices}=await import('./web-push-retirement-claim-services.mjs');webPushClaimAudit=await verifyWebPushRetirementClaimServices({db,options});}
 console.log(JSON.stringify({status:'passed',passed:cases.length,cases,postCount,actualStorageFilesystem:true,actualPostgres:true,managedGatewayAndTLSVerified:false,productionChanged:false,localCheckedActivation:true,sourceRemovalPerformed:true,transportOnlySyntheticSourceRemoval:true,typedSourceCleanupObservation:true,sourceMetadataFinalized:true,sourceCopyJournalMinimized:true,reviewedPreludeIntegrated:true,recordAdapterOrderingVerified:true,serverNativeRegistrationCheckpoint:true,identityTailImplemented:true,missingRetentionRefused:true,syntheticRetentionOnly:true,opaqueCapacityHeld:true,capacityReleased:false,completeWorkerWithSyntheticRetention:true,freshSingleInvocationPhotoJobComplete:true,actualQueueDispatcher:process.env.OUCHI_DELETION_DISPATCHER_SERVICE_TEST==='true',submissionProgressVerified:true,finiteSubmissionBridgePruned:true,authenticatedRpcAudit,webPushClaimAudit,webCustodyService:webCustody?{sourceSHA256:webCustody.sources,driverSHA256:webCustody.driverSHA256,serviceDriverSHA256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),calls:webCustody.calls,actualBrowserVaultAndClient:true,actualLoopbackHTTP:true,reactUI:process.env.OUCHI_WEB_CUSTODY_REACT_TEST==='true',sdkLogout:process.env.OUCHI_WEB_CUSTODY_REACT_TEST==='true',authCalls:webCustody.authCalls??[],deployedTLS:false}:null,ouchiOnlyReadCustody:true,savedCapabilitySurvivesAuthExpiry:true,receiptAdmissionConcurrencyVerified:true,receiptWindowDeadlineRaceVerified:true,finiteDeviceCredentialsPruned:true,productionRetentionVerified:false,concurrentRetiredIDReuseBlocked:true}));
}finally{release?.();await webCustody?.close();globalThis.fetch=originalFetch;await db.end();}
