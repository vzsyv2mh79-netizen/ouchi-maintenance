/** Explicit disposable PostgreSQL/PostgREST/Storage fixture. Auth tables,
 * policy adoption and the opaque-key HTTPS gateway are synthetic. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHmac,randomUUID} from 'node:crypto';
import ts from 'typescript';
import {Client} from 'pg';
import {createClient} from '@supabase/supabase-js';
import {reviewedCleanupReadyFixture} from './reviewed-file-cleanup.mjs';
import {createAccountContentReviewPorts} from '../../lib/closure-account-content-review.mjs';
import {home,product,owner,recipient} from './home-handoff-identifiers.mjs';
Error.stackTraceLimit=0;
assert.equal(process.env.OUCHI_DELETION_RUNTIME_SERVICE_TEST,'true');
const mode=process.argv[2],metadataPath=process.env.OUCHI_TEST_RUNTIME_METADATA;
assert.ok(['seed','verify'].includes(mode));assert.equal(typeof metadataPath,'string');
const dbPort=Number(process.env.OUCHI_TEST_DB_PORT),restPort=Number(process.env.OUCHI_TEST_REST_PORT),storagePort=Number(process.env.OUCHI_TEST_STORAGE_PORT);
assert.ok([dbPort,restPort,storagePort].every(p=>Number.isInteger(p)&&p>1024&&p<65536));
const options={host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'postgres',connectionTimeoutMillis:3000,query_timeout:10000};
const principal='ouchi_retirement_file_runtime',projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_runtime_services',origin=`https://${projectID}.supabase.co`,bucket='ouchi-product-attachments';
async function databaseFactory(){const c=new Client(options);await c.connect();assert.match((await c.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);return {query:(sql,args)=>c.query(sql,args),exec:sql=>c.query(sql),close:()=>c.end()};}
if(mode==='seed'){
 const f=await reviewedCleanupReadyFixture({asOwner:true,databaseFactory,accountContentReview:true,beforeCoverage:async fixture=>{
  await fixture.db.exec(readFileSync('supabase/migrations/20261017025017_ouchi_account_content_retention_review.sql','utf8'));
  const ports=createAccountContentReviewPorts({connect:fixture.connect,readFileBytes:async file=>fixture.objects.get(file.objectPath)}),scope={reviewRequestID:fixture.input.reviewRequestID,userID:fixture.input.userID,epochID:fixture.input.epochID};
  const file=(await ports.personalFiles.fileInventory({...scope,afterFile:null},fixture.signal)).items[0],inspectionID=randomUUID(),decisionID=randomUUID();
  await ports.personalFiles.inspectFile({...scope,fileID:file.attachment_id,expectedMetadataDigest:file.metadata_digest,inspectionID},fixture.signal);
  await ports.personalFiles.recordFileDecision({...scope,fileID:file.attachment_id,inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},fixture.signal);fixture.input.decisionID=decisionID;
 }});
 try{
  for(const name of ['20261014061630_ouchi_closure_reauth_markers.sql','20261014061641_ouchi_closure_reauth_lifecycle.sql','20261014064119_ouchi_closure_review_erasure.sql','20261014231227_ouchi_closure_actor_context_compatibility.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  // The authoritative rest-bootstrap fixture already creates authenticator.
  await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-runtime-services-only';grant ouchi_retirement_file_executor to ${principal};insert into maintenance_private.retirement_file_principals values('${principal}',true);create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;`);
  await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.cleanupInput.requestID]);
  const value={requestID:f.cleanupInput.requestID,sourcePath:f.sourcePath,destinationPath:f.manifest.destination.objectPath,bytes:f.bytes.toString('base64')};
  await writeFile(metadataPath,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({status:'seeded',syntheticOnly:true}));
 }finally{await f.db.close();}
}else{
 const saved=JSON.parse(await readFile(metadataPath,'utf8')),bytes=Buffer.from(saved.bytes,'base64'),db=new Client(options),original=globalThis.fetch;
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),message=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
 const jwt=message+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(message).digest('base64url');
 let deletes=0;const rpcCalls=[];
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
   const headers=new Headers(init.headers);assert.equal(headers.get('apikey'),secretKey);headers.set('apikey',jwt);headers.set('authorization','Bearer '+jwt);
   if(url.pathname.startsWith('/rest/v1/rpc/')){assert.equal(init.method,'POST');rpcCalls.push(url.pathname.slice('/rest/v1/rpc/'.length));return original(`http://127.0.0.1:${restPort}`+url.pathname.slice('/rest/v1'.length),{...init,headers});}
   assert.ok(url.pathname.startsWith('/storage/v1/object/'+bucket));
   if(init.method==='DELETE'){deletes++;assert.deepEqual(JSON.parse(init.body),{prefixes:[saved.sourcePath]});}
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
  const runtime=createAccountDeletionRuntime({projectID,secretKey,fileExecutorConfig:{projectRef:projectID,databaseURL:`postgresql://${principal}:synthetic@db.${projectID}.supabase.co/postgres`}});
  assert.deepEqual(await runtime.runNext(AbortSignal.timeout(60000)),{state:'pending'});assert.equal(deletes,1);assert.equal(rpcCalls.includes('complete_maintenance_account_deletion'),false);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[saved.requestID])).rows[0].state,'pending');
  const absent=await admin.storage.from(bucket).download(saved.sourcePath);assert.equal(absent.data,null);assert.equal(absent.error?.code,'NoSuchKey');assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(saved.destinationPath)).data.arrayBuffer()),bytes);
  // Fixture-only adopted checker evidence, not an approval the runtime creates.
  await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-actual-services-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[saved.requestID]);await db.query("update maintenance_private.account_deletion_requests set available_at=clock_timestamp()-interval '1 second' where id=$1",[saved.requestID]);
  assert.deepEqual(await runtime.runNext(AbortSignal.timeout(60000)),{state:'complete'});assert.equal(deletes,1);assert.deepEqual(await runtime.runNext(AbortSignal.timeout(60000)),{state:'idle'});
  assert.equal((await db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[[owner,recipient]])).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,1);assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
  assert.equal((await db.query('select maintenance_private.held_attachment_capacity_bytes() bytes')).rows[0].bytes,heldBefore);
  assert.deepEqual(Buffer.from(await (await admin.storage.from(bucket).download(saved.destinationPath)).data.arrayBuffer()),bytes);
  console.log(JSON.stringify({status:'passed',actualPostgreSQL:true,actualPostgREST:true,actualStorageFilesystem:true,currentAccountContentProtocol:true,minimumFileExecutorLogin:true,missingRetentionDeferred:true,sameJobResumed:true,singleSourceDelete:deletes===1,familyBytesPreserved:true,sharedAuthPreserved:true,heldCapacityReleased:false,managedGatewayAndTLSVerified:false,AuthTablesSynthetic:true,productionChanged:false,rpcFunctions:[...new Set(rpcCalls)].sort()}));
 }finally{globalThis.fetch=original;await db.end();}
}
