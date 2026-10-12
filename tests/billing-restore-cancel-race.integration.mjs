// Synthetic two-session PostgreSQL proof. Never connects to a Supabase project.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID, randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import ts from 'typescript';
if (process.env.OUCHI_RESTORE_CANCEL_RACE_TEST !== 'true') throw new Error('Disposable CI opt-in required');
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
const moduleSource=ts.transpileModule(readFileSync('lib/billing-restore-client-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRestoreChallenge,restoreAssertionClientData}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
function seed(){
 const user=randomUUID(),sessionID=randomUUID(),epoch=randomUUID(),request=randomUUID(),app='SYNTHETIC1.dev.synthetic.ouchi',pair='b'.repeat(64),assertion='c'.repeat(64);
 const {publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),point=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]),key=createHash('sha256').update(point).digest('base64');
 sql(`insert into auth.users values('${user}');insert into maintenance_private.live_scope values('${user}','${sessionID}','${epoch}',true);
 set role service_role;insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt) values('${key}','${user}','${epoch}','${sessionID}','${app}','development',decode('${point.toString('hex')}','hex'),'${'a'.repeat(64)}',decode('01','hex'));`);
 const c=createRestoreChallenge({userID:user,sessionID,epochID:epoch,requestID:request,keyID:key,appID:app,attestEnvironment:'development',purchaseEnvironment:'Sandbox',proofSHA256:pair});
 const hash=createHash('sha256').update(restoreAssertionClientData(c)).digest('hex');
 assert.ok(sql(`set role service_role;select public.issue_maintenance_restore_challenge(${literal(JSON.stringify(c))}::jsonb,'${hash}');`).includes(request));
 const cancel=`select public.cancel_maintenance_unreserved_restore('${request}','${user}','${sessionID}','${epoch}','${key}','${app}','development','${pair}','${assertion}');`;
 const enqueue=`select public.enqueue_maintenance_restore_transfer('${request}','${user}','${sessionID}','${epoch}','${key}',0,1,'${hash}','${assertion}','${pair}','12345','98765','${randomUUID()}','dev.synthetic.ouchi','${randomUUID()}');`;
 return {user,key,request,cancel,enqueue};
}
async function race(cancelFirst,commit){
 const j=seed(),held=session('begin;set role service_role;'+(cancelFirst?j.cancel:j.enqueue)+"select 'first-held';");
 await until(()=>held.output().includes('first-held'),'First operation did not reach held transaction');
 const name='ouchi_cancel_'+randomBytes(8).toString('hex'),waiter=session(`set application_name='${name}';set role service_role;`+(cancelFirst?j.enqueue:j.cancel));waiter.child.stdin.end();
 try{
  await until(()=>sql(`select count(*) from pg_stat_activity where datname='${database}' and application_name='${name}' and wait_event_type='Lock' and wait_event='advisory';`)==='1','Second operation did not wait on account lock');
  assert.equal(waiter.output().trim(),'');held.child.stdin.end(commit?'commit;\n':'rollback;\n');await held.done;
  const result=await waiter.done;
  const cancelled=(cancelFirst&&commit)||(!cancelFirst&&!commit);
  if(cancelFirst)assert.equal(result,cancelled?'':j.request);else if(cancelled)assert.equal(JSON.parse(result).status,'cancelled');else assert.equal(result,'');
  assert.equal(sql(`select count(*) from maintenance_private.restore_cancelled_requests where request_id='${j.request}';`),cancelled?'1':'0');
  assert.equal(sql(`select count(*) from maintenance_private.restore_transfer_jobs where id='${j.request}';`),cancelled?'0':'1');
  assert.equal(sql(`select assertion_counter from maintenance_private.restore_attested_keys where key_id='${j.key}';`),cancelled?'0':'1');
  assert.equal(sql(`select count(*) from maintenance_private.restore_challenges where request_id='${j.request}' and consumed_at is not null;`),cancelled?'0':'1');
  // Allow each scenario to reuse the synthetic original transaction only after
  // its assertions. This privileged deletion is solely in this disposable DB.
  sql(`delete from maintenance_private.restore_transfer_jobs where id='${j.request}';`);
 }finally{if(!held.child.stdin.writableEnded)held.child.stdin.end('rollback;\n');}
}
try{
 execFileSync('docker',[...compose,'createdb','-U','postgres',database],{timeout:15000});
 sql(`set check_function_bodies=false;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
 create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
 create table maintenance_private.transaction_ownership(environment text,original_transaction_id text);
 create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
 grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;`);
 for(const file of ['20261011142510_ouchi_restore_challenge_ledger','20261012004145_ouchi_restore_transfer_reservation','20261012015539_ouchi_restore_challenge_transport','20261012031710_ouchi_restore_cancel_unreserved'])sql('set check_function_bodies=false;'+readFileSync('supabase/migrations/'+file+'.sql','utf8'));
 sql('update maintenance_private.restore_transfer_policy set enabled=true where id=1;');
 for(const first of [true,false])for(const commit of [true,false])await race(first,commit);
 console.log('Actual parallel PostgreSQL cancellation/enqueue: both lock orders and commit/rollback preserve exactly one result; cancelled proof never advances counter or creates a job. Synthetic Auth/Apple only.');
}finally{
 for(const child of children)child.kill('SIGKILL');
 execFileSync('docker',[...compose,'dropdb','-U','postgres','--if-exists','--force',database],{timeout:15000});
}
