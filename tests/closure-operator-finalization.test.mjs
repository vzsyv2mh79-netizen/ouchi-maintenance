import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,stat,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {product} from './fixtures/home-handoff-identifiers.mjs';
import {createAccountContentReviewPorts} from '../lib/closure-account-content-review.mjs';
import {createPrivateOperatorConnection} from '../lib/closure-operator-connection.mjs';
import {previewPrivateOperatorFinalization,applyPrivateOperatorFinalization,runPrivateOperatorFinalization} from '../lib/closure-operator-finalization.mjs';
const project='abcdefghijklmnopqrst',principal='ouchi_closure_decision_runtime';
const config={projectRef:project,databaseURL:`postgresql://${principal}:synthetic-test-password@db.${project}.supabase.co/postgres`};
const actual=process.env.OUCHI_OPERATOR_FINALIZATION_SQL_TEST==='true';
const databaseFactory=actual?async()=>{
 const c=new Client({host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),user:'postgres',password:'synthetic-ci-only',database:'postgres',query_timeout:10000,connectionTimeoutMillis:3000});
 await c.connect();assert.match((await c.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);return {query:(sql,args)=>c.query(sql,args),exec:sql=>c.query(sql),close:()=>c.end()};
}:undefined;

test('finalization rejects unknown operations, incomplete scopes and absent preview binding before any connection',async()=>{
 let connections=0;const connect=async()=>{connections++;throw Error('Unexpected connection');},signal=AbortSignal.timeout(5000);
 for(const operation of ['retire','copy','delete-account','dispatch','execute'])await assert.rejects(previewPrivateOperatorFinalization({connect,input:{operation},signal}),/Explicit finalization/);
 const seal={operation:'seal-coverage',planID:randomUUID(),reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),eventID:randomUUID(),evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'};
 for(const previewDigest of [undefined,'0','z'.repeat(64),'f'.repeat(64)])await assert.rejects(applyPrivateOperatorFinalization({connect,input:seal,previewDigest,signal}),/Exact preview digest/);
 for(const changed of [{...seal,extra:true},{...seal,userID:'invalid'},{...seal,confirmation:'implicit'}])await assert.rejects(previewPrivateOperatorFinalization({connect,input:changed,signal}));
 const {evidenceDigest,...redactionScope}=seal;
 void evidenceDigest;
 for(const replacement of ['\ud800','\udfff','\0'])await assert.rejects(previewPrivateOperatorFinalization({connect,input:{...redactionScope,operation:'redact-text',expectedDigest:'a'.repeat(64),itemKey:'text:products:synthetic:memo',replacement,confirmation:'REDACT_REVIEWED_COVERAGE_TEXT'},signal}),/Explicit reviewed finalization/);
 assert.equal(connections,0);
});

test('finalization executable rejects unsafe credentials without logging source text or passwords',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-finalization-cli-'));
 try{
  const credential=join(directory,'config.json'),input=join(directory,'request.json'),receipt=join(directory,'result.json');
  await writeFile(credential,JSON.stringify({...config,databaseURL:config.databaseURL.replace('synthetic-test-password','do-not-print-finalization-password')}),{mode:0o644});
  await chmod(credential,0o644);
  const request={operation:'redact-text',planID:randomUUID(),reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),eventID:randomUUID(),expectedDigest:'a'.repeat(64),itemKey:'text:products:synthetic:memo',replacement:'do-not-print-private-note',confirmation:'REDACT_REVIEWED_COVERAGE_TEXT'};
  await writeFile(input,JSON.stringify(request),{mode:0o600});
  let connections=0;
  await assert.rejects(runPrivateOperatorFinalization({args:['--preview','--config',credential,'--project-ref',project,'--request',input,'--receipt',receipt],createClient:()=>{connections++;throw Error('Unexpected connection');}}),/Private operator input/);assert.equal(connections,0);
  const result=spawnSync(process.execPath,['scripts/finalize-maintenance-closure-review.mjs','--preview','--config',credential,'--project-ref',project,'--request',input,'--receipt',receipt],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/outcome unconfirmed/);
  for(const value of ['do-not-print-finalization-password','do-not-print-private-note','postgresql://'])assert.equal(result.stderr.includes(value),false);
  await assert.rejects(stat(receipt),{code:'ENOENT'});
  const help=spawnSync(process.execPath,['scripts/finalize-maintenance-closure-review.mjs','--help'],{encoding:'utf8',timeout:5000});assert.equal(help.status,0);assert.match(help.stdout,/does not prove human approval/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('finalization workflow previews exact text, preserves family edits after lost commits and seals only a fresh fully reviewed plan',async()=>{
 const f=await householdCopyFixture({databaseFactory}),directory=await mkdtemp(join(tmpdir(),'ouchi-finalization-'));
 try{
  for(const name of ['20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql'])await f.db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  // Text-only synthetic setup: no actual Storage object or customer record is removed.
  await f.db.query('delete from maintenance_private.product_attachments where id=$1',[f.input.fileID]);
  await f.db.exec(readFileSync('supabase/migrations/20261017025017_ouchi_account_content_retention_review.sql','utf8'));
  if(actual)await f.db.exec(`create role ${principal} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-finalization-only';grant ouchi_closure_operator to ${principal};insert into maintenance_private.closure_operator_principals values('${principal}',true)`);
  let lose=false,connections=0;
  const createClient=cfg=>{
   connections++;assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.host,'db.'+project+'.supabase.co');let begun=false;
   // Explicit disposable transport alias, not managed TLS verification.
   const c=actual?new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),ssl:false,password:'synthetic-finalization-only'}):{
    on(){},async connect(){},async end(){if(begun){await f.db.query('ROLLBACK');begun=false;}},async query(sql,args){
     if(sql.startsWith('select session_user'))return {rows:[{principal,database:'postgres'}]};
     const result=await f.db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')begun=true;if(sql==='COMMIT'||sql==='ROLLBACK')begun=false;return result;
    }
   };
   const query=c.query.bind(c);c.query=async(sql,args)=>{const result=await query(sql,args);if(sql==='COMMIT'&&lose){lose=false;throw Error('synthetic acknowledgement lost');}return result;};return c;
  };
  const connect=createPrivateOperatorConnection({rawConfig:config,expectedProject:project,purpose:'decision',createClient}),ports=createAccountContentReviewPorts({connect}),signal=f.signal;
  const base={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
  const capture=async replacesPlanID=>{const scope={...base,planID:randomUUID()};await ports.coverage.capture({...scope,replacesPlanID,confirmation:replacesPlanID?'REPLACE_COMPLETE_SCOPED_REVIEW':'CAPTURE_COMPLETE_SCOPED_REVIEW'},signal);return scope;};
  const memo=async scope=>(await ports.coverage.page({...scope,afterKey:null},signal)).items.find(x=>x.kind==='text'&&x.record_id===product&&x.field_name==='memo');
  const redaction=async scope=>{const row=await memo(scope),current=await ports.coverage.readText({...scope,itemKey:row.item_key},signal);return {operation:'redact-text',...scope,itemKey:row.item_key,eventID:randomUUID(),expectedDigest:current.digest,replacement:'Reviewed neutral family note (synthetic)',confirmation:'REDACT_REVIEWED_COVERAGE_TEXT'};};
  await f.db.query('update public.products set memo=$1 where id=$2',['Departing account note (synthetic)',product]);
  const initial=await capture(null),first=await redaction(initial),preview=await previewPrivateOperatorFinalization({connect,input:first,signal});
  const reordered=await previewPrivateOperatorFinalization({connect,input:Object.fromEntries(Object.entries(first).reverse()),signal});assert.equal(reordered.requestDigest,preview.requestDigest);
  assert.equal(preview.detail.before,'Departing account note (synthetic)');assert.equal((await f.db.query('select memo from public.products where id=$1',[product])).rows[0].memo,preview.detail.before);
  const before=connections;await assert.rejects(applyPrivateOperatorFinalization({connect,input:{...first,replacement:'different'},previewDigest:preview.requestDigest,signal}),/Exact preview digest/);assert.equal(connections,before);
  await f.db.query('update public.products set memo=$1 where id=$2',['Concurrent family change (synthetic)',product]);
  await assert.rejects(applyPrivateOperatorFinalization({connect,input:first,previewDigest:preview.requestDigest,signal}),/Captured text changed/);
  const second=await capture(initial.planID),input=await redaction(second);
  const credential=join(directory,'config.json'),request=join(directory,'request.json');await writeFile(credential,JSON.stringify(config),{mode:0o600});await writeFile(request,JSON.stringify(input),{mode:0o600});
  const args=(mode,receipt,digest)=>[mode,'--config',credential,'--project-ref',project,'--request',request,'--receipt',receipt,...(digest?['--preview-digest',digest]:[])];
  const previewFile=join(directory,'preview.json'),ready=await runPrivateOperatorFinalization({args:args('--preview',previewFile),createClient});
  assert.equal((await stat(previewFile)).mode&0o777,0o600);assert.equal(JSON.parse(await readFile(previewFile,'utf8')).detail.before,'Concurrent family change (synthetic)');assert.equal(ready.mutationAuthorized,false);
  const unknown=join(directory,'unknown.json');lose=true;await assert.rejects(runPrivateOperatorFinalization({args:args('--apply-reviewed',unknown,ready.previewDigest),createClient}),/acknowledgement lost/);assert.equal(JSON.parse(await readFile(unknown,'utf8')).outcome,'unconfirmed');
  await f.db.query('update public.products set memo=$1 where id=$2',['Later family edit (synthetic)',product]);
  const confirmed=join(directory,'confirmed.json');await runPrivateOperatorFinalization({args:args('--apply-reviewed',confirmed,ready.previewDigest),createClient});
  assert.equal((await f.db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'Later family edit (synthetic)');assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_coverage_redactions where event_id=$1',[input.eventID])).rows[0].n,1);
  const receipt=JSON.parse(await readFile(confirmed,'utf8'));assert.equal(receipt.requiresNewCapture,true);assert.equal(receipt.accountErasureConfirmed,false);
  const third=await capture(second.planID),seal={operation:'seal-coverage',...third,eventID:randomUUID(),evidenceDigest:'b'.repeat(64),confirmation:'CONFIRM_COMPLETE_APP_SCOPED_REVIEW'};
  const incomplete=await previewPrivateOperatorFinalization({connect,input:seal,signal});assert.ok(incomplete.detail.unresolvedCount>0);await assert.rejects(applyPrivateOperatorFinalization({connect,input:seal,previewDigest:incomplete.requestDigest,signal}),/Complete current explicit review/);
  const page=await ports.coverage.page({...third,afterKey:null},signal);assert.equal(page.hasMore,false);
  // Explicit synthetic classifications only, not automated real authorship judgement.
  for(const row of page.items)if(row.kind==='text')await ports.coverage.recordTextDecision({...third,itemKey:row.item_key,eventID:randomUUID(),action:'retain_reviewed',evidenceDigest:'c'.repeat(64),confirmation:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'},signal);
  const finalPreview=await previewPrivateOperatorFinalization({connect,input:seal,signal});assert.equal(finalPreview.detail.unresolvedCount,0);
  lose=true;await assert.rejects(applyPrivateOperatorFinalization({connect,input:seal,previewDigest:finalPreview.requestDigest,signal}),/acknowledgement lost/);
  const sealed=await applyPrivateOperatorFinalization({connect,input:seal,previewDigest:finalPreview.requestDigest,signal});assert.equal(sealed.result.state,'sealed');assert.equal(sealed.result.current,true);assert.equal(sealed.mutationAuthorized,false);
  await f.db.query('update public.products set memo=$1 where id=$2',['Changed after seal (synthetic)',product]);
  const stale=await applyPrivateOperatorFinalization({connect,input:seal,previewDigest:finalPreview.requestDigest,signal});assert.equal(stale.result.current,false);assert.equal(stale.retirementExecuted,false);
  const n=connections;await assert.rejects(runPrivateOperatorFinalization({args:args('--apply-reviewed',confirmed,ready.previewDigest),createClient}),{code:'EEXIST'});assert.equal(connections,n);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await f.db.close();await rm(directory,{recursive:true,force:true});}
});
