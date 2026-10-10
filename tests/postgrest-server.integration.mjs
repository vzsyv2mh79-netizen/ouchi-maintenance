import test from 'node:test';import assert from 'node:assert/strict';import {createServer,request as proxyRequest} from 'node:http';import {randomUUID,createHmac,createHash} from 'node:crypto';import {createClient} from '@supabase/supabase-js';import {readFileSync} from 'node:fs';import ts from 'typescript';
const encoded=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const sessionModule=encoded(compile('lib/verified-app-session.ts'));
const bindingModule=compile('lib/billing-account.ts').replace(/from ['"]\.\/verified-app-session['"]/g,`from '${sessionModule}'`);
const {purchaseAccountAfterAuthVerification}=await import(encoded(bindingModule));
const actualRoute=async(kind)=>{
 const core=encoded(compile('lib/account-'+kind+'.ts'));
 const source=compile('app/api/development/account-'+kind+'/route.ts')
  .replace(/from ['"]@supabase\/supabase-js['"]/g,`from '${import.meta.resolve('@supabase/supabase-js')}'`)
  .replace(new RegExp("from ['\"]@/lib/account-"+kind+"['\"]",'g'),`from '${core}'`)
  .replace(/from ['"]@\/lib\/verified-app-session['"]/g,`from '${sessionModule}'`);
 return (await import(encoded(source))).POST;
};
const actualAttachmentRoute=async()=>{
 const reader=encoded(compile('lib/product-attachment.ts'));
 const upload=encoded(compile('lib/attachment-upload.ts').replace("'./product-attachment'",JSON.stringify(reader)));
 const mappings={'@supabase/supabase-js':import.meta.resolve('@supabase/supabase-js'),'@/lib/attachment-upload':upload,'@/lib/product-attachment':reader,'@/lib/verified-app-session':sessionModule,'@/lib/billing-account':encoded(bindingModule),'@/lib/billing':encoded(compile('lib/billing.ts'))};
 let source=compile('app/api/development/product-attachments/route.ts');for(const [path,value] of Object.entries(mappings))source=source.replaceAll("'"+path+"'",JSON.stringify(value));
 return await import(encoded(source));
};
// Disposable CI services only; no real user, SMTP or shared project.
test('actual app lifecycle routes enforce real Auth and PostgREST closure and reenrollment', {skip:process.env.OUCHI_REAL_AUTH_TEST!=='true',timeout:60000},async()=>{
 const gateway=createServer((request,response)=>{
  const auth=request.url?.startsWith('/auth/v1/'),rest=request.url?.startsWith('/rest/v1/'),storage=request.url?.startsWith('/storage/v1/');
  if(!auth&&!rest&&!storage){response.writeHead(404).end();return;}
  const origin=auth?'http://127.0.0.1:9999':rest?'http://127.0.0.1:3002':'http://127.0.0.1:5002';
  const upstream=proxyRequest(origin+request.url.slice(storage?11:8),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 const keys=['NODE_ENV','OUCHI_CLOSURE_TEST_MODE','OUCHI_CLOSURE_TEST_URL','OUCHI_CLOSURE_TEST_PUBLISHABLE_KEY','OUCHI_CLOSURE_TEST_SERVICE_KEY','OUCHI_ATTACHMENT_TEST_MODE','OUCHI_ATTACHMENT_TEST_URL','OUCHI_ATTACHMENT_TEST_SERVICE_KEY'];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const client=createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const email='rest-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
  const signup=await client.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.session);
  const token=signup.data.session.access_token,id=signup.data.user.id;
  const verified=await client.auth.getUser(token);assert.equal(verified.error,null);assert.equal(verified.data.user.id,id);
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));assert.equal(claims.sub,id);assert.ok(claims.session_id);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
  const service=unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin=createClient('http://127.0.0.1:54321',service,options);
  const bootstrap=await admin.rpc('bootstrap_synthetic_app_identity',{target_user:id,verified_session:claims.session_id});assert.equal(bootstrap.error,null);
  const binding=(session)=>admin.rpc('current_maintenance_purchase_account',{target_user:id,verified_session:session});
  const initialBinding=await binding(claims.session_id);assert.equal(initialBinding.error,null);assert.equal(initialBinding.data,bootstrap.data);assert.notEqual(initialBinding.data,id);
  const readBinding=async(user,session)=>{assert.equal(user,id);const result=await binding(session);if(result.error)throw result.error;return result.data;};
  assert.equal(await purchaseAccountAfterAuthVerification(token,verified.data.user.id,readBinding),initialBinding.data);
  assert.ok((await client.rpc('current_maintenance_purchase_account',{target_user:id,verified_session:claims.session_id})).error);
  // Synthetic ledger events only: no Apple signature or purchase is claimed here.
  const event={transactionId:'synthetic-'+randomUUID(),originalTransactionId:'synthetic-'+randomUUID(),accountToken:initialBinding.data,environment:'Sandbox',productId:'ouchi.premium.monthly',signedAt:Date.now(),purchasedAt:Date.now(),expiresAt:Date.now()+60000};
  assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:event})).error,null);
  assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:event})).error,null);
  assert.ok((await client.rpc('apply_ouchi_sandbox_transaction',{payload:event})).error);
  assert.ok((await client.from('ouchi_sandbox_transactions').select('*')).error);
  const ledger=epoch=>admin.from('ouchi_sandbox_transactions').select('user_id,app_epoch_id,payload').eq('user_id',id).eq('app_epoch_id',epoch);
  const stored=await ledger(initialBinding.data);assert.equal(stored.error,null);assert.equal(stored.data.length,1);assert.equal(stored.data[0].user_id,id);
  const old=await client.rpc('load_household');assert.equal(old.error,null);const oldHome=old.data.homes[0].id;
  const attachmentProduct=randomUUID();
  assert.equal((await client.from('products').insert({id:attachmentProduct,homeId:oldHome,categoryId:'synthetic',name:'Synthetic attachment product'})).error,null);
  const bytes=new Uint8Array(5242880);bytes.set([137,80,78,71,13,10,26,10]);
  const fileHash=createHash('sha256').update(bytes).digest('hex');
  const attachmentIDs=Array.from({length:21},()=>randomUUID());
  const reserveAttachment=(attachment_id,byte_count=5242880,bearer=admin,digest=fileHash)=>bearer.rpc('reserve_maintenance_attachment',{target_user:id,verified_session:claims.session_id,expected_epoch:initialBinding.data,target_product:attachmentProduct,attachment_id,byte_count,media_type:'image/png',measured_sha256:digest});
  const allocations=await Promise.all(attachmentIDs.map(attachment_id=>reserveAttachment(attachment_id)));
  assert.equal(allocations.filter(result=>!result.error).length,20);assert.equal(allocations.filter(result=>result.error).length,1);
  const successfulID=attachmentIDs[allocations.findIndex(result=>!result.error)];
  assert.equal((await reserveAttachment(successfulID)).error,null);
  assert.ok((await reserveAttachment(successfulID,1)).error);assert.ok((await reserveAttachment(successfulID,5242880,admin,'b'.repeat(64))).error);
  const finishAttachment=(actual_bytes=5242880,verified_sha256=fileHash)=>admin.rpc('finalize_maintenance_attachment',{target_user:id,verified_session:claims.session_id,expected_epoch:initialBinding.data,attachment_id:successfulID,actual_bytes,verified_sha256});
  assert.ok((await finishAttachment(1)).error);
  assert.equal((await finishAttachment()).error,null);assert.equal((await finishAttachment()).error,null);
  assert.ok((await finishAttachment(5242880,'b'.repeat(64))).error);

  assert.ok((await reserveAttachment(randomUUID(),1,client)).error);
  // Actual private Storage and actual app handler; ledger events remain synthetic.
  const bucketName='ouchi-product-attachments-test';
  assert.equal((await admin.storage.createBucket(bucketName,{public:false,fileSizeLimit:5242880,allowedMimeTypes:['image/png','image/jpeg','application/pdf']})).error,null);
  Object.assign(process.env,{NODE_ENV:'development',OUCHI_ATTACHMENT_TEST_MODE:'true',OUCHI_ATTACHMENT_TEST_URL:'http://127.0.0.1:54321',OUCHI_ATTACHMENT_TEST_SERVICE_KEY:service});
  const {POST:attachmentPOST,GET:attachmentGET}=await actualAttachmentRoute();
  const objectID=attachmentIDs[allocations.findIndex((result,index)=>!result.error&&attachmentIDs[index]!==successfulID)];
  const uploadRequest=()=>new Request(`http://127.0.0.1:3000/api/development/product-attachments?productId=${attachmentProduct}&attachmentId=${objectID}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'image/png','content-length':String(bytes.length)},body:bytes});
  const uploaded=await attachmentPOST(uploadRequest());assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).saved,true);
  assert.equal((await attachmentPOST(uploadRequest())).status,200);
  const downloadRequest=bearer=>new Request(`http://127.0.0.1:3000/api/development/product-attachments?attachmentId=${objectID}`,{headers:{authorization:'Bearer '+bearer}});
  assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:{...event,signedAt:event.signedAt+1,expiresAt:Date.now()-1}})).error,null);
  const retained=await attachmentGET(downloadRequest(token));assert.equal(retained.status,200);assert.equal(retained.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await retained.arrayBuffer()),Buffer.from(bytes));
  const bindingRequest=bearer=>new Request('http://127.0.0.1:3000/api/development/product-attachments?binding=true',{headers:{authorization:'Bearer '+bearer}});
  assert.deepEqual(await (await attachmentGET(bindingRequest(token))).json(),{account:id,epoch:initialBinding.data});
  const usageRequest=bearer=>new Request('http://127.0.0.1:3000/api/development/product-attachments?usage=true',{headers:{authorization:'Bearer '+bearer}});
  const actualUsage=await attachmentGET(usageRequest(token));assert.equal(actualUsage.status,200);const usage=(await actualUsage.json()).usage;assert.equal(usage.usedBytes,104857600);assert.equal(usage.usedFiles,20);assert.equal(usage.reservedFiles,18);
  const listRequest=bearer=>new Request(`http://127.0.0.1:3000/api/development/product-attachments?productId=${attachmentProduct}`,{headers:{authorization:'Bearer '+bearer}});
  const retainedList=await attachmentGET(listRequest(token));assert.equal(retainedList.status,200);assert.ok((await retainedList.json()).items.some(item=>item.id===objectID));
  const pagedList=await attachmentGET(new Request(`http://127.0.0.1:3000/api/development/product-attachments?productId=${attachmentProduct}&page=true`,{headers:{authorization:'Bearer '+token}}));assert.equal(pagedList.status,200);const pageBody=await pagedList.json();assert.ok(pageBody.items.some(item=>item.id===objectID));assert.equal(pageBody.next,null);assert.ok(pageBody.items.length<=25);
  const invalidCursor=await attachmentGET(new Request(`http://127.0.0.1:3000/api/development/product-attachments?productId=${attachmentProduct}&page=true&after=invalid`,{headers:{authorization:'Bearer '+token}}));assert.equal(invalidCursor.status,400);

  const upgradeEvent={...event,transactionId:'upgrade-'+randomUUID(),originalTransactionId:'upgrade-original-'+randomUUID(),signedAt:Date.now(),expiresAt:Date.now()+60000};
  for(const payload of [upgradeEvent,{...upgradeEvent,isUpgraded:true},upgradeEvent])assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload})).error,null);
  const upgradeRow=await admin.from('ouchi_sandbox_transactions').select('payload').eq('transaction_id',upgradeEvent.transactionId).single();assert.equal(upgradeRow.error,null);assert.equal(upgradeRow.data.payload.isUpgraded,true);assert.equal((await attachmentPOST(uploadRequest())).status,403);
  const outsider=createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const outsiderLogin=await outsider.auth.signUp({email:'outsider-'+randomUUID()+'@example.invalid',password:'Synthetic-'+randomUUID()});assert.equal(outsiderLogin.error,null);
  const outsiderToken=outsiderLogin.data.session.access_token,outsiderClaims=JSON.parse(Buffer.from(outsiderToken.split('.')[1],'base64url'));
  assert.equal((await admin.rpc('bootstrap_synthetic_app_identity',{target_user:outsiderLogin.data.user.id,verified_session:outsiderClaims.session_id})).error,null);
  assert.equal((await attachmentGET(downloadRequest(outsiderToken))).status,404);assert.deepEqual((await (await attachmentGET(listRequest(outsiderToken))).json()).items,[]);

  const objectPath=`${id}/${initialBinding.data}/${objectID}.png`;
  const unrelatedBucket='unrelated-attachment-ci';assert.equal((await admin.storage.createBucket(unrelatedBucket,{public:false})).error,null);assert.equal((await admin.storage.from(unrelatedBucket).upload(objectPath,new Uint8Array([1,2,3]),{upsert:false})).error,null);
  const storedObject=await admin.storage.from(bucketName).download(objectPath);assert.equal(storedObject.error,null);assert.equal(storedObject.data.size,bytes.length);
  assert.ok((await client.storage.from(bucketName).download(objectPath)).error);
  assert.ok((await client.storage.from(bucketName).upload('unauthorized.png',bytes.subarray(0,8),{contentType:'image/png'})).error);
  const anonymous=createClient('http://127.0.0.1:54321',process.env.OUCHI_STORAGE_ANON_KEY,options);
  assert.ok((await anonymous.storage.from(bucketName).download(objectPath)).error);
  assert.notEqual((await fetch(`http://127.0.0.1:54321/storage/v1/object/public/${bucketName}/${objectPath}`)).status,200);

  const forbidden=await client.rpc('close_maintenance_app_identity',{target_user:id,verified_session:claims.session_id});assert.ok(forbidden.error);
  Object.assign(process.env,{NODE_ENV:'development',OUCHI_CLOSURE_TEST_MODE:'true',OUCHI_CLOSURE_TEST_URL:'http://127.0.0.1:54321',OUCHI_CLOSURE_TEST_PUBLISHABLE_KEY:'synthetic-public-key',OUCHI_CLOSURE_TEST_SERVICE_KEY:service});
  const close=await actualRoute('closure'),reenroll=await actualRoute('reenrollment');
  const request=(bearer,confirmation,secret=password)=>new Request('http://127.0.0.1:3000/api/development/account-closure',{method:'POST',headers:{authorization:'Bearer '+bearer},body:JSON.stringify({confirmation,password:secret})});
  assert.equal((await close(request(token,'DELETE_OUCHI_MAINTENANCE','incorrect-password'))).status,403);
  const closed=await close(request(token,'DELETE_OUCHI_MAINTENANCE'));assert.equal(closed.status,200);assert.equal((await closed.json()).appAccessClosed,true);
  const lateID=attachmentIDs.find(value=>value!==objectID&&value!==successfulID&&!allocations[attachmentIDs.indexOf(value)].error);assert.ok(lateID);
  const latePath=`${id}/${initialBinding.data}/${lateID}.png`;
  assert.ok((await admin.storage.from(bucketName).upload(latePath,new Uint8Array([137,80,78,71,13,10,26,10]),{contentType:'image/png',upsert:false})).error);
  assert.ok((await reserveAttachment(successfulID)).error);assert.ok((await finishAttachment()).error);assert.equal((await attachmentPOST(uploadRequest())).status,401);assert.equal((await attachmentGET(downloadRequest(token))).status,401);assert.equal((await attachmentGET(bindingRequest(token))).status,401);
  const closedBinding=await binding(claims.session_id);assert.equal(closedBinding.error,null);assert.equal(closedBinding.data,null);
  assert.equal(await purchaseAccountAfterAuthVerification(token,verified.data.user.id,readBinding),null);
  assert.ok((await client.rpc('load_household')).error);assert.deepEqual((await client.from('homes').select('*')).data,[]);
  const forbiddenInsert=await client.from('homes').insert({owner_id:id,name:'closed synthetic home',kind:'home'});assert.ok(forbiddenInsert.error);
  const forged=token.split('.');forged[2]=(forged[2][0]==='A'?'B':'A')+forged[2].slice(1);
  const invalid=createClient('http://127.0.0.1:54321','synthetic-public-key',{...options,global:{headers:{Authorization:'Bearer '+forged.join('.')}}});
  assert.ok((await invalid.rpc('load_household')).error);
  const freshClient=createClient('http://127.0.0.1:54321','synthetic-public-key',options);
  const {eraseIsolatedAttachmentBatch}=await import(encoded(compile('lib/attachment-erasure.ts').replace(/from ['"]@supabase\/supabase-js['"]/g,`from '${import.meta.resolve('@supabase/supabase-js')}'`)));
  assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:20,deferred:0});assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:0,deferred:0});
  assert.ok((await admin.storage.from(bucketName).download(objectPath)).error);assert.equal((await admin.storage.from(unrelatedBucket).download(objectPath)).error,null);
  const login=await freshClient.auth.signInWithPassword({email,password});assert.equal(login.error,null);assert.ok(login.data.session);
  const freshVerified=await freshClient.auth.getUser(login.data.session.access_token);assert.equal(freshVerified.error,null);assert.equal(freshVerified.data.user.id,id);
  const freshClaims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url'));assert.notEqual(freshClaims.session_id,claims.session_id);
  assert.ok((await freshClient.rpc('load_household')).error);
  const enrolled=await reenroll(request(login.data.session.access_token,'REENROLL_OUCHI_MAINTENANCE'));assert.equal(enrolled.status,200);const enrollment=await enrolled.json();assert.equal(enrollment.appEnrollmentCreated,true);
  const currentBinding=await binding(freshClaims.session_id);assert.equal(currentBinding.error,null);assert.equal(currentBinding.data,enrollment.epochID);assert.notEqual(currentBinding.data,initialBinding.data);
  assert.equal(await purchaseAccountAfterAuthVerification(login.data.session.access_token,freshVerified.data.user.id,readBinding),currentBinding.data);
  assert.equal((await binding(claims.session_id)).data,null);
  const late={...event,signedAt:event.signedAt+2,expiresAt:event.expiresAt+60000};
  assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:late})).error,null);
  const renewed=await ledger(initialBinding.data);assert.equal(renewed.error,null);assert.equal(renewed.data.find(row=>row.payload.transactionId===event.transactionId)?.payload.expiresAt,late.expiresAt,JSON.stringify(renewed.data.map(row=>({id:row.payload.transactionId,signedAt:row.payload.signedAt,expiresAt:row.payload.expiresAt}))));
  const currentRows=await ledger(currentBinding.data);assert.equal(currentRows.error,null);assert.deepEqual(currentRows.data,[]);
  assert.ok((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:{...late,accountToken:currentBinding.data}})).error);
  const refunded={...late,signedAt:late.signedAt+1,revokedAt:late.signedAt+1};
  assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:refunded})).error,null);
  assert.equal((await admin.rpc('apply_ouchi_sandbox_transaction',{payload:event})).error,null);
  assert.equal((await ledger(initialBinding.data)).data.find(row=>row.payload.transactionId===event.transactionId)?.payload.revokedAt,refunded.revokedAt);
  assert.deepEqual((await ledger(currentBinding.data)).data,[]);

  assert.ok((await client.rpc('load_household')).error);
  const fresh=await freshClient.rpc('load_household');assert.equal(fresh.error,null);assert.notEqual(fresh.data.homes[0].id,oldHome);
  assert.ok((await admin.rpc('close_maintenance_app_identity',{target_user:id,verified_session:claims.session_id})).error);
  assert.equal((await freshClient.rpc('load_household')).error,null);
 }finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
