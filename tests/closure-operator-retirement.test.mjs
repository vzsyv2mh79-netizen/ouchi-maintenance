import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,stat,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {home,product,owner,recipient} from './fixtures/home-handoff-identifiers.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {createHouseholdCopy} from '../lib/household-copy.mjs';
import {createPrivateOperatorConnection} from '../lib/closure-operator-connection.mjs';
import {previewPrivateOperatorRetirement,queuePrivateOperatorRetirement,runPrivateOperatorRetirement} from '../lib/closure-operator-retirement.mjs';
const project='abcdefghijklmnopqrst',principal='ouchi_closure_decision_runtime';
const config={projectRef:project,databaseURL:`postgresql://${principal}:synthetic-private-password@db.${project}.supabase.co/postgres`};
const actual=process.env.OUCHI_OPERATOR_RETIREMENT_SQL_TEST==='true';
const databaseFactory=actual?async()=>{
 const c=new Client({host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),user:'postgres',password:'synthetic-ci-only',database:'postgres',query_timeout:10000,connectionTimeoutMillis:3000});
 await c.connect();assert.match((await c.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);return {query:(sql,args)=>c.query(sql,args),exec:sql=>c.query(sql),close:()=>c.end()};
}:undefined;
const request=()=>({reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),planID:randomUUID(),sealEventID:randomUUID(),eventID:randomUUID(),confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'});

test('retirement command rejects broad scope, unknown confirmation and changed preview input before connection',async()=>{
 let connections=0;const connect=async()=>{connections++;throw Error('Unexpected connection');},signal=AbortSignal.timeout(5000),input=request();
 for(const value of [{...input,force:true},{...input,userID:'all'},{...input,confirmation:'DELETE_SHARED_AUTH'},{}])await assert.rejects(previewPrivateOperatorRetirement({connect,input:value,signal}));
 for(const previewDigest of [undefined,'a','f'.repeat(64)])await assert.rejects(queuePrivateOperatorRetirement({connect,input,previewDigest,signal}),/Exact retirement preview digest/);
 assert.equal(connections,0);
});

test('retirement executable refuses unsafe private files and reports neither credentials nor scope',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-retirement-cli-'));
 try{
  const credential=join(directory,'config.json'),input=join(directory,'input.json'),receipt=join(directory,'receipt.json'),value=request();
  await writeFile(credential,JSON.stringify(config),{mode:0o600});await chmod(credential,0o644);await writeFile(input,JSON.stringify(value),{mode:0o600});
  const command=spawnSync(process.execPath,['scripts/queue-maintenance-reviewed-retirement.mjs','--preview-retirement','--config',credential,'--project-ref',project,'--request',input,'--receipt',receipt],{encoding:'utf8',timeout:5000});
  assert.equal(command.status,1);assert.equal(command.stdout,'');assert.match(command.stderr,/outcome unconfirmed/);
  for(const secret of ['synthetic-private-password',value.userID,'postgresql://'])assert.equal(command.stderr.includes(secret),false);
  await assert.rejects(stat(receipt),{code:'ENOENT'});
  const help=spawnSync(process.execPath,['scripts/queue-maintenance-reviewed-retirement.mjs','--help'],{encoding:'utf8',timeout:5000});assert.equal(help.status,0);assert.match(help.stdout,/Queue acceptance is NOT completed erasure/);assert.match(help.stdout,/Missing historical metadata is unknown/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('current versioned review queues family attachment retirement once, refuses stale scope and recovers lost acknowledgement without erasure claims',async()=>{
 const f=await householdCopyFixture({databaseFactory}),directory=await mkdtemp(join(tmpdir(),'ouchi-reviewed-queue-'));
 try{
  for(const name of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql','20261017025017_ouchi_account_content_retention_review.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  if(actual)await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-retirement-runtime-only';grant ouchi_closure_operator to ${principal};insert into maintenance_private.closure_operator_principals values('${principal}',true)`);
  let begun=false,lose=false,connections=0;
  const createClient=cfg=>{
   connections++;assert.equal(cfg.ssl.rejectUnauthorized,true);
   // Explicit synthetic principal/loopback alias; managed TLS is not verified.
   const c=actual?new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),ssl:false,password:'synthetic-retirement-runtime-only'}):{
    on(){},async connect(){},async end(){if(begun){await f.db.query('ROLLBACK');begun=false;}},async query(sql,args){
     if(sql.startsWith('select session_user'))return {rows:[{principal,database:'postgres'}]};
     const result=await f.db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')begun=true;if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;return result;
    }
   };
   const query=c.query.bind(c);c.query=async(sql,args)=>{const result=await query(sql,args);if(sql==='COMMIT'&&lose){lose=false;throw Error('synthetic commit acknowledgement lost');}return result;};return c;
  };
  const connect=createPrivateOperatorConnection({rawConfig:config,expectedProject:project,createClient,purpose:'decision'}),ports=createAccountContentReviewPorts({connect,readFileBytes:async file=>f.objects.get(file.objectPath)});
  const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
  // Explicit privileged synthetic home setup and rollout flags; not production approval.
  await f.db.query('update public.homes set owner_id=$1 where id=$2',[recipient,home]);await f.db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,owner,'Synthetic remaining family']);
  await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=true,writer_coverage_verified=true,attachments_enabled=true');
  const file=(await ports.personalFiles.fileInventory({...scope,afterFile:null},f.signal)).items[0],inspectionID=randomUUID(),decisionID=randomUUID();
  await ports.personalFiles.inspectFile({...scope,fileID:file.attachment_id,expectedMetadataDigest:file.metadata_digest,inspectionID},f.signal);
  await ports.personalFiles.recordFileDecision({...scope,fileID:file.attachment_id,inspectionID,decisionID,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
  const copy=createHouseholdCopy({connect,storage:{inspectDestination:async m=>f.objects.get(m.destination.objectPath)??null,readSource:async m=>f.objects.get(m.source.objectPath)??null,writeDestination:async(m,blob)=>{assert.equal(f.objects.has(m.destination.objectPath),false);f.objects.set(m.destination.objectPath,blob);}}});
  await copy.prepare({...f.input,decisionID},f.signal);await copy.copy(f.operation,f.signal);
  const capture=async replacesPlanID=>{
   const plan={...scope,planID:randomUUID()};await ports.coverage.capture({...plan,replacesPlanID,confirmation:replacesPlanID?'REPLACE_COMPLETE_SCOPED_REVIEW':'CAPTURE_COMPLETE_SCOPED_REVIEW'},f.signal);
   const page=await ports.coverage.page({...plan,afterKey:null},f.signal);assert.equal(page.hasMore,false);
   // These are explicit synthetic classifications, not automatic real authorship review.
   for(const row of page.items)if(row.kind==='text')await ports.coverage.recordTextDecision({...plan,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'b'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},f.signal);
   const sealEventID=randomUUID();await ports.coverage.seal({...plan,eventID:sealEventID,evidenceDigest:'c'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'},f.signal);
   return {...plan,sealEventID,eventID:randomUUID(),confirmation:'EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'};
  };
  const credential=join(directory,'config.json'),input=join(directory,'request.json');await writeFile(credential,JSON.stringify(config),{mode:0o600});
  const args=(mode,name,digest)=>[mode,'--config',credential,'--project-ref',project,'--request',input,'--receipt',join(directory,name),...(digest?['--preview-digest',digest]:[])];
  const initial=await capture(null);await writeFile(input,JSON.stringify(initial),{mode:0o600});
  const absent=await runPrivateOperatorRetirement({args:args('--read-retirement-status','absent.json'),createClient});assert.equal(absent.status,'unconfirmed');const noReceipt=JSON.parse(await readFile(join(directory,'absent.json'),'utf8'));assert.equal(noReceipt.absenceMeansNoRetirement,false);assert.equal(noReceipt.retirementQueued,null);
  const preview=await runPrivateOperatorRetirement({args:args('--preview-retirement','preview.json'),createClient});const before=JSON.parse(await readFile(join(directory,'preview.json'),'utf8'));assert.equal(before.coverage.current,true);assert.equal(before.effects.mayActivateReviewedFamilyCopies,true);assert.equal(before.executionEligibilityVerified,false);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[f.input.destinationID])).rows[0].state,'staged');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
  const n=connections;await assert.rejects(runPrivateOperatorRetirement({args:args('--queue-reviewed-retirement','wrong-digest.json','f'.repeat(64)),createClient}),/Exact retirement preview digest/);assert.equal(connections,n);
  await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=false');await assert.rejects(queuePrivateOperatorRetirement({connect,input:initial,previewDigest:preview.previewDigest,signal:f.signal}),/unavailable/);await f.db.exec('update maintenance_private.reviewed_retirement_policy set enabled=true');
  await f.db.query('update public.products set memo=$1 where id=$2',['Concurrent synthetic family change',product]);await assert.rejects(queuePrivateOperatorRetirement({connect,input:initial,previewDigest:preview.previewDigest,signal:f.signal}),/review changed/);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
  const current=await capture(initial.planID);await writeFile(input,JSON.stringify(current),{mode:0o600});const ready=await runPrivateOperatorRetirement({args:args('--preview-retirement','ready.json'),createClient});
  lose=true;await assert.rejects(runPrivateOperatorRetirement({args:args('--queue-reviewed-retirement','unknown.json',ready.previewDigest),createClient}),/acknowledgement lost/);assert.equal(JSON.parse(await readFile(join(directory,'unknown.json'),'utf8')).outcome,'unconfirmed');
  const status=await runPrivateOperatorRetirement({args:args('--read-retirement-status','queued-status.json'),createClient});assert.equal(status.status,'observed');assert.equal(status.accountErasureConfirmed,false);
  await f.db.query('update public.products set memo=$1 where id=$2',['Later synthetic family edit',product]);
  await runPrivateOperatorRetirement({args:args('--queue-reviewed-retirement','confirmed.json',ready.previewDigest),createClient});const saved=JSON.parse(await readFile(join(directory,'confirmed.json'),'utf8'));assert.equal(saved.retirementQueued,true);assert.equal(saved.accountErasureConfirmed,false);assert.equal(saved.receipt.deletionRequestID,current.eventID);assert.equal(saved.receipt.detachedHomeCount,1);
  assert.equal((await stat(join(directory,'confirmed.json'))).mode&0o777,0o600);
  const after=await previewPrivateOperatorRetirement({connect,input:current,signal:f.signal});assert.equal(after.coverage,null);assert.equal(after.prior.deletionRequestID,current.eventID);
  const connectionsBefore=connections;await assert.rejects(runPrivateOperatorRetirement({args:args('--queue-reviewed-retirement','confirmed.json',ready.previewDigest),createClient}),{code:'EEXIST'});assert.equal(connections,connectionsBefore);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,1);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments where id=$1',[f.input.destinationID])).rows[0].state,'active');assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
  assert.equal((await f.db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'Later synthetic family edit');assert.equal((await f.db.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[[recipient,owner]])).rows[0].n,2);assert.ok(f.objects.has(f.sourcePath));
 }finally{await f.db.close();await rm(directory,{recursive:true,force:true});}
});
