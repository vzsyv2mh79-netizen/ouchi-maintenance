/** Explicit disposable PostgreSQL/PostgREST/Storage fixture. Auth tables,
 * policy adoption and the opaque-key HTTPS gateway are synthetic. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import ts from 'typescript';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {reviewedCleanupReadyFixture} from './reviewed-file-cleanup.mjs';
import {createAccountContentReviewPorts} from '../../lib/closure-account-content-review.mjs';
import {runPrivateDeletionDispatch} from '../../lib/private-deletion-dispatch.mjs';
import {home,product,owner,recipient} from './home-handoff-identifiers.mjs';
import {seedFullSchemaDeletion,seedOrdinaryRuntimeDeletion} from './deletion-runtime-full-schema.mjs';
Error.stackTraceLimit=0;
assert.equal(process.env.OUCHI_DELETION_RUNTIME_SERVICE_TEST,'true');
const mode=process.argv[2],metadataPath=process.env.OUCHI_TEST_RUNTIME_METADATA;
assert.ok(['seed','verify'].includes(mode));assert.equal(typeof metadataPath,'string');
const dbPort=Number(process.env.OUCHI_TEST_DB_PORT),restPort=Number(process.env.OUCHI_TEST_REST_PORT),storagePort=Number(process.env.OUCHI_TEST_STORAGE_PORT);
assert.ok([dbPort,restPort,storagePort].every(p=>Number.isInteger(p)&&p>1024&&p<65536));
const options={host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'postgres',connectionTimeoutMillis:3000,query_timeout:10000};
const principal='ouchi_retirement_file_runtime',projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_runtime_services',origin=`https://${projectID}.supabase.co`,bucket='ouchi-product-attachments';
async function databaseFactory(){const c=new Client(options);await c.connect();assert.match((await c.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);return {query:(sql,args)=>c.query(sql,args),exec:sql=>c.query(sql),close:()=>c.end()};}
const profile=process.env.OUCHI_RUNTIME_SCHEMA_PROFILE??'selected';assert.ok(['selected','full-134-observed','full-135-observed'].includes(profile));
if(mode==='seed'){
 const f=profile!=='selected'?await seedFullSchemaDeletion({databaseFactory,dbOptions:options,authPort:Number(process.env.OUCHI_TEST_AUTH_PORT)}):await reviewedCleanupReadyFixture({asOwner:true,databaseFactory,accountContentReview:true,beforeCoverage:async fixture=>{
  await fixture.db.exec(readFileSync('supabase/migrations/20261017025017_ouchi_account_content_retention_review.sql','utf8'));
  const ports=createAccountContentReviewPorts({connect:fixture.connect,readFileBytes:async file=>fixture.objects.get(file.objectPath)}),scope={reviewRequestID:fixture.input.reviewRequestID,userID:fixture.input.userID,epochID:fixture.input.epochID};
  const file=(await ports.personalFiles.fileInventory({...scope,afterFile:null},fixture.signal)).items[0],inspectionID=randomUUID(),decisionID=randomUUID();
  await ports.personalFiles.inspectFile({...scope,fileID:file.attachment_id,expectedMetadataDigest:file.metadata_digest,inspectionID},fixture.signal);
  await ports.personalFiles.recordFileDecision({...scope,fileID:file.attachment_id,inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},fixture.signal);fixture.input.decisionID=decisionID;
 }});
 try{
  if(profile==='selected')for(const name of ['20261014061630_ouchi_closure_reauth_markers.sql','20261014061641_ouchi_closure_reauth_lifecycle.sql','20261014064119_ouchi_closure_review_erasure.sql','20261014231227_ouchi_closure_actor_context_compatibility.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  // The authoritative rest-bootstrap fixture already creates authenticator.
  await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-runtime-services-only';grant ouchi_retirement_file_executor to ${principal};insert into maintenance_private.retirement_file_principals values('${principal}',true);create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;`);
  if(profile==='selected')await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.cleanupInput.requestID]);
  const value={version:profile==='full-135-observed'?2:1,...(profile==='full-135-observed'?{familyBinding:f.familyBinding}:{}),profile,actualGoTrue:f.actualGoTrue===true,identities:f.identities??{departing:recipient,family:owner,home,product},requestID:f.cleanupInput.requestID,sourcePath:f.sourcePath,destinationPath:f.manifest.destination.objectPath,bytes:f.bytes.toString('base64')};
  await writeFile(metadataPath,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({status:'seeded',syntheticOnly:true}));
 }finally{await f.db.close();}
}else{
 const saved=JSON.parse(await readFile(metadataPath,'utf8'));assert.equal(saved.version,profile==='full-135-observed'?2:1);assert.equal(saved.profile,profile);assert.equal(saved.actualGoTrue,profile!=='selected');assert.deepEqual(Object.keys(saved.identities).sort(),['departing','family','home','product']);assert.ok(Object.values(saved.identities).every(id=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)));const bytes=Buffer.from(saved.bytes,'base64'),db=new Client(options),original=globalThis.fetch;
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),message=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
 const jwt=message+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(message).digest('base64url');
 let deletes=0,ordinaryVerified=false,householdPhase=false,householdRemovalVerified=false,injectHouseholdFailure=false;const rpcCalls=[],rpcTrace=[],allowedDeletePaths=new Set([saved.sourcePath]);
 try{
  await db.connect();
  const localStorage=`http://127.0.0.1:${storagePort}`,admin=createClient(localStorage,jwt,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,localStorage);assert.ok(url.pathname.startsWith('/storage/v1/'));return original(localStorage+url.pathname.slice('/storage/v1'.length)+url.search,init);}}});
  assert.equal((await admin.storage.createBucket(bucket,{public:false})).error,null);
  // Privileged synthetic fixture setup: bytes were measured in the seed map;
  // these writes are not a shipping copy or operator-approval flow.
  for(const path of [saved.sourcePath,saved.destinationPath])assert.equal((await admin.storage.from(bucket).upload(path,new Blob([bytes],{type:'application/pdf'}),{upsert:false,contentType:'application/pdf'})).error,null);
  const heldBefore=(await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes;
  globalThis.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.origin,origin);assert.equal(init.redirect,'error');
   const headers=new Headers(init.headers);assert.equal(headers.get('apikey'),secretKey);
   if(url.pathname==='/auth/v1/user'){
    assert.equal(householdPhase,true);assert.equal(headers.get('authorization'),'Bearer '+saved.familyBinding.token);
    headers.set('apikey',jwt);return original('http://127.0.0.1:'+process.env.OUCHI_TEST_AUTH_PORT+'/user',{...init,headers});
   }
   headers.set('apikey',jwt);headers.set('authorization','Bearer '+jwt);
   if(url.pathname.startsWith('/rest/v1/rpc/')){assert.equal(init.method,'POST');rpcCalls.push(url.pathname.slice('/rest/v1/rpc/'.length));const response=await original(`http://127.0.0.1:${restPort}`+url.pathname.slice('/rest/v1'.length),{...init,headers});const value=await response.clone().json();rpcTrace.push({method:rpcCalls.at(-1),status:response.status,result:typeof value==='boolean'?value:response.ok?'non-boolean':{code:value.code,message:value.message}});return response;}
   assert.ok(url.pathname.startsWith('/storage/v1/object/'+bucket));
   if(householdPhase&&injectHouseholdFailure&&init.method==='GET'){
    assert.equal(url.pathname,'/storage/v1/object/'+bucket+'/'+saved.destinationPath);injectHouseholdFailure=false;
    return Response.json({statusCode:'404',error:'NoSuchKey',message:'Synthetic transient error'}, {status:500});
   }
   if(init.method==='DELETE'){deletes++;const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['prefixes']);assert.equal(body.prefixes.length,1);assert.equal(allowedDeletePaths.has(body.prefixes[0]),true);}
   return original(localStorage+url.pathname.slice('/storage/v1'.length),{...init,headers});
  };
  const modules=new Map(),driver=`import assert from 'node:assert/strict';import {Client} from ${JSON.stringify(import.meta.resolve('pg'))};export function createPostgresClient(config){assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.database,'postgres');assert.equal(config.user,${JSON.stringify(principal)});assert.equal(config.host,${JSON.stringify('db.'+projectID+'.supabase.co')});return new Client({...config,host:'127.0.0.1',port:${dbPort},ssl:false,password:'synthetic-runtime-services-only'});}`;
  function compile(name){
   if(name==='postgres-driver.mjs')return 'data:text/javascript;base64,'+Buffer.from(driver).toString('base64');
   if(name.endsWith('.mjs'))return import.meta.resolve('../../lib/'+name);
   if(modules.has(name))return modules.get(name);
   let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');
   code=code.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));
   const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
  }
  const {createAccountDeletionRuntime}=await import(compile('account-deletion-runtime'));
  const directory=dirname(metadataPath),configPath=join(directory,'runtime-config.json');
  await writeFile(configPath,JSON.stringify({projectID,secretKey,fileExecutorConfig:{projectRef:projectID,databaseURL:`postgresql://${principal}:synthetic@db.${projectID}.supabase.co/postgres`}}),{mode:0o600,flag:'wx'});
  const invoke=async(name,execute=true)=>runPrivateDeletionDispatch({args:[execute?'--execute-authorized-job':'--validate-only','--config',configPath,'--project-ref',projectID,'--receipt',join(directory,name),...(execute?['--confirmation','RUN_ONE_SQL_AUTHORIZED_OUCHI_DELETION_JOB']:[])],createRuntime:createAccountDeletionRuntime});
  assert.equal((await invoke('validation.json',false)).state,'configuration-validated');assert.equal(rpcCalls.length,0);assert.equal(deletes,0);
  assert.equal((await invoke('pending.json')).state,'pending');assert.equal(deletes,1);assert.equal(rpcCalls.includes('complete_maintenance_account_deletion'),false);
  assert.equal((await stat(join(directory,'pending.json'))).mode&0o777,0o600);assert.equal(JSON.parse(await readFile(join(directory,'pending.json'),'utf8')).globalCompletionConfirmed,false);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[saved.requestID])).rows[0].state,'pending');
  const absent=await admin.storage.from(bucket).download(saved.sourcePath);assert.equal(absent.data,null);assert.equal(absent.error?.code,'NoSuchKey');assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(saved.destinationPath)).data.arrayBuffer()),bytes);
  // Fixture-only adopted checker evidence, not an approval the runtime creates.
  await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-actual-services-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[saved.requestID]);await db.query("update maintenance_private.account_deletion_requests set available_at=clock_timestamp()-interval '1 second' where id=$1",[saved.requestID]);
  // Fresh runtime per private invocation also covers a process-style restart.
  assert.equal((await invoke('complete.json')).state,'complete');assert.equal(deletes,1);assert.equal((await invoke('idle.json')).state,'idle');
  assert.equal((await db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[[saved.identities.departing,saved.identities.family]])).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from public.products where id=$1',[saved.identities.product])).rows[0].n,1);assert.equal((await db.query('select owner_id from public.homes where id=$1',[saved.identities.home])).rows[0].owner_id,null);
  assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,heldBefore);
  assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(saved.destinationPath)).data.arrayBuffer()),bytes);
  if(profile!=='selected'){
   const solo=await seedOrdinaryRuntimeDeletion({db,authPort:Number(process.env.OUCHI_TEST_AUTH_PORT),fetcher:original});allowedDeletePaths.add(solo.sourcePath);
   assert.equal((await admin.storage.from(bucket).upload(solo.sourcePath,new Blob([solo.bytes],{type:'application/pdf'}),{upsert:false,contentType:'application/pdf'})).error,null);
   const soloHeld=(await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes;
   const before=rpcCalls.length;assert.equal((await invoke('ordinary-pending.json')).state,'pending');assert.equal(deletes,2);
   assert.equal(rpcCalls.slice(before).includes('confirm_maintenance_deletion_object_absence'),true,'ordinary inventory uses its scoped API-absence acknowledgement');
   assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[solo.requestID])).rows[0].state,'pending');
   assert.equal((await admin.storage.from(bucket).download(solo.sourcePath)).error?.code,'NoSuchKey');
   // Explicit synthetic checker evidence, independently for the ordinary job.
   await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-actual-services-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[solo.requestID]);await db.query("update maintenance_private.account_deletion_requests set available_at=clock_timestamp()-interval '1 second' where id=$1",[solo.requestID]);
   assert.equal((await invoke('ordinary-complete.json')).state,'complete',JSON.stringify(rpcTrace.slice(before)));assert.equal((await invoke('ordinary-idle.json')).state,'idle');assert.equal(deletes,2);
   for(const [table,column,id] of [['homes','id',solo.homeID],['products','id',solo.productID]])assert.equal((await db.query(`select count(*)::int n from public.${table} where ${column}=$1`,[id])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[solo.fileID])).rows[0].n,0);
   const ids=[saved.identities.departing,saved.identities.family,solo.userID];assert.equal((await db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[ids])).rows[0].n,3);assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=any($1::uuid[])',[ids])).rows[0].n,3);
   assert.equal((await db.query('select count(*)::int n from public.products where id=$1',[saved.identities.product])).rows[0].n,1);assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(saved.destinationPath)).data.arrayBuffer()),bytes);
   assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,soloHeld);
   assert.equal((await db.query("select count(*)::int n from maintenance_private.attachment_capacity_claims where split_part(object_path,'/',1)=$1",[solo.userID])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.deletion_capacity_moves where request_id=$1',[solo.requestID])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from maintenance_private.retired_attachment_ids where attachment_id=$1',[solo.fileID])).rows[0].n,1);
   await assert.rejects(db.query('insert into maintenance_private.product_attachments(id) values($1)',[solo.fileID]),/Retired attachment identity cannot be reused/);
   await assert.rejects(db.query('delete from maintenance_private.attachment_capacity_quarantine'),/Unverified physical capacity remains held/);
   const security=(await db.query("select relrowsecurity,has_table_privilege('service_role','maintenance_private.deletion_capacity_moves','INSERT') runtime_can_insert,has_table_privilege('authenticated','maintenance_private.deletion_capacity_moves','SELECT') client_can_read from pg_class where oid='maintenance_private.deletion_capacity_moves'::regclass")).rows[0];assert.deepEqual(security,{relrowsecurity:true,runtime_can_insert:false,client_can_read:false});ordinaryVerified=true;
  }
  if(profile==='full-135-observed'){
   const binding=saved.familyBinding;assert.equal(binding.id,saved.identities.family);assert.ok(binding.token&&binding.session&&binding.epoch);
   const held=(await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes;
   householdPhase=true;injectHouseholdFailure=true;allowedDeletePaths.add(saved.destinationPath);
   const client=createClient(origin,secretKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init={})=>globalThis.fetch(input,{...init,method:init.method??'GET',redirect:'error'})}});
   const {removeHouseholdAttachmentResponse}=await import(compile('household-attachment-removal'));
   const {readHouseholdAttachmentResponse}=await import(compile('household-attachment-read-handler'));
   const fileID=saved.destinationPath.split('/').at(-1).split('.')[0],headers={Authorization:'Bearer '+binding.token,'X-Ouchi-App-Epoch':binding.epoch};
   const request=()=>new Request(origin+'/api/product-attachments?scope=household&attachmentId='+fileID,{method:'DELETE',headers});
   const before=deletes;assert.equal((await removeHouseholdAttachmentResponse(request(),fileID,client)).status,503);
   assert.equal((await db.query('select removal_pending from maintenance_private.household_attachments where id=$1',[fileID])).rows[0].removal_pending,true);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.household_file_removal_receipts where attachment_id=$1',[fileID])).rows[0].n,0);
   const pending=await readHouseholdAttachmentResponse(new Request(origin+'/api/product-attachments?scope=household&pending=true&page=true&productId='+saved.identities.product,{headers}),client);
   assert.equal(pending.status,200);assert.equal((await pending.json()).items[0].id,fileID);
   assert.equal((await removeHouseholdAttachmentResponse(request(),fileID,client)).status,200);const after=deletes;
   assert.equal(after,before+2);assert.equal((await removeHouseholdAttachmentResponse(request(),fileID,client)).status,200);assert.equal(deletes,after);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.household_attachments where id=$1',[fileID])).rows[0].n,0);
   assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,held);
   const receipt=(await db.query('select to_jsonb(r) value from maintenance_private.household_file_removal_receipts r where attachment_id=$1',[fileID])).rows[0].value;
   assert.deepEqual(Object.keys(receipt).sort(),['attachment_id','completed_at','home_id','home_instance_id','mime','product_id']);
   const removed=await original('http://127.0.0.1:'+restPort+'/products?id=eq.'+saved.identities.product+'&select=id',{method:'DELETE',headers:{Authorization:'Bearer '+binding.token,Prefer:'return=representation'}});
   assert.equal(removed.status,200);assert.deepEqual((await removed.json()).map(row=>row.id),[saved.identities.product]);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.household_file_removal_receipts where attachment_id=$1',[fileID])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,3);assert.equal((await db.query('select count(*)::int n from auth.sessions')).rows[0].n,3);
   householdRemovalVerified=true;
  }
  console.log(JSON.stringify({status:'passed',householdRemovalVerified,familyBytesPreservedBeforeRequestedRemoval:true,actualPostgreSQL:true,actualPostgREST:true,actualStorageFilesystem:true,currentAccountContentProtocol:true,minimumFileExecutorLogin:true,privateInvocationHandler:true,validationMadeNoNetworkCall:true,privateReceiptsPersisted:true,freshRuntimePerInvocation:true,missingRetentionDeferred:true,sameJobResumed:true,singleReviewedSourceDelete:deletes===(householdRemovalVerified?4:ordinaryVerified?2:1),ordinaryObjectServiceVerified:ordinaryVerified,ordinaryCapacityMinimizedWithoutRelease:ordinaryVerified,ordinaryWrongScopeAndPrematureRefused:ordinaryVerified,sharedAuthSessionsPreserved:ordinaryVerified,familyBytesPreserved:!householdRemovalVerified,sharedAuthPreserved:true,heldCapacityReleased:false,managedGatewayAndTLSVerified:false,AuthTablesSynthetic:!saved.actualGoTrue,actualGoTrue:saved.actualGoTrue,schemaProfile:profile,productionChanged:false,rpcFunctions:[...new Set(rpcCalls)].sort()}));
 }finally{globalThis.fetch=original;await db.end();}
}
