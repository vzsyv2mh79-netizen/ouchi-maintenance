// Synthetic two-session PostgreSQL proof. Never connects to a Supabase project.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID, randomBytes} from 'node:crypto';
if (process.env.OUCHI_RESTORE_WRITER_RACE_TEST !== 'true') throw new Error('Disposable CI opt-in required');
const compose = ['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db'];
const database = 'ouchi_restore_' + randomBytes(8).toString('hex');
const sqlLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
const args = ['psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'];
const sql = input => execFileSync('docker',[...compose,...args],{input,encoding:'utf8',timeout:15000}).trim();
const children = new Set();
function session(input) {
 const child = spawn('docker',[...compose,...args],{stdio:['pipe','pipe','pipe']});
 children.add(child);
 let output='', error='';
 child.stdout.on('data',data=>{output+=data;}); child.stderr.on('data',data=>{error+=data;});
 const done = new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('SQL session timed out'));},20000);
  child.once('error',failure=>{clearTimeout(timer);children.delete(child);reject(failure);});
  child.once('close',code=>{clearTimeout(timer);children.delete(child);if(code===0)resolve(output.trim());else reject(new Error('SQL session failed: '+error));});
 });
 // Observe rejection immediately; callers still await the original promise.
 done.catch(()=>{});
 child.stdin.write(input+'\n');
 return {child,done,output:()=>output};
}
async function until(predicate,message) {
 const deadline=Date.now()+10000;
 while(Date.now()<deadline) {if(predicate())return;await new Promise(resolve=>setTimeout(resolve,40));}
 throw new Error(message);
}
const literal=sqlLiteral;
const proof='a'.repeat(64);
function call(name,args){return `select public.${name}(${args.join(',')});`;}
const writer=p=>call('apply_maintenance_verified_transaction',[literal(JSON.stringify(p))+'::jsonb',literal(proof)]);
let nextOriginal=100000;
function seed(){
 const user=randomUUID(),sessionID=randomUUID(),epoch=randomUUID(),foreign=randomUUID(),foreignEpoch=randomUUID(),id=randomUUID(),lease=randomUUID();
 const original=String(++nextOriginal);
 sql(`insert into auth.users values('${user}'),('${foreign}');insert into maintenance_private.live_scope values('${user}','${sessionID}','${epoch}',true);insert into maintenance_private.account_access values('${user}',true),('${foreign}',true);insert into maintenance_private.app_epochs values('${user}','${epoch}',true),('${foreign}','${foreignEpoch}',true);insert into maintenance_private.app_session_epochs values('${user}','${epoch}'),('${foreign}','${foreignEpoch}');
 insert into maintenance_private.restore_transfer_jobs(id,user_id,session_id,app_epoch_id,environment,original_transaction_id,app_transaction_id,previous_account_token,bundle_id,lease_token,authorized_at,expected_counter,verified_counter,client_hash,assertion_hash,pair_hash) values('${id}','${user}','${sessionID}','${epoch}','Sandbox','${original}','200001','${randomUUID()}','dev.synthetic.ouchi','${lease}',now()-interval '10 seconds',0,1,'${proof}','${proof}','${proof}');`);
 const payload={environment:'Sandbox',originalTransactionId:original,transactionId:original,accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:Date.now(),purchasedAt:Date.now()-1000,expiresAt:Date.now()+3600000};
 const completion=call('complete_maintenance_restore_transfer',[id,lease,user,sessionID,epoch,'200001','dev.synthetic.ouchi'].map(literal).concat([literal(JSON.stringify(payload))+'::jsonb',literal(proof)]));
 return {id,user,epoch,foreign,foreignEpoch,original,payload,completion};
}
async function competing(j,commit){
 const held=session('begin;set role service_role;'+j.completion+"select 'completion-held';");
 await until(()=>held.output().includes('completion-held'),'Completion did not reach durable transaction');
 const foreignName='ouchi_foreign_'+randomBytes(8).toString('hex');
 const foreign=session(`set application_name='${foreignName}';set role service_role;`+writer({...j.payload,accountToken:j.foreignEpoch}));foreign.child.stdin.end();
 const ownedName='ouchi_owned_'+randomBytes(8).toString('hex');
 const owned=session(`set application_name='${ownedName}';set role service_role;`+writer({...j.payload,transactionId:j.original+'1',signedAt:Date.now()}));owned.child.stdin.end();
 try{
  for(const name of [foreignName,ownedName])await until(()=>sql(`select count(*) from pg_stat_activity where datname='${database}' and application_name='${name}' and wait_event_type='Lock' and wait_event='advisory';`)==='1','Writer did not wait on shared advisory ordering');
  assert.equal(foreign.output().trim(),'');assert.equal(owned.output().trim(),'');
  held.child.stdin.end(commit?'commit;\n':'rollback;\n');await held.done;
  await assert.rejects(foreign.done,/Purchase reserved for verified restore/);
  if(commit)assert.equal(await owned.done,'inserted');else await assert.rejects(owned.done,/Purchase reserved for verified restore/);
 }finally{if(!held.child.stdin.writableEnded)held.child.stdin.end('rollback;\n');}
 assert.equal(sql(`select count(*) from maintenance_private.transaction_ownership where original_transaction_id='${j.original}';`),commit?'1':'0');
 assert.equal(sql(`select count(*) from maintenance_private.verified_transactions where original_transaction_id='${j.original}';`),commit?'2':'0');
 assert.equal(sql(`select phase from maintenance_private.restore_transfer_jobs where id='${j.id}';`),commit?'completed':'authorized');
}
try{
 execFileSync('docker',[...compose,'createdb','-U','postgres',database],{timeout:15000});
 sql(`set check_function_bodies=false;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
 create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
 create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
 create table maintenance_private.account_access(user_id uuid,enabled boolean);create table maintenance_private.app_epochs(user_id uuid,epoch_id uuid,enabled boolean);create table maintenance_private.app_session_epochs(user_id uuid,epoch_id uuid);
 grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;`);
 for(const file of ['20261010142053_ouchi_verified_transaction_ledger','20261011083324_ouchi_retired_transaction_ingestion','20261011142510_ouchi_restore_challenge_ledger','20261012004145_ouchi_restore_transfer_reservation','20261012004834_ouchi_restore_transfer_completion','20261012005754_ouchi_restore_completion_status','20261012010434_ouchi_restore_ownership_writer_guard'])sql('set check_function_bodies=false;'+readFileSync('supabase/migrations/'+file+'.sql','utf8'));
 sql('update maintenance_private.restore_transfer_policy set enabled=true where id=1;');
 await competing(seed(),true);await competing(seed(),false);
 console.log('Actual parallel PostgreSQL sessions: foreign/owned writers wait; commit allows only same-owner period; rollback preserves reservation and creates no owner/period. Synthetic Auth/Apple only.');
}finally{
 for(const child of children)child.kill('SIGKILL');
 execFileSync('docker',[...compose,'dropdb','-U','postgres','--if-exists','--force',database],{timeout:15000});
}
