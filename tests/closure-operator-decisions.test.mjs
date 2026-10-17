import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,stat,rm,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from 'pg';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {createHouseholdCopy} from '../lib/household-copy.mjs';
import {privateOperatorConfig,createPrivateOperatorConnection} from '../lib/closure-operator-connection.mjs';
import {recordPrivateOperatorDecision,runPrivateOperatorDecision} from '../lib/closure-operator-decisions.mjs';
const project='abcdefghijklmnopqrst',principal='ouchi_closure_decision_runtime';
const config={projectRef:project,databaseURL:`postgresql://${principal}:synthetic-test-password@db.${project}.supabase.co/postgres`};
const actual=process.env.OUCHI_OPERATOR_DECISION_SQL_TEST==='true';
const databaseFactory=actual?async()=>{
 const client=new Client({host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),user:'postgres',password:'synthetic-ci-only',database:'postgres',connectionTimeoutMillis:3000,query_timeout:10000});
 await client.connect();assert.match((await client.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);
 return {query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),close:()=>client.end()};
}:undefined;

test('decision purpose cannot use inspection, admin or unapproved role names and always verifies actual login',async()=>{
 assert.equal(privateOperatorConfig(config,project,'decision').role,'ouchi_closure_operator');
 for(const purpose of ['inspection','postgres','__proto__','other',undefined])assert.equal(privateOperatorConfig(config,project,purpose),null);
 for(const user of ['postgres','service_role','ouchi_closure_inspection_runtime'])assert.equal(privateOperatorConfig({...config,databaseURL:config.databaseURL.replace(principal,user)},project,'decision'),null);
 for(const actualPrincipal of [principal,'postgres','ouchi_closure_inspection_runtime']){
  const calls=[];let ended=0;
  const connect=createPrivateOperatorConnection({rawConfig:config,expectedProject:project,purpose:'decision',createClient:cfg=>{
   assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.query_timeout,5000);
   return {on(){},async connect(){},async end(){ended++;},async query(sql){calls.push(sql);return {rows:sql.startsWith('select session_user')?[{principal:actualPrincipal,database:'postgres'}]:[]};}};
  }});
  if(actualPrincipal===principal){const c=await connect({signal:AbortSignal.timeout(5000)});await c.query('BEGIN');assert.equal(calls.at(-1),'SET LOCAL ROLE ouchi_closure_operator');await c.close();}
  else{await assert.rejects(connect({signal:AbortSignal.timeout(5000)}),/principal unavailable/);assert.equal(calls.some(x=>x.startsWith('SET LOCAL ROLE')),false);}
  assert.equal(ended,1);
 }
});

test('decision tool refuses deletion, redaction, copying, unknown fields and old retention confirmation before connection',async()=>{
 let connections=0;const connect=async()=>{connections++;throw Error('Unexpected connection');};const signal=AbortSignal.timeout(5000);
 for(const operation of ['retire','redact','copy','seal','execute','record','capture'])await assert.rejects(recordPrivateOperatorDecision({connect,input:{operation},signal}),/decision operation/);
 for(const operation of ['text-decision','file-decision','household-file-decision'])await assert.rejects(recordPrivateOperatorDecision({connect,input:{operation,unexpected:'field'},signal}));
 const scope={reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),fileID:randomUUID(),inspectionID:randomUUID(),decisionID:randomUUID(),action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_PERSONAL_INFORMATION'};
 await assert.rejects(recordPrivateOperatorDecision({connect,input:{operation:'file-decision',...scope},signal}));
 assert.equal(connections,0);
});

test('decision executable refuses unsafe private inputs and prints neither credentials nor request details',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-decision-cli-'));
 try{
  const credential=join(directory,'credential.json'),request=join(directory,'request.json'),receipt=join(directory,'receipt.json');
  const password='do-not-print-fixture-password';
  await writeFile(credential,JSON.stringify({...config,databaseURL:config.databaseURL.replace('synthetic-test-password',password)}),{mode:0o600});await chmod(credential,0o644);
  await writeFile(request,JSON.stringify({operation:'text-decision',privateNote:'do-not-print-fixture-note'}),{mode:0o600});
  const command=spawnSync(process.execPath,['scripts/record-maintenance-closure-decision.mjs','--record-reviewed-decision','--config',credential,'--project-ref',project,'--request',request,'--receipt',receipt],{encoding:'utf8',timeout:5000});
  assert.equal(command.status,1);assert.equal(command.stdout,'');assert.match(command.stderr,/outcome unconfirmed/);
  for(const secret of [password,'do-not-print-fixture-note','postgresql://'])assert.equal(command.stderr.includes(secret),false);
  await assert.rejects(stat(receipt),{code:'ENOENT'});
  const help=spawnSync(process.execPath,['scripts/record-maintenance-closure-decision.mjs','--help'],{encoding:'utf8',timeout:5000});assert.equal(help.status,0);assert.match(help.stdout,/original request\/event/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('scoped decisions bind versioned SQL, retain original event after lost commit and save private acknowledgement without executing retirement',async()=>{
 const f=await householdCopyFixture({databaseFactory}),directory=await mkdtemp(join(tmpdir(),'ouchi-decision-test-'));
 try{
  for(const name of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql','20261017025017_ouchi_account_content_retention_review.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  if(actual)await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-decision-fixture-only';grant ouchi_closure_operator to ${principal};insert into maintenance_private.closure_operator_principals values('${principal}',true)`);
  let lose=false,connections=0;
  const createClient=cfg=>{
   connections++;assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.host,'db.'+project+'.supabase.co');
   // Explicit disposable loopback alias; managed TLS is not verified here.
   let begun=false;
   const c=actual?new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),ssl:false,password:'synthetic-decision-fixture-only'}):{
    on(){},async connect(){},async end(){if(begun){await f.db.query('ROLLBACK');begun=false;}},async query(sql,args){
     if(sql.startsWith('select session_user'))return {rows:[{principal,database:'postgres'}]};
     const result=await f.db.query(sql,args);
     if(sql==='BEGIN'||sql==='BEGIN READ ONLY')begun=true;
     if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;
     return result;
    }
   };
   const query=c.query.bind(c);c.query=async(sql,args)=>{const result=await query(sql,args);if(sql==='COMMIT'&&lose){lose=false;throw Error('synthetic commit acknowledgement lost');}return result;};return c;
  };
  const connect=createPrivateOperatorConnection({rawConfig:config,expectedProject:project,purpose:'decision',createClient});
  const ports=createAccountContentReviewPorts({connect,readFileBytes:async file=>f.objects.get(file.objectPath)});
  const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
  const plan={...scope,planID:randomUUID()};await ports.coverage.capture({...plan,replacesPlanID:null,confirmation:'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);
  const item=(await ports.coverage.page({...plan,afterKey:null},f.signal)).items.find(x=>x.kind==='text');assert.ok(item);
  const text={operation:'text-decision',...plan,itemKey:item.item_key,eventID:randomUUID(),action:'needs_review',evidenceDigest:'a'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_TEXT_REVIEW'};
  await recordPrivateOperatorDecision({connect,input:text,signal:f.signal});
  const file=(await ports.personalFiles.fileInventory({...scope,afterFile:null},f.signal)).items[0];
  const inspection=await ports.personalFiles.inspectFile({...scope,fileID:file.attachment_id,expectedMetadataDigest:file.metadata_digest,inspectionID:randomUUID()},f.signal);
  const input={operation:'file-decision',...scope,fileID:file.attachment_id,inspectionID:inspection.inspectionID,decisionID:randomUUID(),action:'retain_family_copy',evidenceDigest:'b'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'};
  const credential=join(directory,'config.json'),request=join(directory,'request.json');await writeFile(credential,JSON.stringify(config),{mode:0o600});await writeFile(request,JSON.stringify(input),{mode:0o600});
  const args=receipt=>['--record-reviewed-decision','--config',credential,'--project-ref',project,'--request',request,'--receipt',receipt];
  const uncertain=join(directory,'uncertain.json');lose=true;await assert.rejects(runPrivateOperatorDecision({args:args(uncertain),createClient}),/acknowledgement lost/);
  assert.equal(JSON.parse(await readFile(uncertain,'utf8')).outcome,'unconfirmed');
  const receipt=join(directory,'confirmed.json');const result=await runPrivateOperatorDecision({args:args(receipt),createClient});assert.equal(result.status,'recorded');assert.equal(result.retirementExecuted,false);
  const saved=JSON.parse(await readFile(receipt,'utf8'));assert.equal(saved.scope.decisionID,input.decisionID);assert.equal(saved.accountErasureConfirmed,false);assert.equal((await stat(receipt)).mode&0o777,0o600);
  const before=connections;await assert.rejects(runPrivateOperatorDecision({args:args(receipt),createClient}),{code:'EEXIST'});assert.equal(connections,before);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_file_decisions where decision_id=$1 and account_content_reviewed',[input.decisionID])).rows[0].n,1);
  await assert.rejects(recordPrivateOperatorDecision({connect,input:{...input,action:'needs_review',confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'},signal:f.signal}));
  if(actual)await assert.rejects(f.port.prepare({...f.input,decisionID:input.decisionID},f.signal),/Own retention decision required/);
  // Separate synthetic fixture setup, outside the decision command. The same
  // authenticated operator must own the inspection, decision and copy proof.
  const copy=createHouseholdCopy({connect,storage:{
   inspectDestination:async m=>f.objects.get(m.destination.objectPath)??null,
   readSource:async m=>f.objects.get(m.source.objectPath)??null,
   writeDestination:async(m,blob)=>{assert.equal(f.objects.has(m.destination.objectPath),false);f.objects.set(m.destination.objectPath,blob);}
  }});
  await copy.prepare({...f.input,decisionID:input.decisionID},f.signal);await copy.copy(f.operation,f.signal);
  await f.db.query("update maintenance_private.household_attachments set state='active' where id=$1",[f.input.destinationID]);
  const household=(await ports.householdFiles.fileInventory({...scope,afterFile:null},f.signal)).items[0];
  const inspected=await ports.householdFiles.inspectFile({...scope,fileID:household.attachment_id,expectedMetadataDigest:household.metadata_digest,inspectionID:randomUUID()},f.signal);
  const decision=await recordPrivateOperatorDecision({connect,input:{operation:'household-file-decision',...scope,fileID:household.attachment_id,inspectionID:inspected.inspectionID,decisionID:randomUUID(),action:'needs_review',evidenceDigest:'c'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'},signal:f.signal});assert.equal(decision.retirementExecuted,false);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);assert.equal(f.objects.has(f.sourcePath),true);
  await f.db.exec('update maintenance_private.closure_operator_principals set enabled=false');
  await assert.rejects(recordPrivateOperatorDecision({connect,input:text,signal:f.signal}),/Authorized operator connection required/);
 }finally{await f.db.close();await rm(directory,{recursive:true,force:true});}
});
