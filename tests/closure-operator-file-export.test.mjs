import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,chmod,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {closureStorageRuntime} from '../scripts/generate-closure-storage-runtime.mjs';
import {createClosureFileStorageReader,createClosureHouseholdFileStorageReader} from '../lib/closure-storage-runtime.mjs';
import {inspectPrivateOperatorFile,runPrivateOperatorFileExport} from '../lib/closure-operator-file-export.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
const project='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_file_export',principal='ouchi_closure_decision_runtime';
const config={projectRef:project,databaseURL:`postgresql://${principal}:synthetic-password@db.${project}.supabase.co/postgres`},storageConfig={projectRef:project,secretKey};
const actual=process.env.OUCHI_OPERATOR_FILE_EXPORT_SQL_TEST==='true';
const databaseFactory=actual?async()=>{
 const client=new Client({host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),user:'postgres',password:'synthetic-ci-only',database:'postgres',connectionTimeoutMillis:3000,query_timeout:10000});
 await client.connect();assert.match((await client.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);
 return {query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),close:()=>client.end()};
}:undefined;

test('Node private Storage runtime is generated exactly from canonical bounded TypeScript',async()=>{
 assert.equal(await readFile('lib/closure-storage-runtime.mjs','utf8'),await closureStorageRuntime());
});

test('generated SDK readers restrict both path families, sizes, configuration and cancellation',async()=>{
 const original=globalThis.fetch,signal=new AbortController().signal;
 try{
  for(const household of [false,true]){
   const attachmentID=randomUUID(),uploaderID=randomUUID(),uploaderEpoch=randomUUID(),homeInstanceID=randomUUID();
   const file={attachmentID,uploaderID,uploaderEpoch,homeID:randomUUID(),homeInstanceID,mime:'application/pdf',sizeBytes:12,bucket:'ouchi-product-attachments',objectPath:household?`households/${homeInstanceID}/${attachmentID}.pdf`:`${uploaderID}/${uploaderEpoch}/${attachmentID}.pdf`};
   const read=(household?createClosureHouseholdFileStorageReader:createClosureFileStorageReader)({projectID:project,secretKey});let calls=0;
   globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),`https://${project}.supabase.co/storage/v1/object/${file.bucket}/${file.objectPath}`);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('apikey'),secretKey);return new Response('abcdefghijkl',{headers:{'content-type':file.mime}});};
   assert.equal((await read(file,signal)).size,12);
   for(const objectPath of ['../secret','https://attacker.invalid/file',file.objectPath+'?token=foreign',`households/${randomUUID()}/${attachmentID}.pdf`])await assert.rejects(read({...file,objectPath},signal));
   assert.equal(calls,1);
   globalThis.fetch=async()=>new Response('abcdefghijklX',{headers:{'content-type':file.mime}});await assert.rejects(read(file,signal));
   globalThis.fetch=async()=>new Response('bad',{status:403});await assert.rejects(read(file,signal));
   const cancelled=new AbortController();cancelled.abort(Error('cancelled'));await assert.rejects(read(file,cancelled.signal),/cancelled/);
  }
 }finally{globalThis.fetch=original;}
});

test('file inspection executable rejects unsafe credentials and never prints sensitive values',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-file-cli-'));
 try{
  const credential=join(directory,'config.json'),storage=join(directory,'storage.json'),request=join(directory,'request.json'),output=join(directory,'export');
  await writeFile(credential,JSON.stringify(config),{mode:0o600});await chmod(credential,0o644);
  await writeFile(storage,JSON.stringify(storageConfig),{mode:0o600});await writeFile(request,JSON.stringify({operation:'delete',privateNote:'private-fixture-note'}),{mode:0o600});
  const command=spawnSync(process.execPath,['scripts/inspect-maintenance-closure-file.mjs','--inspect-file','--config',credential,'--storage-config',storage,'--project-ref',project,'--request',request,'--output-directory',output],{encoding:'utf8',timeout:5000});
  assert.equal(command.status,1);assert.equal(command.stdout,'');assert.match(command.stderr,/outcome unconfirmed/);
  for(const value of [secretKey,'synthetic-password','private-fixture-note','postgresql://'])assert.equal(command.stderr.includes(value),false);
  await assert.rejects(stat(output),{code:'ENOENT'});
  const help=spawnSync(process.execPath,['scripts/inspect-maintenance-closure-file.mjs','--help'],{encoding:'utf8',timeout:5000});assert.equal(help.status,0);assert.match(help.stdout,/original inspection ID/);
  let connections=0;
  for(const operation of ['delete','copy','seal','file-decision'])await assert.rejects(inspectPrivateOperatorFile({connect:async()=>{connections++;},input:{operation},storageConfig,expectedProject:project,signal:AbortSignal.timeout(5000)}));
  assert.equal(connections,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('scoped SQL and SDK export reject changed bytes, preserve uncertain receipt and recover same inspection without retention',async()=>{
 const f=await householdCopyFixture({databaseFactory}),directory=await mkdtemp(join(tmpdir(),'ouchi-file-export-')),original=globalThis.fetch;
 try{
  await f.db.exec(readFileSync('supabase/migrations/20261016161923_ouchi_closure_household_file_review.sql','utf8'));
  if(actual)await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-file-export-only';grant ouchi_closure_operator to ${principal};insert into maintenance_private.closure_operator_principals values('${principal}',true)`);
  let begun=false,lose=false,connections=0,corrupt=false,reads=0;
  const createClient=cfg=>{
   connections++;assert.equal(cfg.ssl.rejectUnauthorized,true);
   // Explicit synthetic principal probe/loopback alias. Not managed TLS proof.
   const c=actual?new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),ssl:false,password:'synthetic-file-export-only'}):{
    on(){},async connect(){},async end(){if(begun){await f.db.query('ROLLBACK');begun=false;}},async query(sql,args){
     if(sql.startsWith('select session_user'))return {rows:[{principal,database:'postgres'}]};
     const result=await f.db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')begun=true;if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;return result;
    }
   };
   const query=c.query.bind(c);c.query=async(sql,args)=>{const result=await query(sql,args);if(sql==='COMMIT'&&lose){lose=false;throw Error('synthetic commit acknowledgement lost');}return result;};return c;
  };
  // Actual SDK, simulated object service. No real customer or Storage service.
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input));assert.equal(url.origin,`https://${project}.supabase.co`);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('apikey'),secretKey);
   const path=url.pathname.slice('/storage/v1/object/ouchi-product-attachments/'.length),blob=f.objects.get(path);assert.ok(blob);reads++;
   return new Response(corrupt?Buffer.alloc(blob.size):await blob.arrayBuffer(),{headers:{'content-type':blob.type}});
  };
  const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID},ports=createAccountContentReviewPorts({connect:f.connect});
  const row=(await ports.personalFiles.fileInventory({...scope,afterFile:null},f.signal)).items[0];
  const input={operation:'personal-file',...scope,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()};
  const credential=join(directory,'config.json'),storage=join(directory,'storage.json'),request=join(directory,'request.json');
  for(const [path,value] of [[credential,config],[storage,storageConfig],[request,input]])await writeFile(path,JSON.stringify(value),{mode:0o600});
  const args=output=>['--inspect-file','--config',credential,'--storage-config',storage,'--project-ref',project,'--request',request,'--output-directory',join(directory,output)];
  corrupt=true;await assert.rejects(runPrivateOperatorFileExport({args:args('corrupt'),createClient}),/content mismatch/);corrupt=false;
  assert.equal(JSON.parse(await readFile(join(directory,'corrupt/inspection.json'),'utf8')).outcome,'unconfirmed');await assert.rejects(stat(join(directory,'corrupt/attachment.pdf')),{code:'ENOENT'});
  lose=true;await assert.rejects(runPrivateOperatorFileExport({args:args('unknown'),createClient}),/acknowledgement lost/);assert.equal(JSON.parse(await readFile(join(directory,'unknown/inspection.json'),'utf8')).outcome,'unconfirmed');
  const result=await runPrivateOperatorFileExport({args:args('confirmed'),createClient});assert.equal(result.retentionApproved,false);
  const saved=JSON.parse(await readFile(join(directory,'confirmed/inspection.json'),'utf8'));assert.equal(saved.scope.inspectionID,input.inspectionID);assert.equal(saved.receipt.subjectConfirmed,false);assert.equal(saved.accountErasureConfirmed,false);
  assert.deepEqual(await readFile(join(directory,'confirmed/attachment.pdf')),f.bytes);
  assert.equal((await stat(join(directory,'confirmed'))).mode&0o777,0o700);
  for(const filename of ['inspection.json','attachment.pdf'])assert.equal((await stat(join(directory,'confirmed',filename))).mode&0o777,0o600);
  const before=connections;await assert.rejects(runPrivateOperatorFileExport({args:args('confirmed'),createClient}),{code:'EEXIST'});assert.equal(connections,before);
  await writeFile(request,JSON.stringify({...input,expectedMetadataDigest:'f'.repeat(64)}),{mode:0o600});const priorReads=reads;await assert.rejects(runPrivateOperatorFileExport({args:args('stale'),createClient}));assert.equal(reads,priorReads);
  // Separate privileged synthetic fixture prepares a household object.
  await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);
  await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
  const household=(await ports.householdFiles.fileInventory({...scope,afterFile:null},f.signal)).items.find(v=>v.attachment_id===f.input.destinationID);assert.ok(household);
  await writeFile(request,JSON.stringify({operation:'household-file',...scope,fileID:household.attachment_id,expectedMetadataDigest:household.metadata_digest,inspectionID:randomUUID()}),{mode:0o600});
  await runPrivateOperatorFileExport({args:args('household'),createClient});assert.deepEqual(await readFile(join(directory,'household/attachment.pdf')),f.bytes);
  assert.equal(JSON.parse(await readFile(join(directory,'household/inspection.json'),'utf8')).receipt.householdRetentionApproved,false);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);assert.ok(f.objects.has(f.sourcePath));
 }finally{globalThis.fetch=original;await f.db.close();await rm(directory,{recursive:true,force:true});}
});
