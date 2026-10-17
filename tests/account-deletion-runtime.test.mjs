import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {Client} from 'pg';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {privateOperatorConfig} from '../lib/closure-operator-connection.mjs';
import {installDeletionRuntimeTestDriver} from './fixtures/deletion-runtime-driver.mjs';
import {home,product,owner,recipient} from './fixtures/home-handoff-identifiers.mjs';
const modules=new Map();
function compile(name){
 if(name==='postgres-driver.mjs')return import.meta.resolve('./fixtures/deletion-runtime-driver.mjs');
 if(name.endsWith('.mjs'))return import.meta.resolve('../lib/'+name);
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');
 source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
}
const {createAccountDeletionRuntime}=await import(compile('account-deletion-runtime'));
const {createAccountDeletionServiceFetch}=await import(compile('account-deletion-service-fetch'));
const projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_deletion_runtime',principal='ouchi_retirement_file_runtime';
const fileExecutorConfig={projectRef:projectID,databaseURL:`postgresql://${principal}:synthetic-password@db.${projectID}.supabase.co/postgres`};
const config={projectID,secretKey,fileExecutorConfig},origin=`https://${projectID}.supabase.co`,id=()=>randomUUID();
const actual=process.env.OUCHI_DELETION_RUNTIME_SQL_TEST==='true';
const databaseFactory=actual?async()=>{
 const c=new Client({host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),user:'postgres',password:'synthetic-ci-only',database:'postgres',query_timeout:10000,connectionTimeoutMillis:3000});
 await c.connect();assert.match((await c.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);return {query:(sql,args)=>c.query(sql,args),exec:sql=>c.query(sql),close:()=>c.end()};
}:undefined;

test('deletion runtime refuses mismatched project, public keys and review/admin logins before network',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network');};
 try{
  for(const value of [{}, {...config,extra:true},{...config,secretKey:'sb_publishable_wrong'},{...config,projectID:'foreign'},
   {...config,fileExecutorConfig:{...fileExecutorConfig,projectRef:'bbbbbbbbbbbbbbbbbbbb'}},
   ...['postgres','ouchi_closure_decision_runtime','ouchi_closure_inspection_runtime'].map(user=>({...config,fileExecutorConfig:{...fileExecutorConfig,databaseURL:fileExecutorConfig.databaseURL.replace(principal,user)}}))])assert.throws(()=>createAccountDeletionRuntime(value));
  assert.equal(privateOperatorConfig(fileExecutorConfig,projectID,'file-cleanup').role,'ouchi_retirement_file_executor');
  assert.equal(privateOperatorConfig(fileExecutorConfig,projectID,'decision'),null);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});

test('deletion transport restricts effective methods, public RPC schemas, exact scoped payloads and single original paths',async()=>{
 const original=globalThis.fetch,transport=createAccountDeletionServiceFetch(projectID,AbortSignal.timeout(10000));let calls=0;
 const scope={target_request:id(),target_user:id(),target_epoch:id(),target_lease:id()},path=`${id()}/${id()}/${id()}.pdf`,bucket='/storage/v1/object/ouchi-product-attachments';
 try{
  globalThis.fetch=async(input,init)=>{calls++;assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');return Response.json(true);};
  const body=JSON.stringify(scope),post={method:'POST',body};
  for(const [url,init] of [[origin+'/rest/v1/rpc/claim_maintenance_account_deletion',{method:'POST',body:'{}'}],
   [origin+'/rest/v1/rpc/maintenance_deletion_lease_is_current',post],
   [origin+bucket+'/'+path,{method:'GET'}],[origin+bucket,{method:'DELETE',body:JSON.stringify({prefixes:[path]})}]])await transport(url,init);
  assert.equal(calls,4);
  for(const [url,init] of [[origin+'/auth/v1/admin/users',{method:'DELETE'}],[origin+'/rest/v1/products',post],
   ['https://bbbbbbbbbbbbbbbbbbbb.supabase.co/rest/v1/rpc/claim_maintenance_account_deletion',{method:'POST'}],
   [origin+'/rest/v1/rpc/erase_maintenance_deletion_identity?select=*',post],
   [origin+'/rest/v1/rpc/erase_maintenance_deletion_identity',{method:'GET'}],
   [origin+'/rest/v1/rpc/erase_maintenance_deletion_identity',{method:'POST',body:JSON.stringify({...scope,force:true})}],
   [origin+'/rest/v1/rpc/erase_maintenance_deletion_identity',{...post,headers:{'content-profile':'maintenance_private'}}],
   [new Request(origin+'/rest/v1/rpc/erase_maintenance_deletion_identity',{method:'POST',headers:{'content-profile':'foreign'}}),post],
   [origin+bucket,{method:'DELETE',body:JSON.stringify({prefixes:[path,path]})}],
   [origin+bucket,{method:'DELETE',body:JSON.stringify({prefixes:['households/'+id()+'/'+id()+'.pdf']})}],
   [origin+bucket+'/'+path,{method:'POST',body:'bytes'}],[new Request(origin+bucket+'/'+path,{method:'DELETE'}),undefined]])await assert.rejects(transport(url,init));
  assert.equal(calls,4);
  globalThis.fetch=async()=>new Response('oversized',{headers:{'content-length':'262145'}});await assert.rejects(transport(origin+'/rest/v1/rpc/maintenance_deletion_lease_is_current',post),/too large/);
 }finally{globalThis.fetch=original;}
});

test('actual SDK idle/cancellation/failure and same-instance concurrency never acquire a private SQL connection',async()=>{
 const original=globalThis.fetch;let release,calls=0;
 try{
  const runtime=createAccountDeletionRuntime(config);assert.deepEqual(Object.keys(runtime),['runNext']);
  globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),origin+'/rest/v1/rpc/claim_maintenance_account_deletion');assert.equal(init.method,'POST');assert.equal(new Headers(init.headers).get('apikey'),secretKey);await new Promise(resolve=>{release=resolve;});return Response.json(null);};
  const first=runtime.runNext(AbortSignal.timeout(10000));while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  assert.deepEqual(await runtime.runNext(AbortSignal.timeout(10000)),{state:'busy'});release();assert.deepEqual(await first,{state:'idle'});assert.equal(calls,1);
  const cancel=new AbortController();cancel.abort();assert.deepEqual(await runtime.runNext(cancel.signal),{state:'unavailable'});assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json({message:'Synthetic unavailable'},{status:503});assert.deepEqual(await runtime.runNext(AbortSignal.timeout(10000)),{state:'unavailable'});
 }finally{globalThis.fetch=original;}
});

test('current protocol runtime combines SDK, private file-executor SQL and stored tail; missing retention defers and same job resumes',async()=>{
 const f=await reviewedCleanupReadyFixture({asOwner:true,databaseFactory,accountContentReview:true,beforeCoverage:async fixture=>{
  await fixture.db.exec(readFileSync('supabase/migrations/20261017025017_ouchi_account_content_retention_review.sql','utf8'));
  const ports=createAccountContentReviewPorts({connect:fixture.connect,readFileBytes:async file=>fixture.objects.get(file.objectPath)}),scope={reviewRequestID:fixture.input.reviewRequestID,userID:fixture.input.userID,epochID:fixture.input.epochID};
  const file=(await ports.personalFiles.fileInventory({...scope,afterFile:null},fixture.signal)).items[0],inspectionID=id(),decisionID=id();
  await ports.personalFiles.inspectFile({...scope,fileID:file.attachment_id,expectedMetadataDigest:file.metadata_digest,inspectionID},fixture.signal);
  await ports.personalFiles.recordFileDecision({...scope,fileID:file.attachment_id,inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},fixture.signal);fixture.input.decisionID=decisionID;
 }}),original=globalThis.fetch;let restoreDriver;
 try{
  for(const name of ['20261014061630_ouchi_closure_reauth_markers.sql','20261014061641_ouchi_closure_reauth_lifecycle.sql','20261014064119_ouchi_closure_review_erasure.sql','20261014231227_ouchi_closure_actor_context_compatibility.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  if(actual)await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-file-runtime-only';grant ouchi_retirement_file_executor to ${principal};insert into maintenance_private.retirement_file_principals values('${principal}',true)`);
  restoreDriver=installDeletionRuntimeTestDriver(cfg=>{
   assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.user,principal);assert.equal(cfg.database,'postgres');assert.equal(cfg.host,'db.'+projectID+'.supabase.co');let begun=false;
   // Explicit disposable driver alias. Managed TLS is not exercised here.
   if(actual)return new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),ssl:false,password:'synthetic-file-runtime-only'});
   return {on(){},async connect(){},async end(){if(begun){await f.db.query('ROLLBACK');begun=false;}},async query(sql,args){
    if(sql.startsWith('select session_user'))return {rows:[{principal,database:'postgres'}]};
    const result=await f.db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')begun=true;if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;return result;
   }};
  });
  let deletes=0;const rpcCalls=[],errors=[];
  // Real SDK and production transport, simulated HTTP responses backed by SQL
  // and an in-memory object map. This is not a real PostgREST/Storage service.
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input));assert.equal(url.origin,origin);assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('apikey'),secretKey);
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    const name=url.pathname.slice('/rest/v1/rpc/'.length);assert.match(name,/^[a-z_]+$/);rpcCalls.push(name);const args=init.body?JSON.parse(init.body):{},values=name==='claim_maintenance_account_deletion'?[]:[args.target_request,args.target_user,args.target_epoch,args.target_lease];if(name==='confirm_maintenance_deletion_object_absence')values.push(args.target_attachment);
    await f.db.exec('set role service_role');try{return Response.json((await f.db.query('select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') value',values)).rows[0].value);}
    catch(error){errors.push({name,message:error.message});throw error;}finally{await f.db.exec('reset role');}
   }
   const prefix='/storage/v1/object/ouchi-product-attachments';
   if(init.method==='DELETE'){
    assert.equal(url.pathname,prefix);const body=JSON.parse(init.body);assert.deepEqual(body,{prefixes:[f.sourcePath]});assert.ok(f.objects.has(f.manifest.destination.objectPath));f.objects.delete(f.sourcePath);deletes++;return Response.json([{name:f.sourcePath}]);
   }
   assert.equal(init.method,'GET');assert.ok(url.pathname.startsWith(prefix+'/'));const path=url.pathname.slice(prefix.length+1),blob=f.objects.get(path);return blob?new Response(await blob.arrayBuffer(),{headers:{'content-type':blob.type}}):Response.json({code:'NoSuchKey',statusCode:'404'},{status:400});
  };
  const requestID=f.cleanupInput.requestID;await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[requestID]);
  const runtime=createAccountDeletionRuntime(config);assert.deepEqual(await runtime.runNext(AbortSignal.timeout(60000)),{state:'pending'},JSON.stringify(errors));assert.equal(deletes,1);assert.equal(rpcCalls.includes('complete_maintenance_account_deletion'),false);
  assert.equal((await f.db.query('select state from maintenance_private.account_deletion_requests where id=$1',[requestID])).rows[0].state,'pending');assert.equal(f.objects.has(f.sourcePath),false);assert.ok(f.objects.has(f.manifest.destination.objectPath));
  // Explicit synthetic sealed retention evidence; the runtime cannot create it.
  await f.db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-runtime-fixture-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[requestID]);await f.db.query("update maintenance_private.account_deletion_requests set available_at=clock_timestamp()-interval '1 second' where id=$1",[requestID]);
  assert.deepEqual(await runtime.runNext(AbortSignal.timeout(60000)),{state:'complete'},JSON.stringify(errors));assert.equal(deletes,1);assert.deepEqual(await runtime.runNext(AbortSignal.timeout(60000)),{state:'idle'});
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[[owner,recipient]])).rows[0].n,2);assert.equal((await f.db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,1);assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);assert.deepEqual(errors,[]);
 }finally{globalThis.fetch=original;restoreDriver?.();await f.db.close();}
});
