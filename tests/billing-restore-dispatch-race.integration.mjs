// Synthetic two-session PostgreSQL proof. Never connects to a Supabase project.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID, randomBytes} from 'node:crypto';
if (process.env.OUCHI_RESTORE_DISPATCH_RACE_TEST !== 'true') throw new Error('Disposable CI opt-in required');
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
let nextOriginal=100000;
function seed(){
 const user=randomUUID(),sessionID=randomUUID(),epoch=randomUUID(),id=randomUUID(),lease=randomUUID();
 const original=String(++nextOriginal);
 sql(`insert into auth.users values('${user}');insert into maintenance_private.live_scope values('${user}','${sessionID}','${epoch}',true);insert into maintenance_private.account_access values('${user}',true);insert into maintenance_private.app_epochs values('${user}','${epoch}',true);insert into maintenance_private.app_session_epochs values('${user}','${epoch}');
 insert into maintenance_private.restore_transfer_jobs(id,user_id,session_id,app_epoch_id,environment,original_transaction_id,app_transaction_id,previous_account_token,bundle_id,lease_token,authorized_at,expected_counter,verified_counter,client_hash,assertion_hash,pair_hash) values('${id}','${user}','${sessionID}','${epoch}','Sandbox','${original}','200001','${randomUUID()}','dev.synthetic.ouchi','${lease}',now()-interval '10 seconds',0,1,'${proof}','${proof}','${proof}');`);
 return {id,lease,user,sessionID,epoch,original};
}
const claim=j=>call('claim_maintenance_restore_transfer',[j.id,j.user,j.sessionID,j.epoch,'dev.synthetic.ouchi',proof,proof].map(literal));
const marker=j=>call('mark_maintenance_restore_transfer_update',[j.id,j.lease,j.user,j.sessionID,j.epoch].map(literal));
async function competing(j,operation,commit){
 const first=operation==='claim'?claim(j):operation==='marker'?marker(j):`select pg_advisory_xact_lock(hashtext('${j.user}'));update maintenance_private.live_scope set enabled=false where user_id='${j.user}';`;
 const held=session('begin;'+(operation==='revoke'?'':'set role service_role;')+first+"select 'first-held';");
 await until(()=>held.output().includes('first-held'),'First operation did not reach held transaction');
 const name='ouchi_dispatch_'+randomBytes(8).toString('hex');
 const waiter=session(`set application_name='${name}';set role service_role;`+(operation==='marker'?marker(j):claim(j)));waiter.child.stdin.end();
 try{
  await until(()=>sql(`select count(*) from pg_stat_activity where datname='${database}' and application_name='${name}' and wait_event_type='Lock' and wait_event='advisory';`)==='1','Competing operation did not wait on the account lock');
  assert.equal(waiter.output().trim(),'');held.child.stdin.end(commit?'commit;\n':'rollback;\n');await held.done;
  const result=await waiter.done;
  if(operation==='marker'){
   if(commit)assert.equal(result,'');else assert.equal(JSON.parse(result).phase,'update_started');
   assert.equal(sql(`select phase from maintenance_private.restore_transfer_jobs where id='${j.id}';`),'update_started');
   assert.equal(sql('set role service_role;'+marker(j)),'','a later duplicate marker never authorizes another Apple update');
  }else if(operation==='revoke'&&commit){
   assert.equal(result,'');assert.equal(sql(`select last_dispatch_at is null from maintenance_private.restore_transfer_jobs where id='${j.id}';`),'t');
   assert.equal(sql(`select phase from maintenance_private.restore_transfer_jobs where id='${j.id}';`),'authorized');
  }else{
   const value=JSON.parse(result);assert.equal(value.status,operation==='claim'&&commit?'pending':'claimed');
   if(value.status==='claimed'){
    assert.equal(value.job.id,j.id);assert.equal(value.job.lease,j.lease);assert.equal(value.job.userID,j.user);assert.equal(value.job.sessionID,j.sessionID);assert.equal(value.job.epochID,j.epoch);assert.equal(value.job.phase,'authorized');
   }
   assert.equal(JSON.parse(sql('set role service_role;'+claim(j))).status,'pending');
   assert.equal(sql(`select phase from maintenance_private.restore_transfer_jobs where id='${j.id}';`),'authorized','claim does not authorize the external mutation by itself');
  }
  assert.equal(sql(`select count(*) from maintenance_private.transaction_ownership where original_transaction_id='${j.original}';`),'0');
  assert.equal(sql(`select count(*) from maintenance_private.verified_transactions where original_transaction_id='${j.original}';`),'0');
 }finally{if(!held.child.stdin.writableEnded)held.child.stdin.end('rollback;\n');}
}
try{
 execFileSync('docker',[...compose,'createdb','-U','postgres',database],{timeout:15000});
 sql(`set check_function_bodies=false;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
 create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
 create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
 create table maintenance_private.account_access(user_id uuid,enabled boolean);create table maintenance_private.app_epochs(user_id uuid,epoch_id uuid,enabled boolean);create table maintenance_private.app_session_epochs(user_id uuid,epoch_id uuid);
 grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;`);
 for(const file of ['20261010142053_ouchi_verified_transaction_ledger','20261011083324_ouchi_retired_transaction_ingestion','20261011142510_ouchi_restore_challenge_ledger','20261012004145_ouchi_restore_transfer_reservation','20261012004834_ouchi_restore_transfer_completion','20261012005754_ouchi_restore_completion_status','20261012010434_ouchi_restore_ownership_writer_guard','20261012035336_ouchi_restore_dispatch_claim'])sql('set check_function_bodies=false;'+readFileSync('supabase/migrations/'+file+'.sql','utf8'));
 sql('update maintenance_private.restore_transfer_policy set enabled=true where id=1;');
 for(const commit of [true,false]){
  await competing(seed(),'claim',commit);
  await competing(seed(),'marker',commit);
  await competing(seed(),'revoke',commit);
 }
 console.log('Actual parallel PostgreSQL dispatch: committed claim throttles second caller, rollback permits only the surviving claim; only one committed mutation marker; scope closure refuses waiting dispatch. Synthetic Auth/Apple only; no SDK update or rights.');
}finally{
 for(const child of children)child.kill('SIGKILL');
 execFileSync('docker',[...compose,'dropdb','-U','postgres','--if-exists','--force',database],{timeout:15000});
}
