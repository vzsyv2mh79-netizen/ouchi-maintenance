// Synthetic two-session PostgreSQL proof. Never connects to a Supabase project.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID, randomBytes} from 'node:crypto';
if (process.env.OUCHI_RETIREMENT_RACE_TEST !== 'true') throw new Error('Disposable CI opt-in required');
const compose = ['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db'];
const database = 'ouchi_retirement_' + randomBytes(8).toString('hex');
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
async function holdClosure(user) {
 const held=session(`begin;select pg_advisory_xact_lock(hashtext('${user}'));update maintenance_private.app_epochs set enabled=false where user_id='${user}';update maintenance_private.account_access set enabled=false where user_id='${user}';select 'closure-held';`);
 await until(()=>held.output().includes('closure-held'),'Closure did not acquire user lock');
 return held;
}
async function blockedThenRetired(user,call,label) {
 const held=await holdClosure(user);
 const application='ouchi_race_'+randomBytes(8).toString('hex');
 const waiting=session(`set application_name='${application}';set role service_role;${call}`);
 waiting.child.stdin.end();
 try {
  await until(()=>sql(`select count(*) from pg_stat_activity where datname='${database}' and application_name='${application}' and wait_event_type='Lock' and wait_event='advisory';`)==='1',label+' did not wait for the closure lock');
  assert.equal(waiting.output().trim(),'','Writer must not return before closure commits');
  held.child.stdin.end('commit;\n');await held.done;
  assert.equal(await waiting.done,'retired',label);
 } finally {if(!held.child.stdin.writableEnded)held.child.stdin.end('rollback;\n');}
}
const proof='a'.repeat(64);
const call=(name,payload)=>`select public.${name}(${sqlLiteral(JSON.stringify(payload))}::jsonb,'${proof}');`;
function identity() {
 const user=randomUUID(), session=randomUUID();
 sql(`insert into auth.users values('${user}');insert into auth.sessions(id,user_id) values('${session}','${user}');`);
 const epoch=sql(`set role service_role;select public.current_maintenance_purchase_account('${user}','${session}');`);
 return {user,epoch};
}
const transaction=(epoch,id,original=id)=>({environment:'Sandbox',transactionId:id,originalTransactionId:original,accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:100,purchasedAt:50,expiresAt:200});
try {
 execFileSync('docker',[...compose,'createdb','-U','postgres',database],{timeout:15000});
 sql('create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010220727_ouchi_verified_entitlement_read.sql','20261010224749_ouchi_verified_renewal_state.sql','20261011083324_ouchi_retired_transaction_ingestion.sql','20261011084235_ouchi_retired_renewal_ingestion.sql','20261010224129_ouchi_verified_notification_inbox.sql','20261011091753_ouchi_notification_account_erasure.sql'])sql(readFileSync('supabase/migrations/'+file,'utf8'));
 {
  const {user,epoch}=identity();
  await blockedThenRetired(user,call('apply_maintenance_verified_transaction',transaction(epoch,'101')),'new ownership');
  assert.equal(sql(`select count(*) from maintenance_private.transaction_ownership where user_id='${user}';`),'0');
  assert.equal(sql(`select count(*) from maintenance_private.verified_transactions where user_id='${user}';`),'0');
 }
 {
  const {user,epoch}=identity();
  assert.equal(sql('set role service_role;'+call('apply_maintenance_verified_transaction',transaction(epoch,'201'))),'inserted');
  await blockedThenRetired(user,call('apply_maintenance_verified_transaction',transaction(epoch,'202','201')),'new period');
  assert.equal(sql(`select count(*) from maintenance_private.verified_transactions where user_id='${user}';`),'1');
  // Refund updates remain ordered on the existing period after retirement.
  assert.equal(sql('set role service_role;'+call('apply_maintenance_verified_transaction',{...transaction(epoch,'201'),signedAt:300,revokedAt:250})),'updated');
  assert.equal(sql(`select revoked_at from maintenance_private.verified_transactions where transaction_id='201';`),'250');
 }
 {
  const {user,epoch}=identity();
  assert.equal(sql('set role service_role;'+call('apply_maintenance_verified_transaction',transaction(epoch,'301'))),'inserted');
  const renewal={environment:'Sandbox',originalTransactionId:'301',accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:100,renewalDate:200,autoRenewStatus:1,isInBillingRetryPeriod:false};
  assert.equal(sql('set role service_role;'+call('apply_maintenance_verified_renewal',renewal)),'inserted');
  await blockedThenRetired(user,call('apply_maintenance_verified_renewal',{...renewal,signedAt:300,autoRenewStatus:0}),'renewal update');
  assert.equal(sql(`select signed_at from maintenance_private.verified_renewals where user_id='${user}';`),'100');
 }
 {
  const {user,epoch}=identity();
  assert.equal(sql('set role service_role;'+call('apply_maintenance_verified_transaction',transaction(epoch,'401'))),'inserted');
  const notice={environment:'Sandbox',notificationId:randomUUID(),notificationType:'DID_RENEW',signedAt:100,disposition:'transaction_applied',accountToken:epoch,originalTransactionId:'401'};
  await blockedThenRetired(user,call('record_maintenance_verified_notification',notice),'notification inbox write');
  assert.equal(sql(`select count(*) from maintenance_private.verified_notifications where user_id='${user}';`),'0');
 }
 console.log('Actual PostgreSQL: four writers waited on the closure advisory lock; no new owner/period, renewal update or inbox record after closure; existing refund update preserved.');
} finally {
 for(const child of children)child.kill('SIGKILL');
 // Terminate only sessions in this freshly generated disposable database.
 execFileSync('docker',[...compose,'dropdb','-U','postgres','--if-exists','--force',database],{timeout:15000});
}
