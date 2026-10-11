import test from 'node:test';import assert from 'node:assert/strict';import {createServer,request as proxyRequest} from 'node:http';import {randomUUID,createHmac,createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createClient,StorageApiError} from '@supabase/supabase-js';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/account-deletion-objects.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {eraseAccountDeletionObjects:erase}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const compiled=async file=>{const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));};
const {handleAccountDeletionProgress}=await compiled('lib/account-deletion-progress.ts');
const {runAccountDeletion}=await compiled('lib/account-deletion-worker.ts');
const {dispatchRegisteredSandboxPush}=await compiled('lib/native-push-dispatch.ts');
const {createAttachmentFetch}=await compiled('lib/attachment-fetch.ts');
const {storedNativePushDispatch}=await compiled('lib/native-push-dispatch-store.ts');
const {runNativePushJob}=await compiled('lib/native-push-job-worker.ts');
const {storedNativePushJob}=await compiled('lib/native-push-job-store.ts');
const attachmentModules=new Map();
function attachmentModule(name){
 if(attachmentModules.has(name))return attachmentModules.get(name);
 let source=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(attachmentModule(dependency))}`);
 source=source.replace(/import ['"]server-only['"];?/g,''); // Framework marker only; actual server logic remains.
 source=source.replace(/from ['"]([^.'"][^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(import.meta.resolve(dependency))}`);

 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');attachmentModules.set(name,url);return url;
}
const reminderRouteCode=ts.transpileModule(readFileSync('app/api/development/reminder-settings/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
 .replace(/from ['"]@\/lib\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(attachmentModule(name))}`)
 .replace(/from ['"]([^.'"][^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {GET:reminderGET,PUT:reminderPUT}=await import('data:text/javascript;base64,'+Buffer.from(reminderRouteCode).toString('base64'));
const {storedAttachmentUploadServices}=await import(attachmentModule('attachment-upload-store'));
const {attachmentDeployment,attachmentServiceResponse}=await import(attachmentModule('attachment-service-handler'));
const {reportDeployment,reportServiceResponse}=await import(attachmentModule('report-service-handler'));
const {reminderDeployment,reminderServiceResponse}=await import(attachmentModule('reminder-service-handler'));
const {nativePushDeployment,nativePushRegistrationResponse}=await import(attachmentModule('native-push-registration-service'));
const {notificationChannelDeployment,notificationChannelResponse}=await import(attachmentModule('notification-channel-service'));
const {accountEnrollmentResponse}=await import(attachmentModule('account-enrollment-service'));
const {countedNativePushDispatch}=await import(attachmentModule('native-push-job-dispatch'));
const {deletionProgressDependencies}=await import(attachmentModule('account-deletion-progress-store'));
const {runNativePushBatch}=await compiled('lib/native-push-batch.ts');
const {storedNativePushBatch}=await compiled('lib/native-push-batch-store.ts');
const {storedScopedNativePushBatch}=await import(attachmentModule('native-push-scoped-store'));
const {runStoredNativeDeliverySweep}=await import(attachmentModule('native-delivery-sweep'));
const {uploadProductAttachment}=await import(attachmentModule('attachment-upload'));
const formalRouteCode=ts.transpileModule(readFileSync('app/api/development/verified-product-attachments/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
 .replace(/from ['"]@\/lib\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(attachmentModule(name))}`)
 .replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {POST:formalAttachmentPOST,GET:formalAttachmentGET,DELETE:formalAttachmentDELETE}=await import('data:text/javascript;base64,'+Buffer.from(formalRouteCode).toString('base64'));
const reportRouteCode=ts.transpileModule(readFileSync('app/api/development/maintenance-report/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
 .replace(/from ['"]@\/lib\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(attachmentModule(name))}`)
 .replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {GET:formalReportGET}=await import('data:text/javascript;base64,'+Buffer.from(reportRouteCode).toString('base64'));



const workerStoreCode=ts.transpileModule(readFileSync('lib/account-deletion-worker-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'./account-deletion-objects'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(code).toString('base64')));
const {storedDeletionDependencies,storedDeletionCompletion}=await import('data:text/javascript;base64,'+Buffer.from(workerStoreCode).toString('base64'));
const {handleAccountDeletionRequest}=await compiled('lib/account-deletion-request.ts');
const sessionCode=ts.transpileModule(readFileSync('lib/verified-app-session.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const requestStoreCode=ts.transpileModule(readFileSync('lib/account-deletion-request-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'./verified-app-session'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(sessionCode).toString('base64')));
const {deletionRequestDependencies}=await import('data:text/javascript;base64,'+Buffer.from(requestStoreCode).toString('base64'));
test('actual private Storage removal verifies absence and persists exact leased deletion progress',{skip:process.env.OUCHI_DELETION_STORAGE_TEST!=='true',timeout:60000},async()=>{
 // Metadata only, inside the opt-in disposable database. No row/customer values.
 const inventoryText=execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1','-At'],{input:readFileSync('tests/fixtures/deletion/schema-inventory.sql','utf8'),encoding:'utf8',timeout:10000,stdio:['pipe','pipe','pipe']});
 const inventory=JSON.parse(inventoryText.trim());assert.ok(Array.isArray(inventory));
 for(const table of inventory){assert.equal(table.rls,true,table.relation+' requires RLS');assert.ok(table.columns.length>0);assert.ok(Array.isArray(table.foreign_keys));}
 const relations=new Map(inventory.map(table=>[table.relation,table]));
 for(const name of ['maintenance_private.account_access','maintenance_private.app_epochs','maintenance_private.app_session_epochs','maintenance_private.transaction_ownership','maintenance_private.verified_transactions','maintenance_private.verified_renewals','maintenance_private.verified_notifications','maintenance_private.account_deletion_requests','maintenance_private.account_deletion_objects','maintenance_private.native_delivery_identities','public.homes','public.home_invites','public.maintenance_backup_restores'])assert.ok(relations.has(name),'missing erasure inventory: '+name);
 assert.ok(relations.get('maintenance_private.transaction_ownership').columns.some(column=>column.name==='app_epoch_id'));
 assert.ok(relations.get('maintenance_private.account_deletion_objects').columns.some(column=>column.name==='object_path'));
 console.log('Deletion metadata inventory (no customer values): '+JSON.stringify(inventory));
 let pausedFileID=null,releaseWrite,recordWriteArrival;
 const writePermit=new Promise(resolve=>{releaseWrite=resolve;}),writeArrived=new Promise(resolve=>{recordWriteArrival=resolve;});
 const gateway=createServer(async(req,res)=>{
  const auth=req.url?.startsWith('/auth/v1/'),rest=req.url?.startsWith('/rest/v1/'),storage=req.url?.startsWith('/storage/v1/');if(!auth&&!rest&&!storage){res.writeHead(404).end();return;}
  if(storage&&req.method==='POST'&&pausedFileID&&req.url.includes(pausedFileID)){recordWriteArrival();await writePermit;if(req.destroyed||res.destroyed)return;}
  const upstream=proxyRequest((auth?'http://127.0.0.1:9999':rest?'http://127.0.0.1:3002':'http://127.0.0.1:5002')+req.url.slice(storage?11:8),{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode??502,r.headers);r.pipe(res);});upstream.on('error',()=>res.writeHead(502).end());req.pipe(upstream);
 });await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch()}},origin='http://127.0.0.1:54321';
  const syntheticPassword='Synthetic-'+randomUUID();
  const user=createClient(origin,'synthetic-public-key',options),signup=await user.auth.signUp({email:'deletion-'+randomUUID()+'@example.invalid',password:syntheticPassword});assert.equal(signup.error,null);assert.ok(signup.data.session);
  const userID=signup.data.user.id,claims=JSON.parse(Buffer.from(signup.data.session.access_token.split('.')[1],'base64url'));
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});const service=unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin=createClient(origin,service,options),epoch=await admin.rpc('current_maintenance_purchase_account',{target_user:userID,verified_session:claims.session_id});assert.equal(epoch.error,null);assert.ok(epoch.data);
  const nativeArgs={target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data,token:'ab'.repeat(32),push_environment:'Sandbox'};
  const nativeRegistered=await admin.rpc('register_maintenance_native_push',nativeArgs);assert.equal(nativeRegistered.error,null);assert.match(nativeRegistered.data,/^[0-9a-f-]{36}$/i);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:nativeRegistered.data})).data,true);
  assert.equal((await admin.rpc('register_maintenance_native_push',nativeArgs)).data,nativeRegistered.data);
  assert.ok((await user.rpc('register_maintenance_native_push',nativeArgs)).error);
  let syntheticSends=0;const dispatchDeps=storedNativePushDispatch(admin,async input=>{syntheticSends++;assert.equal(input.deviceToken,nativeArgs.token);assert.equal(input.bundleId,'jp.ouchi.maintenance');assert.equal(input.dueCount,1);return 'accepted';});
  assert.equal(await dispatchRegisteredSandboxPush(nativeRegistered.data,1,Date.now()+1000,dispatchDeps),'accepted');assert.equal(syntheticSends,1);
  assert.ok((await user.rpc('read_maintenance_native_sandbox_destination',{registration_id:nativeRegistered.data})).error);
  const home=randomUUID(),product=randomUUID(),file=randomUUID();assert.equal((await user.from('homes').insert({id:home,owner_id:userID,name:'Synthetic deletion home',kind:'home'})).error,null);assert.equal((await user.from('products').insert({id:product,homeId:home,categoryId:'air',name:'Synthetic deletion product'})).error,null);
  assert.equal((await user.from('maintenance_tasks').insert([{id:randomUUID(),productId:product,name:'Synthetic due task',kind:'掃除',intervalDays:30,nextDueAt:'2000-01-01',sourceKind:'ユーザー設定'},{id:randomUUID(),productId:product,name:'Synthetic future task',kind:'点検',intervalDays:30,nextDueAt:'2099-01-01',sourceKind:'ユーザー設定'}])).error,null);
  const nativeJob=randomUUID(),racingJob=randomUUID();
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{
   input:`insert into maintenance_private.native_notification_jobs(id,device_id,due_at,state) values('${nativeJob}','${nativeRegistered.data}',clock_timestamp()-interval '1 second','pending'),('${racingJob}','${nativeRegistered.data}',clock_timestamp()-interval '1 second','pending');`,timeout:10000,stdio:['pipe','pipe','pipe']});
  const jobDeps=storedNativePushJob(admin,countedNativePushDispatch(admin,dispatchDeps,()=>Date.now()+1000));
  assert.deepEqual(await runNativePushJob(nativeJob,jobDeps),{status:'recorded',outcome:'accepted'});
  assert.deepEqual(await runNativePushJob(nativeJob,jobDeps),{status:'unclaimed'});assert.equal(syntheticSends,2);
  const competing=await Promise.all([admin.rpc('claim_maintenance_native_push_job',{target_job:racingJob}),admin.rpc('claim_maintenance_native_push_job',{target_job:racingJob})]);
  assert.ok(competing.every(result=>result.error===null));const leases=competing.map(result=>result.data).filter(Boolean);assert.equal(leases.length,1);
  const racingLease=leases[0];
  assert.equal((await admin.rpc('read_maintenance_native_push_job_claim',{target_job:racingJob,target_lease:racingLease})).data,nativeRegistered.data);
  assert.equal((await admin.rpc('start_maintenance_native_push_job',{target_job:racingJob,target_lease:racingLease})).data,true);
  assert.equal((await admin.rpc('finish_maintenance_native_push_job',{target_job:racingJob,target_lease:racingLease,outcome:'delivery-unknown'})).data,true);
  assert.equal((await admin.rpc('claim_maintenance_native_push_job',{target_job:racingJob})).data,null);
  for(const [name,args] of [
   ['claim_maintenance_native_push_job',{target_job:racingJob}],
   ['read_maintenance_native_push_job_claim',{target_job:racingJob,target_lease:racingLease}],
   ['start_maintenance_native_push_job',{target_job:racingJob,target_lease:racingLease}],
   ['finish_maintenance_native_push_job',{target_job:racingJob,target_lease:racingLease,outcome:'accepted'}],
  ])assert.ok((await user.rpc(name,args)).error);
  const batchRegistered=await admin.rpc('register_maintenance_native_push',{...nativeArgs,token:'cd'.repeat(32)});assert.equal(batchRegistered.error,null);
  const productionRegistered=await admin.rpc('register_maintenance_native_push',{...nativeArgs,token:'ef'.repeat(32),push_environment:'Production'});assert.equal(productionRegistered.error,null);
  const page=await admin.rpc('page_maintenance_native_sandbox_devices',{after_id:null,batch_size:25});assert.equal(page.error,null);
  assert.deepEqual(page.data,[nativeRegistered.data,batchRegistered.data].sort());assert.ok(!page.data.includes(productionRegistered.data));
  assert.ok((await user.rpc('page_maintenance_native_sandbox_devices',{after_id:null,batch_size:25})).error);
  let batchSends=0;
  const batchDestination=storedNativePushDispatch(admin,async input=>{assert.equal(input.deviceToken,'cd'.repeat(32));assert.equal(input.dueCount,1);batchSends++;return 'accepted';});
  const batchJob=storedNativePushJob(admin,countedNativePushDispatch(admin,batchDestination));
  const batch=storedNativePushBatch(admin,(job,signal)=>runNativePushJob(job,batchJob,signal));
  const afterNine=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'numeric',hourCycle:'h23'}).format(new Date()))>=9;
  const firstBatch=await runNativePushBatch(batch);assert.equal(firstBatch.status,'complete');assert.equal(firstBatch.visited,2);assert.equal(firstBatch.unconfirmed,0);assert.equal(firstBatch.accepted,afterNine?1:0);
  const repeatBatch=await runNativePushBatch(batch);assert.equal(repeatBatch.status,'complete');assert.equal(repeatBatch.accepted,0);assert.equal(batchSends,afterNine?1:0);
  console.log(afterNine?'Native daily batch actual RPC path verified after Tokyo 09:00; repeat did not resend.':'Native daily batch morning gate verified; positive send path not exercised before Tokyo 09:00.');
  const invalidationArgs={...nativeArgs,token:'12'.repeat(32)};
  const invalidationRegistered=await admin.rpc('register_maintenance_native_push',invalidationArgs);assert.equal(invalidationRegistered.error,null);assert.match(invalidationRegistered.data,/^[0-9a-f-]{36}$/i);
  const invalidationJob=randomUUID();
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{
   input:`insert into maintenance_private.native_notification_jobs(id,device_id,due_at,state) values('${invalidationJob}','${invalidationRegistered.data}',clock_timestamp()-interval '1 second','pending');`,timeout:10000,stdio:['pipe','pipe','pipe']});
  let invalidationSends=0;
  const invalidationDestination=storedNativePushDispatch(admin,async input=>{assert.equal(input.deviceToken,invalidationArgs.token);invalidationSends++;return 'disable-device';});
  const invalidationDeps=storedNativePushJob(admin,countedNativePushDispatch(admin,invalidationDestination));
  assert.deepEqual(await runNativePushJob(invalidationJob,invalidationDeps),{status:'recorded',outcome:'disable-device'});assert.equal(invalidationSends,1);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:invalidationRegistered.data})).data,false);
  assert.deepEqual(await runNativePushJob(invalidationJob,invalidationDeps),{status:'unclaimed'});assert.equal(invalidationSends,1);
  const renewedRegistered=await admin.rpc('register_maintenance_native_push',invalidationArgs);assert.equal(renewedRegistered.error,null);assert.notEqual(renewedRegistered.data,invalidationRegistered.data);assert.match(renewedRegistered.data,/^[0-9a-f-]{36}$/i);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:renewedRegistered.data})).data,true);
  const delayedInvalidationJob=randomUUID();
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{
   input:`insert into maintenance_private.native_notification_jobs(id,device_id,due_at,state) values('${delayedInvalidationJob}','${renewedRegistered.data}',clock_timestamp()-interval '1 second','pending');`,timeout:10000,stdio:['pipe','pipe','pipe']});
  const delayedClaim=await admin.rpc('claim_maintenance_native_push_job',{target_job:delayedInvalidationJob});assert.equal(delayedClaim.error,null);assert.ok(delayedClaim.data);
  assert.equal((await admin.rpc('start_maintenance_native_push_job',{target_job:delayedInvalidationJob,target_lease:delayedClaim.data})).data,true);
  const secondLogin=createClient(origin,'synthetic-public-key',options);
  const secondSession=await secondLogin.auth.signInWithPassword({email:signup.data.user.email,password:syntheticPassword});assert.equal(secondSession.error,null);assert.ok(secondSession.data.session);
  const secondClaims=JSON.parse(Buffer.from(secondSession.data.session.access_token.split('.')[1],'base64url'));
  assert.notEqual(secondClaims.session_id,claims.session_id);
  const secondEpoch=await admin.rpc('current_maintenance_purchase_account',{target_user:userID,verified_session:secondClaims.session_id});assert.equal(secondEpoch.error,null);assert.equal(secondEpoch.data,epoch.data);
  const secondRegistration=await admin.rpc('register_maintenance_native_push',{...invalidationArgs,verified_session:secondClaims.session_id});assert.equal(secondRegistration.error,null);assert.notEqual(secondRegistration.data,renewedRegistered.data);
  const lateInvalidation=await admin.rpc('finish_maintenance_native_push_job',{target_job:delayedInvalidationJob,target_lease:delayedClaim.data,outcome:'disable-device'});assert.equal(lateInvalidation.error,null);assert.equal(lateInvalidation.data,false);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:secondRegistration.data})).data,true);
  console.log('Native invalidation actual RPC path verified; replacement registration remains enabled.');
  const other=createClient(origin,'synthetic-public-key',options),otherSignup=await other.auth.signUp({email:'preserved-'+randomUUID()+'@example.invalid',password:'Synthetic-'+randomUUID()});assert.equal(otherSignup.error,null);const otherHome=randomUUID();assert.equal((await other.from('homes').insert({id:otherHome,owner_id:otherSignup.data.user.id,name:'Preserved synthetic home',kind:'home'})).error,null);
  assert.equal((await user.from('home_members').insert({homeId:home,user_id:otherSignup.data.user.id,nickname:'Synthetic member'})).error,null);
  const sharedBefore=await other.from('products').select('id').eq('id',product);assert.equal(sharedBefore.error,null);assert.deepEqual(sharedBefore.data,[{id:product}]);
  for(const id of [userID,epoch.data,product,file])assert.match(id,/^[0-9a-f-]{36}$/i);
  // Formal adapter sees the real live Auth session and server ledger. No purchase
  // exists in this disposable account: an authenticated request cannot upload.
  const deniedAttachment=randomUUID();
  const denied=await uploadProductAttachment(new Request(origin+'/formal-adapter-test',{method:'POST',headers:{authorization:'Bearer '+signup.data.session.access_token,'content-type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10])}),product,deniedAttachment,storedAttachmentUploadServices(admin,'Sandbox'));
  assert.equal(denied.status,403);
  const deniedUsage=await admin.rpc('maintenance_attachment_usage',{target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data});assert.equal(deniedUsage.error,null);assert.equal(deniedUsage.data.usedFiles,0);assert.equal(deniedUsage.data.reservedFiles,0);
  const bytes=Buffer.from('synthetic-disposable-file'),hash=createHash('sha256').update(bytes).digest('hex');
  const reservation={target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data,target_product:product,attachment_id:file,byte_count:bytes.length,media_type:'image/png',measured_sha256:hash};
  const reserved=await admin.rpc('reserve_maintenance_attachment',reservation);assert.equal(reserved.error,null);assert.equal(reserved.data,file);
  assert.equal((await admin.rpc('reserve_maintenance_attachment',reservation)).data,file);assert.ok((await user.rpc('reserve_maintenance_attachment',reservation)).error);
  const writeAttempt=randomUUID(),writeArgs={target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data,target_attachment:file,target_attempt:writeAttempt};
  const startedWrite=await admin.rpc('begin_maintenance_attachment_write',writeArgs);assert.equal(startedWrite.error,null);assert.deepEqual(startedWrite.data,{attemptID:writeAttempt,started:true,settled:false});
  assert.deepEqual((await admin.rpc('begin_maintenance_attachment_write',writeArgs)).data,{attemptID:writeAttempt,started:false,settled:false});assert.ok((await user.rpc('begin_maintenance_attachment_write',writeArgs)).error);
  assert.equal((await admin.storage.createBucket('ouchi-product-attachments',{public:false})).error,null);const path=`${userID}/${epoch.data}/${file}.png`;
  assert.equal((await admin.storage.from('ouchi-product-attachments').upload(path,bytes,{contentType:'image/png',upsert:false})).error,null);
  const downloaded=await admin.storage.from('ouchi-product-attachments').download(path);assert.equal(downloaded.error,null);assert.ok(downloaded.data);
  const measured=Buffer.from(await downloaded.data.arrayBuffer());assert.deepEqual(measured,bytes);
  const completion={target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data,attachment_id:file,actual_bytes:measured.length,verified_sha256:createHash('sha256').update(measured).digest('hex')};
  assert.ok((await admin.rpc('finalize_maintenance_attachment',{...completion,actual_bytes:measured.length+1})).error);
  assert.ok((await admin.rpc('finalize_maintenance_attachment',completion)).error);
  const settledWrite=await admin.rpc('settle_maintenance_attachment_write',{target_attachment:file,target_attempt:writeAttempt});assert.equal(settledWrite.error,null);assert.equal(settledWrite.data,true);
  assert.ok((await user.rpc('settle_maintenance_attachment_write',{target_attachment:file,target_attempt:writeAttempt})).error);
  const completedAttachment=await admin.rpc('finalize_maintenance_attachment',completion);assert.equal(completedAttachment.error,null);assert.equal(completedAttachment.data,file);
  assert.equal((await admin.rpc('finalize_maintenance_attachment',completion)).data,file);assert.ok((await user.rpc('finalize_maintenance_attachment',completion)).error);
  assert.ok((await user.storage.from('ouchi-product-attachments').download(path)).error);
  const otherClaims=JSON.parse(Buffer.from(otherSignup.data.session.access_token.split('.')[1],'base64url'));
  const otherEpoch=await admin.rpc('current_maintenance_purchase_account',{target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id});assert.equal(otherEpoch.error,null);assert.ok(otherEpoch.data);
  const readerArgs={target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data,attachment_id:file};
  const sharedReaderArgs={...readerArgs,target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data};
  const metadata=await admin.rpc('read_maintenance_attachment',readerArgs);assert.equal(metadata.error,null);assert.deepEqual(metadata.data,{id:file,user:userID,epoch:epoch.data,size:bytes.length,mime:'image/png',sha256:hash});
  // Neither uploader nor reader has a paid transaction. Existing downloads remain authorized.
  assert.deepEqual((await admin.rpc('read_maintenance_attachment',sharedReaderArgs)).data,metadata.data);
  assert.ok((await other.rpc('read_maintenance_attachment',sharedReaderArgs)).error);
  const pageArgs={target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,target_product:product};
  const retainedPage=await admin.rpc('page_maintenance_attachments',pageArgs);assert.equal(retainedPage.error,null);assert.equal(retainedPage.data.items.length,1);assert.equal(retainedPage.data.next,null);assert.deepEqual(Object.keys(retainedPage.data.items[0]).sort(),['createdAt','id','mime','size']);
  const usageArgs={target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data};
  const used=await admin.rpc('maintenance_attachment_usage',usageArgs);assert.equal(used.error,null);assert.equal(used.data.usedBytes,bytes.length);assert.equal(used.data.usedFiles,1);assert.equal(used.data.reservedFiles,0);
  // Successful formal adapter uses a synthetic server-persisted ledger event.
  // This verifies database/Storage wiring, not an Apple-signed Sandbox purchase.
  const paidProduct=randomUUID(),paidFile=randomUUID(),now=Date.now();
  assert.equal((await other.from('products').insert({id:paidProduct,homeId:otherHome,categoryId:'air',name:'Synthetic adapter product'})).error,null);
  const paidEvent={environment:'Sandbox',transactionId:'901',originalTransactionId:'900',accountToken:otherEpoch.data,productId:'ouchi.premium.monthly',signedAt:now,purchasedAt:now-1000,expiresAt:now+3600000};
  const paidSeed=await admin.rpc('apply_maintenance_verified_transaction',{payload:paidEvent,proof_sha256:'d'.repeat(64)});assert.equal(paidSeed.error,null);
  const settingsKeys=['VERCEL_ENV','OUCHI_REMINDER_SETTINGS_TEST_MODE','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','BILLING_MODE','BILLING_ACCOUNT_BINDING_MODE','BILLING_STORAGE_MODE'];
  const settingsBefore=Object.fromEntries(settingsKeys.map(k=>[k,process.env[k]]));
  const selectedSchedule={minuteOfDay:1230,weekdays:[7],leadDays:1,includeOverdue:false};
  const defaultSchedule={minuteOfDay:540,weekdays:[1,2,3,4,5,6,7],leadDays:0,includeOverdue:true};
  async function settingsRequest(token,body,environment='preview',enabled='true'){
   try{
    Object.assign(process.env,{VERCEL_ENV:environment,OUCHI_REMINDER_SETTINGS_TEST_MODE:enabled,NEXT_PUBLIC_SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:service,BILLING_MODE:'sandbox',BILLING_ACCOUNT_BINDING_MODE:'epoch',BILLING_STORAGE_MODE:'verified-ledger'});
    const request=new Request(origin+'/api/development/reminder-settings',{method:body===undefined?'GET':'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return await (body===undefined?reminderGET:reminderPUT)(request);
   }finally{for(const key of settingsKeys){if(settingsBefore[key]===undefined)delete process.env[key];else process.env[key]=settingsBefore[key];}}
  }
  const paidToken=otherSignup.data.session.access_token;
  assert.equal((await settingsRequest(paidToken,undefined,'production')).status,503);
  assert.equal((await settingsRequest(paidToken,undefined,'preview','false')).status,503);
  const freeSettings=await settingsRequest(signup.data.session.access_token);assert.equal(freeSettings.status,200);assert.deepEqual((await freeSettings.json()).effective,defaultSchedule);
  assert.equal((await settingsRequest(signup.data.session.access_token,{revision:0,schedule:selectedSchedule})).status,403);
  const savedSettings=await settingsRequest(paidToken,{revision:0,schedule:selectedSchedule});assert.equal(savedSettings.status,200);assert.deepEqual((await savedSettings.json()).effective,selectedSchedule);
  assert.equal((await settingsRequest(paidToken,{revision:0,schedule:selectedSchedule})).status,200);
  assert.equal((await settingsRequest(paidToken,{revision:0,schedule:{...selectedSchedule,minuteOfDay:1200}})).status,409);

  const formalReminderConfig=reminderDeployment({url:'https://disposable.supabase.co/',key:service,storage:'verified-ledger',environment:'Sandbox'},'true');assert.ok(formalReminderConfig);
  const formalReminderFactory=(config,signal)=>{assert.equal(config.environment,'Sandbox');return createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});};
  const formalReminderRequest=(body,token=paidToken,capturedEpoch=otherEpoch.data)=>new Request(origin+'/api/reminder-settings',{method:body===undefined?'GET':'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json','X-Ouchi-App-Epoch':capturedEpoch},body:body===undefined?undefined:JSON.stringify(body)});
  const formalSettings=await reminderServiceResponse(formalReminderRequest(),formalReminderConfig,formalReminderFactory);assert.equal(formalSettings.status,200);const formalSettingsBody=await formalSettings.json();assert.equal(formalSettingsBody.environment,'Sandbox');assert.equal(formalSettingsBody.purchaseAccountToken,otherEpoch.data);assert.equal(formalSettingsBody.revision,1);assert.deepEqual(formalSettingsBody.effective,selectedSchedule);
  assert.equal((await reminderServiceResponse(formalReminderRequest({revision:0,schedule:selectedSchedule}),formalReminderConfig,formalReminderFactory)).status,200);
  assert.equal((await reminderServiceResponse(formalReminderRequest({revision:0,schedule:{...selectedSchedule,minuteOfDay:1200}}),formalReminderConfig,formalReminderFactory)).status,409);
  assert.equal((await reminderServiceResponse(formalReminderRequest(undefined,paidToken,randomUUID()),formalReminderConfig,formalReminderFactory)).status,403);
  assert.equal((await reminderServiceResponse(formalReminderRequest({revision:0,schedule:selectedSchedule},signup.data.session.access_token,epoch.data),formalReminderConfig,formalReminderFactory)).status,403);


  // Formal registration independently binds distribution APNs to Sandbox purchases.
  const formalPushConfig=nativePushDeployment({url:'https://disposable.supabase.co/',key:service,storage:'verified-ledger',environment:'Sandbox'},'true','Production');assert.ok(formalPushConfig);
  const formalPushFactory=(config,signal)=>{assert.equal(config.pushEnvironment,'Production');assert.equal(config.environment,'Sandbox');return createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});};
  const formalPushRequest=(method,body,capturedEpoch=otherEpoch.data)=>new Request(origin+'/api/native-push-registration',{method,headers:{authorization:'Bearer '+paidToken,'X-Ouchi-App-Epoch':capturedEpoch,'content-type':'application/json'},body:JSON.stringify(body)});
  const formalPushResponse=await nativePushRegistrationResponse(formalPushRequest('POST',{deviceToken:'56'.repeat(32)}),formalPushConfig,formalPushFactory);assert.equal(formalPushResponse.status,200);const formalPushBody=await formalPushResponse.json();assert.equal(formalPushBody.notificationEnvironment,'Production');assert.equal(formalPushBody.purchaseEnvironment,'Sandbox');assert.equal(formalPushBody.purchaseAccountToken,otherEpoch.data);assert.match(formalPushBody.registrationId,/^[0-9a-f-]{36}$/i);
  const confirmedFormalPush=await nativePushRegistrationResponse(formalPushRequest('POST',{deviceToken:'56'.repeat(32)}),formalPushConfig,formalPushFactory,true);assert.equal(confirmedFormalPush.status,200);const confirmedFormalBody=await confirmedFormalPush.json();assert.equal(confirmedFormalBody.registrationId,formalPushBody.registrationId);assert.equal(confirmedFormalBody.enabled,true);
  const repeatedFormalPush=await nativePushRegistrationResponse(formalPushRequest('POST',{deviceToken:'56'.repeat(32)}),formalPushConfig,formalPushFactory);assert.equal(repeatedFormalPush.status,200);assert.equal((await repeatedFormalPush.json()).registrationId,formalPushBody.registrationId);
  assert.equal((await nativePushRegistrationResponse(formalPushRequest('POST',{deviceToken:'56'.repeat(32)},randomUUID()),formalPushConfig,formalPushFactory)).status,403);
  const wrongPurchasePushConfig=nativePushDeployment({url:'https://disposable.supabase.co/',key:service,storage:'verified-ledger',environment:'Production'},'true','Production');
  const wrongScopedDisable=await nativePushRegistrationResponse(formalPushRequest('DELETE',{registrationId:formalPushBody.registrationId}),wrongPurchasePushConfig,(_config,signal)=>createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}}));assert.equal(wrongScopedDisable.status,200);assert.equal((await wrongScopedDisable.json()).disabled,false);
  const formalPushDisabled=await nativePushRegistrationResponse(formalPushRequest('DELETE',{registrationId:formalPushBody.registrationId}),formalPushConfig,formalPushFactory);assert.equal(formalPushDisabled.status,200);assert.equal((await formalPushDisabled.json()).disabled,true);
  const stoppedFormalLookup=await nativePushRegistrationResponse(formalPushRequest('POST',{deviceToken:'56'.repeat(32)}),formalPushConfig,formalPushFactory,true);assert.equal(stoppedFormalLookup.status,200);const stoppedFormalBody=await stoppedFormalLookup.json();assert.equal(stoppedFormalBody.registrationId,formalPushBody.registrationId);assert.equal(stoppedFormalBody.enabled,false);
  const absentFormalLookup=await nativePushRegistrationResponse(formalPushRequest('POST',{deviceToken:'78'.repeat(32)}),formalPushConfig,formalPushFactory,true);assert.equal(absentFormalLookup.status,200);assert.equal((await absentFormalLookup.json()).registrationId,null);
  console.log('Formal native status actual Auth/PostgreSQL: scoped read-only active/stopped/absent registration without reactivation. No APNs send or Apple signature.');
  console.log('Formal native registration actual Auth/PostgreSQL: distribution APNs independently scoped to Sandbox purchase enrollment, exact retry, wrong epoch refusal and scoped disable. No APNs send or Apple signature.');

  // Real disposable PostgreSQL/Auth RPC job path; APNs is never contacted.
  const scheduledRegistration=await admin.rpc('register_maintenance_native_push',{target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,token:'34'.repeat(32),push_environment:'Sandbox'});assert.equal(scheduledRegistration.error,null);
  const todayWeekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',weekday:'short'}).format(new Date()))+1;
  const jobSchedule={minuteOfDay:0,weekdays:[todayWeekday],leadDays:3,includeOverdue:false};
  assert.equal((await settingsRequest(paidToken,{revision:1,schedule:jobSchedule})).status,200);
  const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'}),scheduledTask=randomUUID();
  assert.equal((await other.from('maintenance_tasks').insert({id:scheduledTask,productId:paidProduct,name:'Synthetic schedule lead task',kind:'点検',intervalDays:30,nextDueAt:tomorrow,sourceKind:'ユーザー設定'})).error,null);
  const queued=await admin.rpc('enqueue_maintenance_native_daily_job',{registration_id:scheduledRegistration.data});assert.equal(queued.error,null);assert.ok(queued.data);
  assert.equal((await admin.rpc('enqueue_maintenance_native_daily_job',{registration_id:scheduledRegistration.data})).data,queued.data);
  const queuedLease=await admin.rpc('claim_maintenance_native_push_job',{target_job:queued.data});assert.equal(queuedLease.error,null);assert.ok(queuedLease.data);
  const countedArgs={target_job:queued.data,target_lease:queuedLease.data};assert.equal((await admin.rpc('count_maintenance_native_job_due',countedArgs)).data,1);
  // Formal Production APNs job pipeline, but synthetic sender only.
  const distributionArgs={target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,push_environment:'Production',purchase_environment:'Sandbox'};
  const distributionRegistration=await admin.rpc('register_maintenance_native_scoped_push',{...distributionArgs,token:'9b'.repeat(32)});assert.equal(distributionRegistration.error,null);
  let distributionSends=0;const scopedPipeline=storedScopedNativePushBatch(admin,{push:'Production',purchase:'Sandbox'},async input=>{distributionSends++;assert.equal(input.deviceToken,'9b'.repeat(32));assert.equal(input.dueCount,1);assert.equal(input.bundleId,'jp.ouchi.maintenance');return 'accepted';});
  const scopedPage=await scopedPipeline.page(null,25);assert.deepEqual(scopedPage,[distributionRegistration.data]);
  const distributionRun=await runNativePushBatch(scopedPipeline);assert.equal(distributionRun.status,'complete');assert.equal(distributionRun.accepted,1);assert.equal(distributionRun.unconfirmed,0);assert.equal(distributionSends,1);
  const distributionRepeat=await runNativePushBatch(scopedPipeline);assert.equal(distributionRepeat.accepted,0);assert.equal(distributionSends,1);
  assert.deepEqual(await storedScopedNativePushBatch(admin,{push:'Production',purchase:'Production'},async()=>{throw Error('Wrong scope send');}).page(null,25),[]);
  const uncertainRegistration=await admin.rpc('register_maintenance_native_scoped_push',{...distributionArgs,token:'9c'.repeat(32)});assert.equal(uncertainRegistration.error,null);
  let uncertainSends=0;const uncertainPipeline=storedScopedNativePushBatch(admin,{push:'Production',purchase:'Sandbox'},async input=>{assert.equal(input.deviceToken,'9c'.repeat(32));uncertainSends++;return 'delivery-unknown';});
  assert.equal((await runNativePushBatch(uncertainPipeline)).accepted,0);assert.equal(uncertainSends,1);assert.equal((await runNativePushBatch(uncertainPipeline)).accepted,0);assert.equal(uncertainSends,1,'uncertain delivery is never resent');
  assert.equal((await admin.rpc('disable_maintenance_native_scoped_push',{...distributionArgs,registration_id:distributionRegistration.data})).data,true);
  const replacedDistribution=await admin.rpc('register_maintenance_native_scoped_push',{...distributionArgs,token:'9b'.repeat(32)});assert.equal(replacedDistribution.error,null);assert.notEqual(replacedDistribution.data,distributionRegistration.data);
  let replacementSends=0;const replacementPipeline=storedScopedNativePushBatch(admin,{push:'Production',purchase:'Sandbox'},async()=>{replacementSends++;return 'accepted';});assert.equal((await runNativePushBatch(replacementPipeline)).accepted,0);assert.equal(replacementSends,0,'accepted guard survives stop deleting the old job and re-registration');
  assert.equal((await admin.rpc('prune_maintenance_native_delivery_identities',{batch_size:500})).data,0,'current daily identities remain');
  const sweepScope={target_push_environment:'Production',target_purchase_environment:'Sandbox'};
  const simultaneousClaims=await Promise.all(Array.from({length:4},()=>admin.rpc('claim_maintenance_native_delivery_sweep',sweepScope)));for(const value of simultaneousClaims)assert.equal(value.error,null);const activeSweeps=simultaneousClaims.filter(value=>value.data!==null);assert.equal(activeSweeps.length,1,'concurrent actual PostgreSQL claims have one owner');const sweepLease=activeSweeps[0].data;
  const sweepArgs={...sweepScope,target_cycle:sweepLease.cycle,target_lease:sweepLease.lease};assert.equal((await admin.rpc('maintenance_native_delivery_sweep_current',sweepArgs)).data,true);assert.equal((await admin.rpc('maintenance_native_delivery_sweep_current',{...sweepArgs,target_purchase_environment:'Production'})).data,false);
  assert.equal((await admin.rpc('checkpoint_maintenance_native_delivery_sweep',{...sweepArgs,expected_cursor:null,next_cursor:null,result_status:'partial'})).data,true);
  let sweepSends=0;const sweepBatch=storedScopedNativePushBatch(admin,{push:'Production',purchase:'Sandbox'},async()=>{sweepSends++;return 'accepted';});const coordinated=await runStoredNativeDeliverySweep(admin,admin,{push:'Production',purchase:'Sandbox'},sweepBatch);assert.equal(coordinated.status,'complete');assert.equal(coordinated.visited,2);assert.equal(coordinated.cleaned,0);assert.equal(sweepSends,0,'completed and uncertain destination identities do not resend');assert.equal((await runStoredNativeDeliverySweep(admin,admin,{push:'Production',purchase:'Sandbox'},sweepBatch)).status,'idle');assert.equal((await admin.rpc('checkpoint_maintenance_native_delivery_sweep',{...sweepArgs,expected_cursor:null,next_cursor:null,result_status:'complete'})).data,false,'stale sweep lease cannot checkpoint');
  console.log('Native delivery sweep actual Auth/PostgreSQL: four concurrent claims yield one owner, scoped lease/cursor checkpoint, mandatory cleanup, accepted/unknown no resend, complete cadence and stale receipt refusal; synthetic sender only.');
  console.log('Native daily identity actual Auth/PostgreSQL: accepted guard survives explicit stop/job deletion and same-token re-registration, uncertain attempts stay fenced; synthetic sender only.');
  console.log('Scoped native Production job actual Auth/PostgreSQL: independent Sandbox purchase scope, page/enqueue/lease/count/start/receipt, accepted/unknown no repeat sends and wrong-purchase empty page. Synthetic sender only; no Apple push or signature.');
  const replanRegistration=await admin.rpc('register_maintenance_native_scoped_push',{...distributionArgs,token:'9e'.repeat(32)});assert.equal(replanRegistration.error,null);
  const replanScope={target_push_environment:'Production',target_purchase_environment:'Sandbox'};
  const replanQueued=await admin.rpc('enqueue_maintenance_native_scoped_daily_job',{...replanScope,registration_id:replanRegistration.data});assert.equal(replanQueued.error,null);assert.ok(replanQueued.data);
  const originalPlanLease=await admin.rpc('claim_maintenance_native_scoped_push_job',{...replanScope,target_job:replanQueued.data});assert.ok(originalPlanLease.data);const originalPlanArgs={...replanScope,target_job:replanQueued.data,target_lease:originalPlanLease.data};
  assert.equal((await settingsRequest(paidToken,{revision:2,schedule:{...jobSchedule,leadDays:1}})).status,200);assert.equal((await admin.rpc('enqueue_maintenance_native_scoped_daily_job',{...replanScope,registration_id:replanRegistration.data})).data,replanQueued.data);assert.equal((await admin.rpc('count_maintenance_native_scoped_job_due',originalPlanArgs)).data,null);assert.equal((await admin.rpc('start_maintenance_native_scoped_push_job',originalPlanArgs)).data,false);assert.equal((await admin.rpc('finish_maintenance_native_scoped_push_job',{...originalPlanArgs,outcome:'skipped'})).data,true);
  assert.equal((await admin.rpc('enqueue_maintenance_native_scoped_daily_job',{...replanScope,registration_id:replanRegistration.data})).data,replanQueued.data);const currentPlanLease=await admin.rpc('claim_maintenance_native_scoped_push_job',{...replanScope,target_job:replanQueued.data});assert.ok(currentPlanLease.data);assert.notEqual(currentPlanLease.data,originalPlanLease.data);const currentPlanArgs={...replanScope,target_job:replanQueued.data,target_lease:currentPlanLease.data};assert.equal((await admin.rpc('count_maintenance_native_scoped_job_due',currentPlanArgs)).data,1);assert.equal((await admin.rpc('start_maintenance_native_scoped_push_job',currentPlanArgs)).data,true);assert.equal((await admin.rpc('finish_maintenance_native_scoped_push_job',{...currentPlanArgs,outcome:'delivery-unknown'})).data,true);assert.equal((await admin.rpc('finish_maintenance_native_scoped_push_job',{...originalPlanArgs,outcome:'accepted'})).data,false,'stale acknowledgement cannot affect replanned lease');
  assert.equal((await settingsRequest(paidToken,{revision:3,schedule:selectedSchedule})).status,200);
  assert.equal((await admin.rpc('claim_maintenance_native_scoped_push_job',{...replanScope,target_job:replanQueued.data})).data,null,'unknown started job cannot become a new claim after setting change');
  console.log('Native same-day replan actual Auth/PostgreSQL: active claim not rewritten, changed settings refuse start, skipped unsent schedule reuses exact job with fresh lease, stale receipt refused, unknown send not eligible for replan; synthetic ledger only, no APNs.');
  assert.equal((await admin.rpc('count_maintenance_native_job_due',countedArgs)).data,null);
  assert.equal((await admin.rpc('start_maintenance_native_push_job',countedArgs)).data,false);
  assert.equal((await other.from('maintenance_tasks').delete().eq('id',scheduledTask)).error,null);
  console.log('Native stored schedule actual Auth/PostgreSQL RPC: lead-day enqueue, daily uniqueness, claimed count and changed-setting start refusal. No APNs delivery or Apple signature.');

  const reportKeys=['VERCEL_ENV','OUCHI_REPORT_TEST_MODE','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','APPLE_BUNDLE_ID','APPLE_ROOT_CERTIFICATES_BASE64','BILLING_MODE','BILLING_ACCOUNT_BINDING_MODE','BILLING_STORAGE_MODE'];
  const reportBefore=Object.fromEntries(reportKeys.map(key=>[key,process.env[key]]));
  async function reportRequest(targetHome){
   try{
    delete process.env.APPLE_BUNDLE_ID;delete process.env.APPLE_ROOT_CERTIFICATES_BASE64;
    Object.assign(process.env,{VERCEL_ENV:'preview',OUCHI_REPORT_TEST_MODE:'true',NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_isolated_report',SUPABASE_SERVICE_ROLE_KEY:service,BILLING_MODE:'sandbox',BILLING_ACCOUNT_BINDING_MODE:'epoch',BILLING_STORAGE_MODE:'verified-ledger'});
    return await formalReportGET(new Request(origin+'/api/development/maintenance-report?homeId='+targetHome,{headers:{authorization:'Bearer '+otherSignup.data.session.access_token}}));
   }finally{for(const key of reportKeys){if(reportBefore[key]===undefined)delete process.env[key];else process.env[key]=reportBefore[key];}}
  }
  const actualReport=await reportRequest(otherHome);assert.equal(actualReport.status,200);assert.equal(actualReport.headers.get('cache-control'),'no-store');
  const actualReportBody=await actualReport.json();assert.equal(actualReportBody.report.homeId,otherHome);assert.equal(actualReportBody.environment,'Sandbox');assert.equal(actualReportBody.salesEnabled,false);
  assert.equal((await reportRequest(randomUUID())).status,404);
  const formalReportConfig=reportDeployment({url:'https://disposable.supabase.co/',key:service,storage:'verified-ledger',environment:'Sandbox'},'true','sb_publishable_synthetic_isolated_report');assert.ok(formalReportConfig);
  const reportFactories={service:(value,signal)=>{assert.equal(value.url,'https://disposable.supabase.co/');return createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});},caller:(value,token,signal)=>createClient(origin,value.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token},fetch:createAttachmentFetch(signal)}})};
  const formalReportRequest=(targetHome=otherHome,token=otherSignup.data.session.access_token,expectedEpoch=otherEpoch.data)=>new Request(origin+'/api/maintenance-report?homeId='+targetHome,{headers:{authorization:'Bearer '+token,'X-Ouchi-App-Epoch':expectedEpoch}});
  assert.equal((await reportServiceResponse(formalReportRequest(randomUUID()),formalReportConfig,reportFactories)).status,404);
  const formalPaidReport=await reportServiceResponse(formalReportRequest(),formalReportConfig,reportFactories);assert.equal(formalPaidReport.status,200);const formalPaidBody=await formalPaidReport.json();assert.equal(formalPaidBody.environment,'Sandbox');assert.equal(formalPaidBody.purchaseAccountToken,otherEpoch.data);assert.equal(formalPaidBody.report.homeId,otherHome);
  assert.equal((await reportServiceResponse(formalReportRequest(otherHome,signup.data.session.access_token,epoch.data),formalReportConfig,reportFactories)).status,403);
  assert.equal((await reportServiceResponse(formalReportRequest(otherHome,otherSignup.data.session.access_token,randomUUID()),formalReportConfig,reportFactories)).status,403);

  const adapterBytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const paidRequest=()=>new Request(origin+'/api/development/verified-product-attachments?productId='+paidProduct+'&attachmentId='+paidFile,{method:'POST',headers:{authorization:'Bearer '+otherSignup.data.session.access_token,'content-type':'image/png'},body:adapterBytes});
  // Real Auth, ledger and reservation RPCs, with a failed Storage read.
  // Unknown read outcome must not send a physical write; retry reuses this ID.
  let unknownReadCount=0,unexpectedStorageWrites=0;
  const uncertainStorageClient=createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
   const outgoing=new Request(input,init);
   if(new URL(outgoing.url).pathname.startsWith('/storage/v1/object/')){
    if(outgoing.method==='GET'){unknownReadCount++;return Response.json({message:'Synthetic temporary outage',error:'InternalError',statusCode:503},{status:503});}
    unexpectedStorageWrites++;
   }
   return fetch(outgoing);
  }}});
  const unknownReadResult=await uploadProductAttachment(paidRequest(),paidProduct,paidFile,storedAttachmentUploadServices(uncertainStorageClient,'Sandbox'));
  assert.equal(unknownReadResult.status,503);assert.ok(unknownReadCount>0);assert.equal(unexpectedStorageWrites,0);
  const routeEnvKeys=['NODE_ENV','OUCHI_ATTACHMENT_TEST_MODE','OUCHI_ATTACHMENT_TEST_URL','OUCHI_ATTACHMENT_TEST_SERVICE_KEY'],routeEnvBefore=Object.fromEntries(routeEnvKeys.map(key=>[key,process.env[key]]));
  let paidResult;
  try{process.env.NODE_ENV='development';process.env.OUCHI_ATTACHMENT_TEST_MODE='true';process.env.OUCHI_ATTACHMENT_TEST_URL=origin;process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY=service;paidResult=await formalAttachmentPOST(paidRequest());}
  finally{for(const key of routeEnvKeys){if(routeEnvBefore[key]===undefined)delete process.env[key];else process.env[key]=routeEnvBefore[key];}}
assert.equal(paidResult.status,200);assert.deepEqual(await paidResult.json(),{saved:true,attachmentId:paidFile});
  const paidRetry=await uploadProductAttachment(paidRequest(),paidProduct,paidFile,storedAttachmentUploadServices(admin,'Sandbox'));assert.equal(paidRetry.status,200);
  const paidReadArgs={target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,attachment_id:paidFile};
  assert.equal((await admin.rpc('read_maintenance_attachment',paidReadArgs)).data.id,paidFile);
  // Exercise the formal shared service handler against real disposable Auth,
  // ledger, PostgREST and Storage. The injected factory uses localhost only;
  // this is not a production deployment or an Apple-signed purchase proof.
  const expiryFile=randomUUID();
  const expiryConfig=attachmentDeployment({url:'https://disposable.supabase.co/',key:service,environment:'Sandbox',storage:'verified-ledger'},'true');assert.ok(expiryConfig);
  const formalClient=(config,signal)=>{assert.equal(config.url,'https://disposable.supabase.co/');return createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});};
  const expiryRequest=(method,id,token=otherSignup.data.session.access_token,capturedEpoch=otherEpoch.data)=>new Request(origin+'/api/product-attachments?attachmentId='+id+(method==='POST'?'&productId='+paidProduct:''),{method,headers:{authorization:'Bearer '+token,...(method==='GET'?{}:{'X-Ouchi-App-Epoch':capturedEpoch}),...(method==='POST'?{'content-type':'image/png'}:{})},body:method==='POST'?adapterBytes:undefined});
  const expiryUpload=await attachmentServiceResponse(expiryRequest('POST',expiryFile),expiryConfig,formalClient);assert.equal(expiryUpload.status,200);assert.deepEqual(await expiryUpload.json(),{saved:true,attachmentId:expiryFile});
  // Expiration has no refund/revocation field and does not close the account.
  const expiredSeed=await admin.rpc('apply_maintenance_verified_transaction',{payload:{...paidEvent,signedAt:now+1,expiresAt:now-1},proof_sha256:'f'.repeat(64)});assert.equal(expiredSeed.error,null);assert.equal(expiredSeed.data,'updated');
  const expiredRights=await admin.rpc('read_maintenance_verified_entitlement',{target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,target_epoch:otherEpoch.data,target_environment:'Sandbox'});assert.equal(expiredRights.error,null);assert.equal(expiredRights.data.plan,'free');
  assert.equal((await reportServiceResponse(formalReportRequest(),formalReportConfig,reportFactories)).status,403);
  const expiredFormalSettings=await reminderServiceResponse(formalReminderRequest(),formalReminderConfig,formalReminderFactory);assert.equal(expiredFormalSettings.status,200);const expiredSettingsBody=await expiredFormalSettings.json();assert.equal(expiredSettingsBody.premiumActive,false);assert.deepEqual(expiredSettingsBody.saved,selectedSchedule);assert.deepEqual(expiredSettingsBody.effective,defaultSchedule);
  assert.equal((await reminderServiceResponse(formalReminderRequest({revision:1,schedule:selectedSchedule}),formalReminderConfig,formalReminderFactory)).status,403);
  console.log('Formal reminder settings actual Auth/ledger: scoped read/save retry, conflict, wrong epoch, free write refusal and expired retained preferences/default fallback. No notification dispatch or Apple signature.');
  console.log('Formal report shared handler actual Auth/ledger/RLS: paid report, exact enrollment, free foreign caller and ordinary expiry denial verified. Synthetic Apple transaction; no production deployment.');
  const expiredNewID=randomUUID();assert.equal((await attachmentServiceResponse(expiryRequest('POST',expiredNewID),expiryConfig,formalClient)).status,403);
  const expiredRead=await attachmentServiceResponse(expiryRequest('GET',expiryFile),expiryConfig,formalClient);assert.equal(expiredRead.status,200);assert.deepEqual(new Uint8Array(await expiredRead.arrayBuffer()),adapterBytes);
  const foreignRemoval=await attachmentServiceResponse(expiryRequest('DELETE',expiryFile,signup.data.session.access_token,epoch.data),expiryConfig,formalClient);assert.equal(foreignRemoval.status,404);
  const wrongEpochRemoval=await attachmentServiceResponse(expiryRequest('DELETE',expiryFile,otherSignup.data.session.access_token,randomUUID()),expiryConfig,formalClient);assert.equal(wrongEpochRemoval.status,404);
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(`${otherSignup.data.user.id}/${otherEpoch.data}/${expiryFile}.png`)).error,null);
  const expiredRemove=await attachmentServiceResponse(expiryRequest('DELETE',expiryFile),expiryConfig,formalClient);assert.equal(expiredRemove.status,200);assert.deepEqual(await expiredRemove.json(),{removed:true,attachmentId:expiryFile});
  const expiredGone=await admin.storage.from('ouchi-product-attachments').download(`${otherSignup.data.user.id}/${otherEpoch.data}/${expiryFile}.png`);assert.equal(expiredGone.data,null);assert.equal(expiredGone.error.code,'NoSuchKey');
  const expiredUsage=await admin.rpc('maintenance_attachment_usage',{target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data});assert.equal(expiredUsage.error,null);assert.equal(expiredUsage.data.usedFiles,1);assert.equal(expiredUsage.data.reservedFiles,0);
  console.log('Formal shared attachment handler actual Auth/ledger/Storage path: expired subscription denies new save, permits exact download and owner removal, denies foreign and stale-epoch removal, confirms physical absence and releases only removed-file quota. Synthetic transaction, no real Apple or production deployment.');
  assert.equal((await admin.rpc('apply_maintenance_verified_transaction',{payload:{...paidEvent,signedAt:now+1,revokedAt:now},proof_sha256:'e'.repeat(64)})).error,null);
  assert.equal((await reportRequest(otherHome)).status,403);
  const endedSettings=await settingsRequest(paidToken);assert.equal(endedSettings.status,200);const endedValue=await endedSettings.json();assert.equal(endedValue.premiumActive,false);assert.deepEqual(endedValue.effective,defaultSchedule);assert.deepEqual(endedValue.saved,selectedSchedule);
  assert.equal((await settingsRequest(paidToken,{revision:1,schedule:selectedSchedule})).status,403);
  console.log('Reminder settings actual Auth and API path verified; paid save, safe retry, conflict, expiry fallback and production refusal.');

  const deniedAfterRevocation=await uploadProductAttachment(paidRequest(),paidProduct,randomUUID(),storedAttachmentUploadServices(admin,'Sandbox'));assert.equal(deniedAfterRevocation.status,403);
  assert.equal((await admin.rpc('read_maintenance_attachment',paidReadArgs)).data.id,paidFile);
  let retainedDownload,foreignDownload,removedAttachment;
  try{process.env.NODE_ENV='development';process.env.OUCHI_ATTACHMENT_TEST_MODE='true';process.env.OUCHI_ATTACHMENT_TEST_URL=origin;process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY=service;retainedDownload=await formalAttachmentGET(new Request(origin+'/api/development/verified-product-attachments?attachmentId='+paidFile,{headers:{authorization:'Bearer '+otherSignup.data.session.access_token}}));foreignDownload=await formalAttachmentGET(new Request(origin+'/api/development/verified-product-attachments?attachmentId='+paidFile,{headers:{authorization:'Bearer '+signup.data.session.access_token}}));removedAttachment=await formalAttachmentDELETE(new Request(origin+'/api/development/verified-product-attachments?attachmentId='+paidFile,{method:'DELETE',headers:{authorization:'Bearer '+otherSignup.data.session.access_token}}));}
  finally{for(const key of routeEnvKeys){if(routeEnvBefore[key]===undefined)delete process.env[key];else process.env[key]=routeEnvBefore[key];}}
  assert.equal(removedAttachment.status,200);assert.deepEqual(await removedAttachment.json(),{removed:true,attachmentId:paidFile});
  const physicallyGone=await admin.storage.from('ouchi-product-attachments').download(`${otherSignup.data.user.id}/${otherEpoch.data}/${paidFile}.png`);assert.equal(physicallyGone.data,null);assert.equal(physicallyGone.error.code,'NoSuchKey');
  const releasedUsage=await admin.rpc('maintenance_attachment_usage',{target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data});assert.equal(releasedUsage.error,null);assert.equal(releasedUsage.data.usedFiles,0);
  assert.equal(foreignDownload.status,404);assert.equal(foreignDownload.headers.get('cache-control'),'no-store');assert.ok(!(await foreignDownload.text()).includes(paidFile));
  assert.equal(retainedDownload.status,200);assert.equal(retainedDownload.headers.get('cache-control'),'no-store');assert.deepEqual(new Uint8Array(await retainedDownload.arrayBuffer()),adapterBytes);
  assert.equal((await user.from('home_members').delete().eq('homeId',home).eq('user_id',otherSignup.data.user.id)).error,null);
  assert.equal((await admin.rpc('read_maintenance_attachment',sharedReaderArgs)).data,null);assert.deepEqual((await admin.rpc('page_maintenance_attachments',pageArgs)).data,{items:[],next:null});
  assert.equal((await user.from('home_members').insert({homeId:home,user_id:otherSignup.data.user.id,nickname:'Synthetic member'})).error,null);

  // Hold a real family upload at the HTTP gateway while owner deletion captures it.
  const lateFile=randomUUID(),lateAttempt=randomUUID(),lateBytes=Buffer.from([137,80,78,71,13,10,26,10]),lateHash=createHash('sha256').update(lateBytes).digest('hex');
  const lateReservation={target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,target_product:product,attachment_id:lateFile,byte_count:lateBytes.length,media_type:'image/png',measured_sha256:lateHash};
  const lateReserved=await admin.rpc('reserve_maintenance_attachment',lateReservation);assert.equal(lateReserved.error,null);assert.equal(lateReserved.data,lateFile);
  const lateWriteArgs={target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,target_attachment:lateFile,target_attempt:lateAttempt};
  const lateStarted=await admin.rpc('begin_maintenance_attachment_write',lateWriteArgs);assert.equal(lateStarted.error,null);assert.equal(lateStarted.data.started,true);
  const latePath=`${otherSignup.data.user.id}/${otherEpoch.data}/${lateFile}.png`;pausedFileID=lateFile;
  const delayedWriter=createClient(origin,service,{...options,global:{fetch:createAttachmentFetch(undefined,30000)}});
  const lateUpload=delayedWriter.storage.from('ouchi-product-attachments').upload(latePath,lateBytes,{contentType:'image/png',upsert:false}).then(result=>({result}),error=>({error}));
  let arrivalTimer;try{await Promise.race([writeArrived,new Promise((resolve,reject)=>{arrivalTimer=setTimeout(()=>reject(Error('Real delayed upload did not reach gateway')),5000);})]);}finally{clearTimeout(arrivalTimer);}
  // Normal product deletion must not lose the original owner's family file.
  const deletedProduct=await user.from('products').delete().eq('id',product).select('id');assert.equal(deletedProduct.error,null);assert.deepEqual(deletedProduct.data,[{id:product}]);
  const beforeLateWrite=await admin.storage.from('ouchi-product-attachments').download(latePath);assert.equal(beforeLateWrite.data,null);assert.equal(beforeLateWrite.error.code,'NoSuchKey');

  const pushID=randomUUID(),pushLease=randomUUID(),pushEndpoint='https://web.push.apple.com/synthetic-'+randomUUID();assert.equal((await admin.from('maintenance_push_subscriptions').insert({id:pushID,user_id:userID,endpoint:pushEndpoint,p256dh:'A'.repeat(87),auth:'A'.repeat(22),claim_token:pushLease,claimed_until:new Date(Date.now()+120000).toISOString()})).error,null);
  const testDispatchArgs={target_user:userID,target_endpoint:pushEndpoint};assert.equal((await admin.rpc('can_dispatch_maintenance_push_test',testDispatchArgs)).data,true);
  const dispatchArgs={subscription_id:pushID,delivery_token:pushLease};assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,true);assert.ok((await user.rpc('can_dispatch_maintenance_push',dispatchArgs)).error);
  const channelConfig=notificationChannelDeployment({url:'https://disposable.supabase.co/',key:service,storage:'verified-ledger',environment:'Production'},'true');assert.ok(channelConfig);
  const channelFactory=(_config,signal)=>createClient(origin,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)}});
  const channelRequest=(body,token=signup.data.session.access_token,capturedEpoch=epoch.data)=>new Request(origin+'/api/notification-channel',{method:body?'PUT':'GET',headers:{authorization:'Bearer '+token,'X-Ouchi-App-Epoch':capturedEpoch,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const initialChannel=await notificationChannelResponse(channelRequest(),channelConfig,channelFactory);assert.equal(initialChannel.status,200);assert.deepEqual(await initialChannel.json(),{environment:'Production',revision:0,channel:'both',nativeRegistered:false,purchaseAccountToken:epoch.data});
  assert.equal((await notificationChannelResponse(channelRequest({revision:0,channel:'native'}),channelConfig,channelFactory)).status,412);
  assert.equal((await notificationChannelResponse(channelRequest({revision:0,channel:'web'}),channelConfig,channelFactory)).status,200,'channel selection requires no premium');
  const freeChannelDevice=await admin.rpc('register_maintenance_native_scoped_push',{target_user:userID,verified_session:claims.session_id,expected_epoch:epoch.data,token:'f0'.repeat(32),push_environment:'Production',purchase_environment:'Production'});assert.equal(freeChannelDevice.error,null);
  const channelNative=await notificationChannelResponse(channelRequest({revision:1,channel:'native'}),channelConfig,channelFactory);assert.equal(channelNative.status,200);assert.equal((await channelNative.json()).revision,2);assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,false,'Production preference blocks normal Web send');
  const exactChannelRetry=await notificationChannelResponse(channelRequest({revision:1,channel:'native'}),channelConfig,channelFactory);assert.equal(exactChannelRetry.status,200);assert.equal((await exactChannelRetry.json()).revision,2);
  assert.equal((await notificationChannelResponse(channelRequest({revision:0,channel:'both'}),channelConfig,channelFactory)).status,409);assert.equal((await notificationChannelResponse(channelRequest(undefined,otherSignup.data.session.access_token),channelConfig,channelFactory)).status,403);
  const sandboxChannelConfig={...channelConfig,environment:'Sandbox'};assert.equal((await notificationChannelResponse(channelRequest({revision:0,channel:'web'}),sandboxChannelConfig,channelFactory)).status,200);assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,false,'Sandbox choice cannot reenable Production Web');
  assert.equal((await notificationChannelResponse(channelRequest({revision:2,channel:'both'}),channelConfig,channelFactory)).status,200);assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,true);assert.equal((await notificationChannelResponse(channelRequest({revision:1,channel:'both'}),sandboxChannelConfig,channelFactory)).status,200);
  console.log('Free notification channel actual Auth/PostgreSQL/API: both default, native registration prerequisite, exact Auth/enrollment/environment/revision, no premium requirement, idempotent acknowledgement, Production Web gate and isolated Sandbox choice. No notification sent.');
  const ownedNotice=randomUUID(),preservedNotice=randomUUID();
  const ownedPurchase={environment:'Sandbox',transactionId:'888',originalTransactionId:'887',accountToken:epoch.data,productId:'ouchi.tip.small',signedAt:100,purchasedAt:50};
  assert.equal((await admin.rpc('apply_maintenance_verified_transaction',{payload:ownedPurchase,proof_sha256:'1'.repeat(64)})).error,null);
  const ownedSubscription={environment:'Sandbox',transactionId:'885',originalTransactionId:'886',accountToken:epoch.data,productId:'ouchi.premium.monthly',signedAt:200,purchasedAt:100,expiresAt:1000};
  assert.equal((await admin.rpc('apply_maintenance_verified_transaction',{payload:ownedSubscription,proof_sha256:'3'.repeat(64)})).error,null);
  const ownedRenewal={environment:'Sandbox',originalTransactionId:'886',accountToken:epoch.data,productId:'ouchi.premium.monthly',signedAt:300,renewalDate:1000,autoRenewStatus:0,isInBillingRetryPeriod:false};
  assert.equal((await admin.rpc('apply_maintenance_verified_renewal',{payload:ownedRenewal,proof_sha256:'4'.repeat(64)})).error,null);
  for(const [noticeID,token,original] of [[ownedNotice,epoch.data,'887'],[preservedNotice,otherEpoch.data,'900']]){
   const payload={environment:'Sandbox',notificationId:noticeID,notificationType:'CONSUMPTION_REQUEST',signedAt:100,disposition:'needs_reconciliation',accountToken:token,originalTransactionId:original};
   const result=await admin.rpc('record_maintenance_verified_notification',{payload,proof_sha256:'2'.repeat(64)});assert.equal(result.error,null);assert.equal(result.data,'inserted');
  }
  const deletionRequest=()=>new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer '+signup.data.session.access_token},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',password:syntheticPassword})});
  const temporaryClients=[];const requestDeps=deletionRequestDependencies(admin,()=>{const client=createClient(origin,'synthetic-public-key',options);temporaryClients.push(client);return client;});
  const wrongPassword=new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer '+signup.data.session.access_token},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',password:'Wrong-synthetic-password'})});assert.equal((await handleAccountDeletionRequest(wrongPassword,requestDeps)).status,403);
  const submitted=await handleAccountDeletionRequest(deletionRequest(),requestDeps);assert.equal(submitted.status,202);const submittedBody=await submitted.json();assert.equal(submittedBody.state,'pending');assert.equal(submittedBody.epochID,epoch.data);const requested={data:submittedBody.requestID};
  const retrySubmitted=await handleAccountDeletionRequest(deletionRequest(),requestDeps);assert.equal(retrySubmitted.status,202);assert.equal((await retrySubmitted.json()).requestID,requested.data);assert.equal((await user.auth.getUser()).error,null);for(const temporary of temporaryClients){const session=await temporary.auth.getSession();assert.equal(session.error,null);assert.equal(session.data.session,null);}
  // Other earlier integration fixtures share this disposable database. Keep their
  // pending jobs out of this test's queue window, without altering production data.
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{input:`update maintenance_private.account_deletion_requests set available_at=now()+interval '1 day' where user_id<>'${userID}' and state='pending';`,timeout:10000,stdio:['pipe','pipe','pipe']});
  // Only this disposable database: app recovery metadata for two synthetic users.
  const recoverySql=sql=>execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1','-At'],{input:sql,timeout:10000,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  recoverySql(`insert into maintenance_private.reconciliation_jobs(user_id,app_epoch_id,environment,transaction_id) values('${userID}','${epoch.data}','Sandbox','synthetic-deletion-recovery'),('${otherSignup.data.user.id}','${epoch.data}','Sandbox','synthetic-other-recovery');`);
  const claim=await admin.rpc('claim_maintenance_account_deletion');assert.equal(claim.error,null);assert.equal(claim.data.requestID,requested.data);
  const progressArgs={target_request:requested.data,target_user:userID};assert.deepEqual((await admin.rpc('read_maintenance_deletion_progress',progressArgs)).data,{requestID:requested.data,userID,epochID:epoch.data,state:'running'});assert.equal((await admin.rpc('read_maintenance_deletion_progress',{...progressArgs,target_user:otherSignup.data.user.id})).data,null);assert.ok((await other.rpc('read_maintenance_deletion_progress',progressArgs)).error);
  const scope={requestID:claim.data.requestID,userID,epochID:epoch.data,leaseToken:claim.data.leaseToken},args={target_request:scope.requestID,target_user:userID,target_epoch:epoch.data,target_lease:scope.leaseToken};assert.equal((await admin.rpc('capture_maintenance_deletion_objects',args)).data,true);
  const capturedWhilePaused=await admin.rpc('read_maintenance_deletion_objects',args);assert.equal(capturedWhilePaused.error,null);assert.equal(capturedWhilePaused.data.length,2);assert.ok(capturedWhilePaused.data.some(item=>item.id===lateFile&&item.uploaderID===otherSignup.data.user.id));
  const lateAbsenceArgs={...args,target_attachment:lateFile};assert.equal((await admin.rpc('confirm_maintenance_deletion_object_absence',lateAbsenceArgs)).data,false);
  assert.ok((await admin.rpc('begin_maintenance_attachment_write',lateWriteArgs)).error);
  assert.ok((await admin.rpc('reserve_maintenance_attachment',{...reservation,attachment_id:randomUUID()})).error);assert.ok((await admin.rpc('finalize_maintenance_attachment',completion)).error);assert.equal((await admin.rpc('read_maintenance_attachment',sharedReaderArgs)).data,null);assert.deepEqual((await admin.rpc('page_maintenance_attachments',pageArgs)).data,{items:[],next:null});assert.equal((await admin.rpc('maintenance_attachment_usage',usageArgs)).data,null);
  assert.equal(await dispatchRegisteredSandboxPush(nativeRegistered.data,1,Date.now()+1000,dispatchDeps),'skipped');assert.equal(syntheticSends,2);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:nativeRegistered.data})).data,false);assert.ok((await admin.rpc('register_maintenance_native_push',nativeArgs)).error);
  assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,false);assert.equal((await admin.rpc('can_dispatch_maintenance_push_test',testDispatchArgs)).data,false);
  assert.equal((await admin.rpc('erase_maintenance_deletion_web_push',args)).data,true);assert.equal((await admin.rpc('erase_maintenance_deletion_web_push',args)).data,true);const gonePush=await admin.from('maintenance_push_subscriptions').select('id').eq('id',pushID);assert.equal(gonePush.error,null);assert.deepEqual(gonePush.data,[]);
  const sharedClosed=await other.from('products').select('id').eq('id',product);assert.equal(sharedClosed.error,null);assert.deepEqual(sharedClosed.data,[]);
  assert.ok((await other.from('products').insert({id:randomUUID(),homeId:home,categoryId:'air',name:'Blocked synthetic write'})).error);
  const ownOpen=await other.from('homes').select('id').eq('id',otherHome);assert.equal(ownOpen.error,null);assert.deepEqual(ownOpen.data,[{id:otherHome}]);
  const statusRequest=token=>new Request('https://example.invalid/deletion/'+requested.data,{headers:{authorization:'Bearer '+token}});
  const ownStatus=await handleAccountDeletionProgress(statusRequest(signup.data.session.access_token),requested.data,deletionProgressDependencies(admin));assert.equal(ownStatus.status,200);assert.deepEqual(await ownStatus.json(),{requestID:requested.data,epochID:epoch.data,state:'running'});const recoveredStatus=await handleAccountDeletionProgress(statusRequest(signup.data.session.access_token),null,deletionProgressDependencies(admin));assert.equal(recoveredStatus.status,200);assert.deepEqual(await recoveredStatus.json(),{requestID:requested.data,epochID:epoch.data,state:'running'});
  const foreignStatus=await handleAccountDeletionProgress(statusRequest(otherSignup.data.session.access_token),requested.data,deletionProgressDependencies(admin));assert.equal(foreignStatus.status,404);
  const secondStatus=await handleAccountDeletionProgress(statusRequest(secondSession.data.session.access_token),requested.data,deletionProgressDependencies(admin));assert.equal(secondStatus.status,200);
  assert.ok(secondClaims.exp>Math.floor(Date.now()/1000));
  assert.equal((await secondLogin.auth.signOut({scope:'local'})).error,null);
  assert.equal((await admin.rpc('maintenance_auth_session_is_current',{target_user:userID,verified_session:secondClaims.session_id})).data,false);
  assert.equal((await handleAccountDeletionProgress(statusRequest(secondSession.data.session.access_token),requested.data,deletionProgressDependencies(admin))).status,401);
  assert.equal((await admin.rpc('read_maintenance_session_deletion_progress',{target_user:userID,verified_session:secondClaims.session_id,target_request:requested.data})).data,null);
  assert.ok((await user.rpc('maintenance_auth_session_is_current',{target_user:userID,verified_session:claims.session_id})).error);
  assert.ok((await user.rpc('read_maintenance_session_deletion_progress',{target_user:userID,verified_session:claims.session_id,target_request:requested.data})).error);
  assert.equal((await handleAccountDeletionProgress(statusRequest(signup.data.session.access_token),requested.data,deletionProgressDependencies(admin))).status,200);
  console.log('Deletion progress live-session check verified; revoked unexpired bearer rejected, original session preserved.');
  assert.equal((await admin.rpc('erase_maintenance_deletion_reconciliation',args)).data,false);
  assert.equal((await admin.rpc('erase_maintenance_deletion_records',args)).data,false);
  assert.equal((await admin.rpc('confirm_maintenance_deletion_object_absence',{...args,target_attachment:file})).data,false);
  const blocked=await runAccountDeletion(scope,storedDeletionDependencies(admin,{eraseNativeDevices:async()=>false,finalizeIdentityAndRetention:async()=>{throw Error('must not finalize');},markComplete:async()=>{throw Error('must not complete');}}));assert.deepEqual(blocked,{state:'pending'});assert.ok((await admin.storage.from('ouchi-product-attachments').download(path)).data);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:nativeRegistered.data})).data,false);assert.equal((await admin.rpc('erase_maintenance_deletion_native_push',args)).data,true);assert.equal((await admin.rpc('erase_maintenance_deletion_native_delivery_identities',args)).data,true);
  // Removing currently absent files cannot acknowledge a still-running upload.
  await assert.rejects(()=>erase(admin,scope),/Object (acknowledgement unavailable|removal not confirmed)/);
  assert.equal((await admin.rpc('confirm_maintenance_deletion_object_absence',lateAbsenceArgs)).data,false);assert.equal((await admin.rpc('erase_maintenance_deletion_records',args)).data,false);
  releaseWrite();const lateUploaded=await lateUpload;assert.equal(lateUploaded.error,undefined);assert.equal(lateUploaded.result.error,null);
  const lateDownloaded=await admin.storage.from('ouchi-product-attachments').download(latePath);assert.equal(lateDownloaded.error,null);assert.deepEqual(Buffer.from(await lateDownloaded.data.arrayBuffer()),lateBytes);
  assert.equal((await admin.rpc('confirm_maintenance_deletion_object_absence',lateAbsenceArgs)).data,false);
  const lateSettled=await admin.rpc('settle_maintenance_attachment_write',{target_attachment:lateFile,target_attempt:lateAttempt});assert.equal(lateSettled.error,null);assert.equal(lateSettled.data,true);
  const stillPending=await admin.rpc('read_maintenance_deletion_objects',args);assert.equal(stillPending.error,null);assert.ok(stillPending.data.some(item=>item.id===lateFile));
  assert.deepEqual(await erase(admin,scope),{completed:stillPending.data.length,allObjectsConfirmed:true});
  const lateRemoved=await admin.storage.from('ouchi-product-attachments').download(latePath);assert.equal(lateRemoved.data,null);assert.equal(lateRemoved.error.code,'NoSuchKey');
const missing=await admin.storage.from('ouchi-product-attachments').download(path);assert.equal(missing.data,null);assert.ok(missing.error instanceof StorageApiError);assert.equal(missing.error.code,'NoSuchKey');assert.deepEqual((await admin.rpc('read_maintenance_deletion_objects',args)).data,[]);
  assert.deepEqual(await erase(admin,scope),{completed:0,allObjectsConfirmed:true});assert.equal((await user.auth.getUser()).error,null);
  assert.equal((await admin.rpc('erase_maintenance_deletion_records',args)).data,true);assert.equal((await admin.rpc('erase_maintenance_deletion_records',args)).data,true);
  const notificationCount=id=>Number(recoverySql(`select count(*) from maintenance_private.verified_notifications where notification_id='${id}';`).trim());
  assert.equal(notificationCount(ownedNotice),1);assert.equal(notificationCount(preservedNotice),1);
  assert.equal((await admin.rpc('erase_maintenance_deletion_notifications',{...args,target_lease:randomUUID()})).data,false);assert.equal(notificationCount(ownedNotice),1);
  assert.equal((await admin.rpc('erase_maintenance_deletion_notifications',args)).data,true);assert.equal((await admin.rpc('erase_maintenance_deletion_notifications',args)).data,true);
  assert.equal(notificationCount(ownedNotice),0);assert.equal(notificationCount(preservedNotice),1);
  assert.equal(Number(recoverySql("select count(*) from maintenance_private.verified_transactions where environment='Sandbox' and transaction_id='888';").trim()),1);
  console.log('Actual leased notification erasure: own scoped inbox removed, wrong lease refused, other-owner inbox and immutable purchase ledger preserved; no account completion claimed.');

  assert.ok((await user.rpc('erase_maintenance_deletion_reconciliation',args)).error);
  assert.equal((await admin.rpc('erase_maintenance_deletion_reconciliation',{...args,target_lease:randomUUID()})).data,false);
  assert.equal((await admin.rpc('erase_maintenance_deletion_reconciliation',args)).data,true);
  assert.equal((await admin.rpc('erase_maintenance_deletion_reconciliation',args)).data,true);
  assert.equal(recoverySql(`select count(*) from maintenance_private.reconciliation_jobs where user_id='${userID}';`).trim(),'0');
  assert.equal(recoverySql(`select count(*) from maintenance_private.reconciliation_jobs where user_id='${otherSignup.data.user.id}' and transaction_id='synthetic-other-recovery';`).trim(),'1');
  assert.equal((await admin.rpc('read_maintenance_deletion_progress',progressArgs)).data.state,'running');
  const removedHomes=await admin.from('homes').select('id').eq('id',home);assert.equal(removedHomes.error,null);assert.deepEqual(removedHomes.data,[]);const removedProducts=await admin.from('products').select('id').eq('id',product);assert.equal(removedProducts.error,null);assert.deepEqual(removedProducts.data,[]);
  const preserved=await other.from('homes').select('id').eq('id',otherHome);assert.equal(preserved.error,null);assert.deepEqual(preserved.data,[{id:otherHome}]);assert.equal((await user.auth.getUser()).error,null);assert.equal((await admin.rpc('maintenance_deletion_lease_is_current',args)).data,true);

  // Registry erasure is tested with a synthetic native token; actual APNs delivery
  // and device-side removal are NOT proven. Identity finalization remains pending.
  // Disposable preference row: prove real deletion lease closes only this epoch.
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','auth_test'],{
   input:`insert into maintenance_private.reminder_schedules values('${userID}','${epoch.data}','Sandbox',1230,array[7]::smallint[],1,false,1);`,timeout:10000,stdio:['pipe','pipe','pipe']});
  assert.ok((await user.rpc('erase_maintenance_deletion_reminder_schedule',args)).error);
  assert.equal((await admin.rpc('erase_maintenance_deletion_reminder_schedule',{...args,target_lease:randomUUID()})).data,false);
  assert.equal((await admin.rpc('erase_maintenance_deletion_reminder_schedule',args)).data,true);
  assert.equal((await admin.rpc('erase_maintenance_deletion_reminder_schedule',args)).data,true);
  console.log('Reminder settings actual deletion lease cleanup verified; repeat confirmed absence.');
  const deletionConsent=randomUUID(),foreignConsent=randomUUID();
  recoverySql(`insert into maintenance_private.enrollment_consents values('${deletionConsent}','${userID}','${randomUUID()}','${randomUUID()}','${epoch.data}',now()+interval '5 minutes'),('${foreignConsent}','${otherSignup.data.user.id}','${randomUUID()}','${randomUUID()}','${randomUUID()}',now()+interval '5 minutes');`);
  assert.ok((await user.rpc('erase_maintenance_deletion_enrollment_consents',args)).error);
  assert.equal((await admin.rpc('erase_maintenance_deletion_enrollment_consents',{...args,target_lease:randomUUID()})).data,false);
  assert.ok((await user.rpc('erase_maintenance_deletion_purchase_ledger',args)).error);assert.equal((await admin.rpc('erase_maintenance_deletion_purchase_ledger',{...args,target_lease:randomUUID()})).data,false);
  const priorEpoch=randomUUID(),foreignPriorEpoch=randomUUID(),priorConsent=randomUUID();
  recoverySql(`insert into maintenance_private.enrollment_consents values('${priorConsent}','${userID}','${randomUUID()}','${randomUUID()}','${priorEpoch}',now()+interval '5 minutes');insert into maintenance_private.notification_channels values('${userID}','${priorEpoch}','Sandbox','web',1),('${otherSignup.data.user.id}','${foreignPriorEpoch}','Sandbox','web',1);insert into maintenance_private.reminder_schedules values('${userID}','${priorEpoch}','Sandbox',600,array[1]::smallint[],0,true,1),('${otherSignup.data.user.id}','${foreignPriorEpoch}','Sandbox',600,array[1]::smallint[],0,true,1);insert into maintenance_private.reconciliation_jobs(user_id,app_epoch_id,environment,transaction_id) values('${userID}','${priorEpoch}','Sandbox','prior-deletion-user'),('${otherSignup.data.user.id}','${foreignPriorEpoch}','Sandbox','prior-deletion-foreign');`);
  assert.ok((await user.rpc('erase_maintenance_deletion_prior_preferences',args)).error);
  assert.equal((await admin.rpc('erase_maintenance_deletion_prior_preferences',{...args,target_lease:randomUUID()})).data,false);
  const preferenceTables=['enrollment_consents','notification_channels','reminder_schedules','reconciliation_jobs'];
  const foreignPreferenceSnapshot=Object.fromEntries(preferenceTables.map(table=>[table,recoverySql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from maintenance_private.${table} t where user_id='${otherSignup.data.user.id}';`).trim()]));
  let finalized=0,completed=0;const partial=await runAccountDeletion(scope,storedDeletionDependencies(admin,{eraseNativeDevices:async()=>true,finalizeIdentityAndRetention:async()=>{finalized++;return false;},markComplete:async()=>{completed++;return true;}}));assert.deepEqual(partial,{state:'pending'});assert.equal(finalized,1);assert.equal(completed,0);
  assert.equal(recoverySql(`select count(*) from maintenance_private.account_deletion_objects where request_id='${scope.requestID}';`).trim(),'0');
  assert.equal((await admin.rpc('read_maintenance_deletion_progress',progressArgs)).data.state,'running');
  assert.equal(recoverySql(`select count(*) from maintenance_private.enrollment_consents where request_id='${deletionConsent}';`).trim(),'0');
  assert.equal(recoverySql(`select count(*) from maintenance_private.enrollment_consents where request_id='${foreignConsent}';`).trim(),'1');
  assert.equal((await admin.rpc('erase_maintenance_deletion_enrollment_consents',args)).data,true);
  for(const table of preferenceTables){
   assert.equal(recoverySql(`select count(*) from maintenance_private.${table} where user_id='${userID}';`).trim(),'0');
   assert.equal(recoverySql(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from maintenance_private.${table} t where user_id='${otherSignup.data.user.id}';`).trim(),foreignPreferenceSnapshot[table],'all foreign preference contents preserved');
  }
  assert.equal((await admin.rpc('erase_maintenance_deletion_prior_preferences',args)).data,true);
  console.log('Actual prior enrollment cleanup: all target consent/recovery/channel/schedule generations removed; foreign generations preserved, repeated absence, wrong lease/browser denied. No completion.');
  console.log('Actual deletion consent erasure: target closed epoch removed after confirmed household/file erasure, foreign consent/shared Auth preserved, wrong lease/browser denied, final account status still pending.');
  for(const table of ['transaction_ownership','verified_transactions','verified_renewals'])assert.equal(recoverySql(`select count(*) from maintenance_private.${table} where user_id='${userID}';`).trim(),'0');
  assert.equal(recoverySql(`select count(*) from maintenance_private.verified_transactions where environment='Sandbox' and transaction_id='901' and user_id='${otherSignup.data.user.id}';`).trim(),'1');
  assert.equal((await admin.rpc('erase_maintenance_deletion_purchase_ledger',args)).data,true);
  console.log('Actual Ouchi purchase ledger erasure: target transaction ownership, tip/subscription periods and renewal removed, another owner period preserved; repeat absence, wrong lease/browser denied. No Apple cancellation/transfer or final identity completion.');
  console.log('Actual deletion inventory minimization: confirmed object paths removed only after record erasure, pending final identity stage never claims complete.');
  // Separate synthetic user: prove the strict guard after its identity rows are
  // erased, without revoking or deleting shared Auth and without reenrollment.
  const guard=createClient(origin,'synthetic-public-key',options);
  const guardSignup=await guard.auth.signUp({email:`enrollment-${randomUUID()}@example.invalid`,password:syntheticPassword});assert.equal(guardSignup.error,null);assert.ok(guardSignup.data.session);
  const guardID=guardSignup.data.user.id,guardToken=guardSignup.data.session.access_token,guardSession=JSON.parse(Buffer.from(guardToken.split('.')[1],'base64url')).session_id;
  const guardArgs={target_user:guardID,verified_session:guardSession};const guardEpoch=await admin.rpc('current_maintenance_purchase_account',guardArgs);assert.equal(guardEpoch.error,null);assert.ok(guardEpoch.data);
  const guardHome=randomUUID();assert.equal((await guard.from('homes').insert({id:guardHome,owner_id:guardID,name:'Synthetic enrollment guard'})).error,null);
  const freshGuard=createClient(origin,'synthetic-public-key',options);const freshLogin=await freshGuard.auth.signInWithPassword({email:guardSignup.data.user.email,password:syntheticPassword});assert.equal(freshLogin.error,null);const freshSession=JSON.parse(Buffer.from(freshLogin.data.session.access_token.split('.')[1],'base64url')).session_id;assert.notEqual(freshSession,guardSession);
  recoverySql('update maintenance_private.enrollment_policy set require_explicit=true where id=1;');
  assert.equal((await admin.rpc('maintenance_explicit_enrollment_is_required')).data,true);
  assert.equal((await admin.rpc('current_maintenance_purchase_account',guardArgs)).data,guardEpoch.data);
  assert.equal((await guard.from('homes').select('id').eq('id',guardHome)).data.length,1);
  assert.equal((await admin.rpc('current_maintenance_purchase_account',{target_user:guardID,verified_session:freshSession})).data,null);
  assert.deepEqual((await freshGuard.from('homes').select('id').eq('id',guardHome)).data,[]);
  assert.equal((await freshGuard.from('homes').insert({id:randomUUID(),owner_id:guardID,name:'Must refuse implicit enrollment'})).error?.code,'42501');
  recoverySql(`begin;delete from maintenance_private.app_session_epochs where user_id='${guardID}';delete from maintenance_private.app_epochs where user_id='${guardID}';delete from maintenance_private.account_access where user_id='${guardID}';commit;`);
  for(const sessionID of [guardSession,freshSession])assert.equal((await admin.rpc('current_maintenance_purchase_account',{target_user:guardID,verified_session:sessionID})).data,null);
  assert.deepEqual((await guard.from('homes').select('id').eq('id',guardHome)).data,[]);
  assert.equal(recoverySql(`select count(*) from maintenance_private.app_epochs where user_id='${guardID}';`).trim(),'0');
  assert.equal((await guard.auth.getUser()).error,null,'shared Auth original session remains valid');assert.equal((await freshGuard.auth.getUser()).error,null,'other shared Auth login remains valid');
  assert.deepEqual((await other.from('homes').select('id').eq('id',otherHome)).data,[{id:otherHome}]);
  console.log('Actual explicit enrollment guard: mapped live session works, unmapped login denied, erased identity not automatically recreated, shared Auth and other owner preserved. Strict policy enabled only inside disposable test; no new enrollment granted.');
  // Explicit enrollment API: same real Auth/DB, fresh temporary login, no Apple.
  const newAccount=createClient(origin,'synthetic-public-key',options),newSignup=await newAccount.auth.signUp({email:`consent-${randomUUID()}@example.invalid`,password:syntheticPassword});assert.equal(newSignup.error,null);assert.ok(newSignup.data.session);
  const consentID=randomUUID(),newBearer=newSignup.data.session.access_token,newUserID=newSignup.data.user.id;
  const enrollmentConfig={url:'https://synthetic.supabase.co/',key:'synthetic-service',publishableKey:'synthetic-public'};
  const enrollmentFactories={database:()=>admin,temporaryAuth:()=>createClient(origin,'synthetic-public-key',options)};
  const enrollmentRequest=(token,post=false,id=consentID)=>new Request('https://example.invalid/api/account/enrollment',{method:post?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:post?JSON.stringify({confirmation:'ENROLL_OUCHI_MAINTENANCE',password:syntheticPassword,requestID:id}):undefined});
  const beforeEnrollment=await accountEnrollmentResponse(enrollmentRequest(newBearer),enrollmentConfig,enrollmentFactories);assert.equal(beforeEnrollment.status,200);assert.equal((await beforeEnrollment.json()).enrolled,false);
  const enrolled=await accountEnrollmentResponse(enrollmentRequest(newBearer,true),enrollmentConfig,enrollmentFactories);assert.equal(enrolled.status,200);const consentReceipt=await enrolled.json();assert.equal(consentReceipt.userID,newUserID);assert.equal(consentReceipt.requestID,consentID);
  const afterEnrollment=await accountEnrollmentResponse(enrollmentRequest(newBearer),enrollmentConfig,enrollmentFactories);assert.equal(afterEnrollment.status,200);assert.equal((await afterEnrollment.json()).epochID,consentReceipt.epochID);
  assert.equal(recoverySql(`select count(*) from maintenance_private.enrollment_consents where request_id='${consentID}';`).trim(),'1');
  assert.equal(recoverySql(`select count(*) from auth.sessions s join maintenance_private.enrollment_consents c on c.reauthentication_session=s.id where c.request_id='${consentID}';`).trim(),'0','temporary fresh login revoked after receipt');
  assert.equal((await newAccount.auth.getUser()).error,null,'original shared login preserved');
  const retry=await accountEnrollmentResponse(enrollmentRequest(newBearer,true),enrollmentConfig,enrollmentFactories);assert.equal(retry.status,503,'new proof cannot reuse consumed request');
  assert.equal(recoverySql(`select count(*) from maintenance_private.enrollment_consents where request_id='${consentID}';`).trim(),'1');
  assert.equal((await accountEnrollmentResponse(enrollmentRequest(signup.data.session.access_token,true,randomUUID()),enrollmentConfig,enrollmentFactories)).status,503,'deletion still running cannot reopen');
  const originalSession=JSON.parse(Buffer.from(signup.data.session.access_token.split('.')[1],'base64url')).session_id;
  assert.equal(recoverySql(`select receipt_sessions_captured from maintenance_private.account_deletion_requests where id='${scope.requestID}';`).trim(),'t');
  const identityArgs={target_request:scope.requestID,target_user:scope.userID,target_epoch:scope.epochID,target_lease:scope.leaseToken};
  assert.equal((await admin.rpc('erase_maintenance_deletion_identity',{...identityArgs,target_lease:randomUUID()})).data,false);
  assert.ok((await user.rpc('erase_maintenance_deletion_identity',identityArgs)).error);
  const identityErased=await admin.rpc('erase_maintenance_deletion_identity',identityArgs);assert.equal(identityErased.error,null);assert.equal(identityErased.data,true);
  assert.equal((await admin.rpc('erase_maintenance_deletion_identity',identityArgs)).data,true);
  assert.equal((await admin.rpc('maintenance_deletion_identity_is_erased',identityArgs)).data,true);
  let recoveryTail=0,recoveryComplete=0;
  const resumed=await runAccountDeletion(scope,storedDeletionDependencies(admin,{eraseNativeDevices:async()=>{throw Error('must not replay erased stages');},finalizeIdentityAndRetention:async()=>{recoveryTail++;return false;},markComplete:async()=>{recoveryComplete++;return true;}}));
  assert.deepEqual(resumed,{state:'pending'});assert.equal(recoveryTail,1);assert.equal(recoveryComplete,0);
  console.log('Actual atomic identity erasure: exact live lease and strict policy, absence preflight, identity/session links removed, durable checkpoint resumes mandatory retention without replay, wrong lease/browser denied; no completion.');
  const independentProgress=await admin.rpc('read_maintenance_session_deletion_progress',{target_user:userID,verified_session:originalSession,target_request:scope.requestID});assert.equal(independentProgress.error,null);assert.equal(independentProgress.data.state,'running');assert.equal(independentProgress.data.epochID,epoch.data);
  assert.equal((await admin.rpc('read_maintenance_session_deletion_progress',{target_user:userID,verified_session:randomUUID(),target_request:scope.requestID})).data,null);
  assert.equal((await admin.rpc('current_maintenance_purchase_account',{target_user:userID,verified_session:originalSession})).data,null);
  assert.equal((await user.auth.getUser()).error,null,'shared Auth preserved after application identity erasure');
  console.log('Actual independent deletion receipt: captured original Auth session still reads pending after synthetic app identity erasure; unmapped session denied; strict initializer cannot recreate enrollment; shared Auth preserved. No completion or production erasure.');
  const deletionCompletion=storedDeletionCompletion(admin);
  assert.equal(await deletionCompletion(scope),false,'real DB requires retention evidence beyond identity absence');
  assert.equal(recoverySql(`select has_table_privilege('service_role','maintenance_private.deletion_retention_checks','INSERT');`).trim(),'f','runtime cannot manufacture retention approval');
  assert.ok((await user.rpc('complete_maintenance_account_deletion',identityArgs)).error);
  // Privileged disposable fixture only. This does not approve production
  // unassociated-event/log/backup retention or deploy a retention checker.
  recoverySql(`insert into maintenance_private.deletion_retention_checks values('${scope.requestID}','synthetic-disposable-policy',now(),now()+interval '5 minutes',600);`);
  assert.equal((await admin.rpc('complete_maintenance_account_deletion',{...identityArgs,target_lease:randomUUID()})).data,false);
  assert.equal(await deletionCompletion(scope),true);
  const completedExpiry=recoverySql(`select receipt_expires_at from maintenance_private.account_deletion_requests where id='${scope.requestID}';`).trim();
  assert.equal(await deletionCompletion(scope),true);assert.equal(recoverySql(`select receipt_expires_at from maintenance_private.account_deletion_requests where id='${scope.requestID}';`).trim(),completedExpiry);
  const afterCommit=await runAccountDeletion(scope,storedDeletionDependencies(admin,{eraseNativeDevices:async()=>{throw Error('must not replay');},finalizeIdentityAndRetention:async()=>{throw Error('must not replay');},markComplete:async()=>{throw Error('must not replay');}}));assert.deepEqual(afterCommit,{state:'complete'});
  assert.equal((await admin.rpc('read_maintenance_session_deletion_progress',{target_user:userID,verified_session:originalSession,target_request:scope.requestID})).data.state,'complete');
  assert.equal((await admin.rpc('maintenance_deletion_completion_is_confirmed',{...identityArgs,target_lease:randomUUID()})).data,false);
  recoverySql(`update maintenance_private.account_deletion_requests set updated_at=now()-interval '2 minutes',receipt_expires_at=now()-interval '1 minute' where id='${scope.requestID}';`);
  assert.equal((await admin.rpc('read_maintenance_session_deletion_progress',{target_user:userID,verified_session:originalSession,target_request:scope.requestID})).data,null);
  assert.equal((await admin.rpc('prune_maintenance_completed_deletion_receipts',{batch_size:500})).data,1);
  for(const table of ['account_deletion_requests','deletion_receipt_sessions','deletion_retention_checks'])assert.equal(recoverySql(`select count(*) from maintenance_private.${table} where ${table==='account_deletion_requests'?'id':'request_id'}='${scope.requestID}';`).trim(),'0');
  assert.equal((await user.auth.getUser()).error,null,'shared Auth survives completion fixture and finite receipt cleanup');
  console.log('Actual completion boundary with synthetic privileged retention fixture: absent evidence refused, exact lease completes once, lost acknowledgement recovered without replay, expiry unchanged, expired receipt/check/request physically removed; shared Auth preserved. No real retention approval or production completion.');
  console.log('Actual explicit consent Auth/PostgreSQL/API: read-only absent state, verified fresh temporary login, exact enrollment receipt/readback, temporary session revoked, duplicate request refused without second grant, pending deletion cannot reopen; no premium or Apple transaction.');



 }finally{releaseWrite();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
