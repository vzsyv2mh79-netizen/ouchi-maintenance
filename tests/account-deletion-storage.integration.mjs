import test from 'node:test';import assert from 'node:assert/strict';import {createServer,request as proxyRequest} from 'node:http';import {randomUUID,createHmac,createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createClient,StorageApiError} from '@supabase/supabase-js';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/account-deletion-objects.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {eraseAccountDeletionObjects:erase}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const compiled=async file=>{const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));};
const {handleAccountDeletionProgress}=await compiled('lib/account-deletion-progress.ts');
const {deletionProgressDependencies}=await compiled('lib/account-deletion-progress-store.ts');
const {runAccountDeletion}=await compiled('lib/account-deletion-worker.ts');
const {dispatchRegisteredSandboxPush}=await compiled('lib/native-push-dispatch.ts');
const {createAttachmentFetch}=await compiled('lib/attachment-fetch.ts');
const {storedNativePushDispatch}=await compiled('lib/native-push-dispatch-store.ts');
const attachmentModules=new Map();
function attachmentModule(name){
 if(attachmentModules.has(name))return attachmentModules.get(name);
 let source=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(attachmentModule(dependency))}`);
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');attachmentModules.set(name,url);return url;
}
const {storedAttachmentUploadServices}=await import(attachmentModule('attachment-upload-store'));
const {uploadProductAttachment}=await import(attachmentModule('attachment-upload'));
const formalRouteCode=ts.transpileModule(readFileSync('app/api/development/verified-product-attachments/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
 .replace(/from ['"]@\/lib\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(attachmentModule(name))}`)
 .replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {POST:formalAttachmentPOST,GET:formalAttachmentGET}=await import('data:text/javascript;base64,'+Buffer.from(formalRouteCode).toString('base64'));


const workerStoreCode=ts.transpileModule(readFileSync('lib/account-deletion-worker-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'./account-deletion-objects'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(code).toString('base64')));
const {storedDeletionDependencies}=await import('data:text/javascript;base64,'+Buffer.from(workerStoreCode).toString('base64'));
const {handleAccountDeletionRequest}=await compiled('lib/account-deletion-request.ts');
const sessionCode=ts.transpileModule(readFileSync('lib/verified-app-session.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const requestStoreCode=ts.transpileModule(readFileSync('lib/account-deletion-request-store.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'./verified-app-session'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(sessionCode).toString('base64')));
const {deletionRequestDependencies}=await import('data:text/javascript;base64,'+Buffer.from(requestStoreCode).toString('base64'));
test('actual private Storage removal verifies absence and persists exact leased deletion progress',{skip:process.env.OUCHI_DELETION_STORAGE_TEST!=='true',timeout:60000},async()=>{
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
  let syntheticSends=0;const dispatchDeps=storedNativePushDispatch(admin,async input=>{syntheticSends++;assert.equal(input.deviceToken,nativeArgs.token);assert.equal(input.bundleId,'jp.ouchi.maintenance');return 'accepted';});
  assert.equal(await dispatchRegisteredSandboxPush(nativeRegistered.data,1,Date.now()+1000,dispatchDeps),'accepted');assert.equal(syntheticSends,1);
  assert.ok((await user.rpc('read_maintenance_native_sandbox_destination',{registration_id:nativeRegistered.data})).error);
  const home=randomUUID(),product=randomUUID(),file=randomUUID();assert.equal((await user.from('homes').insert({id:home,owner_id:userID,name:'Synthetic deletion home',kind:'home'})).error,null);assert.equal((await user.from('products').insert({id:product,homeId:home,categoryId:'air',name:'Synthetic deletion product'})).error,null);
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
  const adapterBytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const paidRequest=()=>new Request(origin+'/api/development/verified-product-attachments?productId='+paidProduct+'&attachmentId='+paidFile,{method:'POST',headers:{authorization:'Bearer '+otherSignup.data.session.access_token,'content-type':'image/png'},body:adapterBytes});
  const routeEnvKeys=['NODE_ENV','OUCHI_ATTACHMENT_TEST_MODE','OUCHI_ATTACHMENT_TEST_URL','OUCHI_ATTACHMENT_TEST_SERVICE_KEY'],routeEnvBefore=Object.fromEntries(routeEnvKeys.map(key=>[key,process.env[key]]));
  let paidResult;
  try{process.env.NODE_ENV='development';process.env.OUCHI_ATTACHMENT_TEST_MODE='true';process.env.OUCHI_ATTACHMENT_TEST_URL=origin;process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY=service;paidResult=await formalAttachmentPOST(paidRequest());}
  finally{for(const key of routeEnvKeys){if(routeEnvBefore[key]===undefined)delete process.env[key];else process.env[key]=routeEnvBefore[key];}}
assert.equal(paidResult.status,200);assert.deepEqual(await paidResult.json(),{saved:true,attachmentId:paidFile});
  const paidRetry=await uploadProductAttachment(paidRequest(),paidProduct,paidFile,storedAttachmentUploadServices(admin,'Sandbox'));assert.equal(paidRetry.status,200);
  const paidReadArgs={target_user:otherSignup.data.user.id,verified_session:otherClaims.session_id,expected_epoch:otherEpoch.data,attachment_id:paidFile};
  assert.equal((await admin.rpc('read_maintenance_attachment',paidReadArgs)).data.id,paidFile);
  assert.equal((await admin.rpc('apply_maintenance_verified_transaction',{payload:{...paidEvent,signedAt:now+1,revokedAt:now},proof_sha256:'e'.repeat(64)})).error,null);
  const deniedAfterRevocation=await uploadProductAttachment(paidRequest(),paidProduct,randomUUID(),storedAttachmentUploadServices(admin,'Sandbox'));assert.equal(deniedAfterRevocation.status,403);
  assert.equal((await admin.rpc('read_maintenance_attachment',paidReadArgs)).data.id,paidFile);
  let retainedDownload;
  try{process.env.NODE_ENV='development';process.env.OUCHI_ATTACHMENT_TEST_MODE='true';process.env.OUCHI_ATTACHMENT_TEST_URL=origin;process.env.OUCHI_ATTACHMENT_TEST_SERVICE_KEY=service;retainedDownload=await formalAttachmentGET(new Request(origin+'/api/development/verified-product-attachments?attachmentId='+paidFile,{headers:{authorization:'Bearer '+otherSignup.data.session.access_token}}));}
  finally{for(const key of routeEnvKeys){if(routeEnvBefore[key]===undefined)delete process.env[key];else process.env[key]=routeEnvBefore[key];}}
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
  const beforeLateWrite=await admin.storage.from('ouchi-product-attachments').download(latePath);assert.equal(beforeLateWrite.data,null);assert.equal(beforeLateWrite.error.code,'NoSuchKey');

  const pushID=randomUUID(),pushLease=randomUUID(),pushEndpoint='https://web.push.apple.com/synthetic-'+randomUUID();assert.equal((await admin.from('maintenance_push_subscriptions').insert({id:pushID,user_id:userID,endpoint:pushEndpoint,p256dh:'A'.repeat(87),auth:'A'.repeat(22),claim_token:pushLease,claimed_until:new Date(Date.now()+120000).toISOString()})).error,null);
  const testDispatchArgs={target_user:userID,target_endpoint:pushEndpoint};assert.equal((await admin.rpc('can_dispatch_maintenance_push_test',testDispatchArgs)).data,true);
  const dispatchArgs={subscription_id:pushID,delivery_token:pushLease};assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,true);assert.ok((await user.rpc('can_dispatch_maintenance_push',dispatchArgs)).error);
  const deletionRequest=()=>new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer '+signup.data.session.access_token},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',password:syntheticPassword})});
  const temporaryClients=[];const requestDeps=deletionRequestDependencies(admin,()=>{const client=createClient(origin,'synthetic-public-key',options);temporaryClients.push(client);return client;});
  const wrongPassword=new Request('https://example.invalid/deletion',{method:'POST',headers:{authorization:'Bearer '+signup.data.session.access_token},body:JSON.stringify({confirmation:'DELETE_OUCHI_ACCOUNT',password:'Wrong-synthetic-password'})});assert.equal((await handleAccountDeletionRequest(wrongPassword,requestDeps)).status,403);
  const submitted=await handleAccountDeletionRequest(deletionRequest(),requestDeps);assert.equal(submitted.status,202);const submittedBody=await submitted.json();assert.equal(submittedBody.state,'pending');const requested={data:submittedBody.requestID};
  const retrySubmitted=await handleAccountDeletionRequest(deletionRequest(),requestDeps);assert.equal(retrySubmitted.status,202);assert.equal((await retrySubmitted.json()).requestID,requested.data);assert.equal((await user.auth.getUser()).error,null);for(const temporary of temporaryClients){const session=await temporary.auth.getSession();assert.equal(session.error,null);assert.equal(session.data.session,null);}
  // Other earlier integration fixtures share this disposable database. Keep their
  // pending jobs out of this test's queue window, without altering production data.
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{input:`update maintenance_private.account_deletion_requests set available_at=now()+interval '1 day' where user_id<>'${userID}' and state='pending';`,timeout:10000,stdio:['pipe','pipe','pipe']});
  const claim=await admin.rpc('claim_maintenance_account_deletion');assert.equal(claim.error,null);assert.equal(claim.data.requestID,requested.data);
  const progressArgs={target_request:requested.data,target_user:userID};assert.deepEqual((await admin.rpc('read_maintenance_deletion_progress',progressArgs)).data,{requestID:requested.data,userID,state:'running'});assert.equal((await admin.rpc('read_maintenance_deletion_progress',{...progressArgs,target_user:otherSignup.data.user.id})).data,null);assert.ok((await other.rpc('read_maintenance_deletion_progress',progressArgs)).error);
  const scope={requestID:claim.data.requestID,userID,epochID:epoch.data,leaseToken:claim.data.leaseToken},args={target_request:scope.requestID,target_user:userID,target_epoch:epoch.data,target_lease:scope.leaseToken};assert.equal((await admin.rpc('capture_maintenance_deletion_objects',args)).data,true);
  const capturedWhilePaused=await admin.rpc('read_maintenance_deletion_objects',args);assert.equal(capturedWhilePaused.error,null);assert.equal(capturedWhilePaused.data.length,2);assert.ok(capturedWhilePaused.data.some(item=>item.id===lateFile&&item.uploaderID===otherSignup.data.user.id));
  const lateAbsenceArgs={...args,target_attachment:lateFile};assert.equal((await admin.rpc('confirm_maintenance_deletion_object_absence',lateAbsenceArgs)).data,false);
  assert.ok((await admin.rpc('begin_maintenance_attachment_write',lateWriteArgs)).error);
  assert.ok((await admin.rpc('reserve_maintenance_attachment',{...reservation,attachment_id:randomUUID()})).error);assert.ok((await admin.rpc('finalize_maintenance_attachment',completion)).error);assert.equal((await admin.rpc('read_maintenance_attachment',sharedReaderArgs)).data,null);assert.deepEqual((await admin.rpc('page_maintenance_attachments',pageArgs)).data,{items:[],next:null});assert.equal((await admin.rpc('maintenance_attachment_usage',usageArgs)).data,null);
  assert.equal(await dispatchRegisteredSandboxPush(nativeRegistered.data,1,Date.now()+1000,dispatchDeps),'skipped');assert.equal(syntheticSends,1);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:nativeRegistered.data})).data,false);assert.ok((await admin.rpc('register_maintenance_native_push',nativeArgs)).error);
  assert.equal((await admin.rpc('can_dispatch_maintenance_push',dispatchArgs)).data,false);assert.equal((await admin.rpc('can_dispatch_maintenance_push_test',testDispatchArgs)).data,false);
  assert.equal((await admin.rpc('erase_maintenance_deletion_web_push',args)).data,true);assert.equal((await admin.rpc('erase_maintenance_deletion_web_push',args)).data,true);const gonePush=await admin.from('maintenance_push_subscriptions').select('id').eq('id',pushID);assert.equal(gonePush.error,null);assert.deepEqual(gonePush.data,[]);
  const sharedClosed=await other.from('products').select('id').eq('id',product);assert.equal(sharedClosed.error,null);assert.deepEqual(sharedClosed.data,[]);
  assert.ok((await other.from('products').insert({id:randomUUID(),homeId:home,categoryId:'air',name:'Blocked synthetic write'})).error);
  const ownOpen=await other.from('homes').select('id').eq('id',otherHome);assert.equal(ownOpen.error,null);assert.deepEqual(ownOpen.data,[{id:otherHome}]);
  const statusRequest=token=>new Request('https://example.invalid/deletion/'+requested.data,{headers:{authorization:'Bearer '+token}});
  const ownStatus=await handleAccountDeletionProgress(statusRequest(signup.data.session.access_token),requested.data,deletionProgressDependencies(admin));assert.equal(ownStatus.status,200);assert.deepEqual(await ownStatus.json(),{requestID:requested.data,state:'running'});const recoveredStatus=await handleAccountDeletionProgress(statusRequest(signup.data.session.access_token),null,deletionProgressDependencies(admin));assert.equal(recoveredStatus.status,200);assert.deepEqual(await recoveredStatus.json(),{requestID:requested.data,state:'running'});
  const foreignStatus=await handleAccountDeletionProgress(statusRequest(otherSignup.data.session.access_token),requested.data,deletionProgressDependencies(admin));assert.equal(foreignStatus.status,404);
  assert.equal((await admin.rpc('erase_maintenance_deletion_records',args)).data,false);
  assert.equal((await admin.rpc('confirm_maintenance_deletion_object_absence',{...args,target_attachment:file})).data,false);
  const blocked=await runAccountDeletion(scope,storedDeletionDependencies(admin,{eraseNativeDevices:async()=>false,finalizeIdentityAndRetention:async()=>{throw Error('must not finalize');},markComplete:async()=>{throw Error('must not complete');}}));assert.deepEqual(blocked,{state:'pending'});assert.ok((await admin.storage.from('ouchi-product-attachments').download(path)).data);
  assert.equal((await admin.rpc('maintenance_native_push_allowed',{registration_id:nativeRegistered.data})).data,false);assert.equal((await admin.rpc('erase_maintenance_deletion_native_push',args)).data,true);
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
  const removedHomes=await admin.from('homes').select('id').eq('id',home);assert.equal(removedHomes.error,null);assert.deepEqual(removedHomes.data,[]);const removedProducts=await admin.from('products').select('id').eq('id',product);assert.equal(removedProducts.error,null);assert.deepEqual(removedProducts.data,[]);
  const preserved=await other.from('homes').select('id').eq('id',otherHome);assert.equal(preserved.error,null);assert.deepEqual(preserved.data,[{id:otherHome}]);assert.equal((await user.auth.getUser()).error,null);assert.equal((await admin.rpc('maintenance_deletion_lease_is_current',args)).data,true);

  // Registry erasure is tested with a synthetic native token; actual APNs delivery
  // and device-side removal are NOT proven. Identity finalization remains pending.
  let finalized=0,completed=0;const partial=await runAccountDeletion(scope,storedDeletionDependencies(admin,{eraseNativeDevices:async()=>true,finalizeIdentityAndRetention:async()=>{finalized++;return false;},markComplete:async()=>{completed++;return true;}}));assert.deepEqual(partial,{state:'pending'});assert.equal(finalized,1);assert.equal(completed,0);
 }finally{releaseWrite();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
