import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,stat,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {createPrivateOperatorConnection} from '../lib/closure-operator-connection.mjs';
import {createClosureFileStorageReader} from '../lib/closure-storage-runtime.mjs';
import {operatePrivateOperatorCopy,runPrivateOperatorCopy} from '../lib/closure-operator-copy.mjs';
const project='abcdefghijklmnopqrst',principal='ouchi_closure_decision_runtime',secretKey='sb_secret_synthetic_operator_copy';
const config={projectRef:project,databaseURL:`postgresql://${principal}:synthetic-password@db.${project}.supabase.co/postgres`},storageConfig={projectRef:project,secretKey};
const actual=process.env.OUCHI_OPERATOR_COPY_SQL_TEST==='true';
const databaseFactory=actual?async()=>{
 const client=new Client({host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),user:'postgres',password:'synthetic-ci-only',database:'postgres',connectionTimeoutMillis:3000,query_timeout:10000});
 await client.connect();assert.match((await client.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);
 return {query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),close:()=>client.end()};
}:undefined;

test('copy tool requires exact reviewed operations and cannot force, activate, remove or retire',async()=>{
 let connections=0;const connect=async()=>{connections++;throw Error('Unexpected connection');};
 for(const operation of ['force','activate','remove','retire','execute','record-decision'])await assert.rejects(operatePrivateOperatorCopy({connect,input:{operation},signal:AbortSignal.timeout(5000)}));
 const scope={intentID:randomUUID(),reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID()};
 for(const input of [{operation:'status',...scope,confirmation:'implicit'},{operation:'copy',...scope},{operation:'copy',...scope,confirmation:'COPY_REVIEWED_FAMILY_FILE_WITHOUT_ACTIVATION_OR_REMOVAL',force:true}])await assert.rejects(operatePrivateOperatorCopy({connect,input,storageConfig,expectedProject:project,signal:AbortSignal.timeout(5000)}));
 assert.equal(connections,0);
});

test('copy executable refuses unsafe credential files without leaking identifiers or keys',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-copy-cli-'));
 try{
  const credential=join(directory,'config.json'),request=join(directory,'request.json'),receipt=join(directory,'receipt.json');
  await writeFile(credential,JSON.stringify(config),{mode:0o600});await chmod(credential,0o644);await writeFile(request,JSON.stringify({operation:'copy',secretKey}),{mode:0o600});
  const command=spawnSync(process.execPath,['scripts/copy-maintenance-reviewed-file.mjs','--read-copy-status','--config',credential,'--project-ref',project,'--request',request,'--receipt',receipt],{encoding:'utf8',timeout:5000});
  assert.equal(command.status,1);assert.equal(command.stdout,'');assert.match(command.stderr,/outcome unconfirmed/);
  for(const value of [secretKey,'synthetic-password','postgresql://'])assert.equal(command.stderr.includes(value),false);
  await assert.rejects(stat(receipt),{code:'ENOENT'});
  const help=spawnSync(process.execPath,['scripts/copy-maintenance-reviewed-file.mjs','--help'],{encoding:'utf8',timeout:5000});assert.equal(help.status,0);assert.match(help.stdout,/Unknown writes remain pending/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('private copy commands bind current versioned decisions, verify staged bytes and never repost an unknown SDK write',async()=>{
 const f=await householdCopyFixture({databaseFactory}),directory=await mkdtemp(join(tmpdir(),'ouchi-operator-copy-')),original=globalThis.fetch;
 try{
  for(const name of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql','20261017025017_ouchi_account_content_retention_review.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  if(actual)await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-copy-runtime-only';grant ouchi_closure_operator to ${principal};insert into maintenance_private.closure_operator_principals values('${principal}',true)`);
  let begun=false,loseCommit=false,connections=0,writes=0,lostPOST=false,corrupt=false;
  const createClient=cfg=>{
   connections++;assert.equal(cfg.ssl.rejectUnauthorized,true);
   // Explicit synthetic principal/loopback alias; managed TLS is not verified.
   const c=actual?new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),ssl:false,password:'synthetic-copy-runtime-only'}):{
    on(){},async connect(){},async end(){if(begun){await f.db.query('ROLLBACK');begun=false;}},async query(sql,args){
     if(sql.startsWith('select session_user'))return {rows:[{principal,database:'postgres'}]};
     const result=await f.db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')begun=true;if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;return result;
    }
   };
   const query=c.query.bind(c);c.query=async(sql,args)=>{const result=await query(sql,args);if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw Error('synthetic commit acknowledgement lost');}return result;};return c;
  };
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input)),prefix='/storage/v1/object/ouchi-product-attachments/';assert.equal(url.origin,`https://${project}.supabase.co`);assert.ok(url.pathname.startsWith(prefix));assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('apikey'),secretKey);
   const path=url.pathname.slice(prefix.length);
   if(init.method==='GET'){
    const blob=f.objects.get(path);return blob?new Response(corrupt?Buffer.alloc(blob.size):await blob.arrayBuffer(),{headers:{'content-type':blob.type}}):Response.json({code:'NoSuchKey',statusCode:'404'},{status:400});
   }
   assert.equal(init.method,'POST');assert.ok(path.startsWith('households/'));assert.equal(new Headers(init.headers).get('x-upsert'),'false');assert.equal(f.objects.has(path),false);assert.ok(init.body instanceof FormData);
   const blob=init.body.get('');assert.ok(blob instanceof Blob);assert.deepEqual(Buffer.from(await blob.arrayBuffer()),f.bytes);f.objects.set(path,blob);writes++;
   if(lostPOST){lostPOST=false;throw Error('Synthetic response lost after object write');}
   return Response.json({Id:'synthetic-object-id',Key:'ouchi-product-attachments/'+path});
  };
  const connect=createPrivateOperatorConnection({rawConfig:config,expectedProject:project,createClient,purpose:'decision'});
  const ports=createAccountContentReviewPorts({connect,readFileBytes:createClosureFileStorageReader({projectID:project,secretKey})}),scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
  const credential=join(directory,'config.json'),storage=join(directory,'storage.json'),request=join(directory,'request.json');
  for(const [path,value] of [[credential,config],[storage,storageConfig]])await writeFile(path,JSON.stringify(value),{mode:0o600});
  const args=(mode,name)=>[mode,'--config',credential,'--project-ref',project,'--request',request,'--receipt',join(directory,name),...(mode==='--copy-reviewed-file'?['--storage-config',storage]:[])];
  const run=async(mode,name,input)=>{await writeFile(request,JSON.stringify(input),{mode:0o600});return runPrivateOperatorCopy({args:args(mode,name),createClient});};
  const decisionFor=async fileID=>{
   const row=(await ports.personalFiles.fileInventory({...scope,afterFile:null},f.signal)).items.find(x=>x.attachment_id===fileID);assert.ok(row);
   const inspection=await ports.personalFiles.inspectFile({...scope,fileID,expectedMetadataDigest:row.metadata_digest,inspectionID:randomUUID()},f.signal),decisionID=randomUUID();
   await ports.personalFiles.recordFileDecision({...scope,fileID,inspectionID:inspection.inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
   return decisionID;
  };
  // A pre-upgrade decision is deliberately insufficient after the v1 upgrade.
  await assert.rejects(f.port.prepare(f.input,f.signal));assert.equal(writes,0);
  const first={operation:'prepare',...f.input,decisionID:await decisionFor(f.input.fileID),confirmation:'PREPARE_REVIEWED_FAMILY_FILE_COPY'};
  loseCommit=true;await assert.rejects(run('--prepare-reviewed-copy','unknown.json',first),/acknowledgement lost/);assert.equal(JSON.parse(await readFile(join(directory,'unknown.json'),'utf8')).outcome,'unconfirmed');
  await run('--prepare-reviewed-copy','prepared.json',first);const prepared=JSON.parse(await readFile(join(directory,'prepared.json'),'utf8'));assert.equal(prepared.result.destination.id,first.destinationID);assert.equal(writes,0);
  const firstScope={...scope,intentID:first.intentID},copyInput={operation:'copy',...firstScope,confirmation:'COPY_REVIEWED_FAMILY_FILE_WITHOUT_ACTIVATION_OR_REMOVAL'};
  corrupt=true;await assert.rejects(run('--copy-reviewed-file','corrupt.json',copyInput),/bytes mismatch/);corrupt=false;assert.equal(writes,0);
  const copied=await run('--copy-reviewed-file','copied.json',copyInput);assert.equal(copied.status,'copy_verified');assert.equal(copied.activationConfirmed,false);assert.equal(writes,1);
  await run('--copy-reviewed-file','retry.json',copyInput);assert.equal(writes,1);
  assert.equal((await stat(join(directory,'copied.json'))).mode&0o777,0o600);
  const before=connections;await assert.rejects(runPrivateOperatorCopy({args:args('--copy-reviewed-file','copied.json'),createClient}),{code:'EEXIST'});assert.equal(connections,before);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[first.destinationID])).rows[0].state,'staged');assert.ok(f.objects.has(f.sourcePath));
  // Add another explicit synthetic source for the unknown-POST branch.
  const descriptor=(await ports.personalFiles.readFile({...scope,fileID:f.input.fileID,expectedMetadataDigest:prepared.result.metadataDigest},f.signal)).file;
  const fileID=randomUUID(),path=`${descriptor.uploaderID}/${descriptor.uploaderEpoch}/${fileID}.pdf`;
  await f.db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[fileID,descriptor.uploaderID,descriptor.uploaderEpoch,descriptor.productID,f.bytes.length,descriptor.sha256]);
  await f.db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),descriptor.uploaderID,descriptor.uploaderEpoch]);
  await f.db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),path,f.bytes.length,'upload']);f.objects.set(path,new Blob([f.bytes],{type:'application/pdf'}));
  const next={operation:'prepare',...scope,fileID,decisionID:await decisionFor(fileID),destinationID:randomUUID(),intentID:randomUUID(),confirmation:'PREPARE_REVIEWED_FAMILY_FILE_COPY'};
  await run('--prepare-reviewed-copy','next-prepared.json',next);
  const nextScope={...scope,intentID:next.intentID},nextCopy={operation:'copy',...nextScope,confirmation:'COPY_REVIEWED_FAMILY_FILE_WITHOUT_ACTIVATION_OR_REMOVAL'};
  lostPOST=true;await assert.rejects(run('--copy-reviewed-file','unknown-post.json',nextCopy));assert.equal(writes,2);assert.equal(JSON.parse(await readFile(join(directory,'unknown-post.json'),'utf8')).outcome,'unconfirmed');
  const pending=await run('--copy-reviewed-file','pending.json',nextCopy);assert.equal(pending.status,'pending');assert.equal(writes,2);
  await run('--read-copy-status','status.json',{operation:'status',...nextScope});const status=JSON.parse(await readFile(join(directory,'status.json'),'utf8'));assert.equal(status.result.writerState,'issued');assert.equal(status.sourceEraseConfirmed,false);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[next.destinationID])).rows[0].state,'staged');assert.ok(f.objects.has(path));
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{globalThis.fetch=original;await f.db.close();await rm(directory,{recursive:true,force:true});}
});
