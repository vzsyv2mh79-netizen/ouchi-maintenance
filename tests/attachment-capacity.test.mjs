import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,rs,re} from './fixtures/home-handoff-identifiers.mjs';
import {createAttachmentCapacity} from '../lib/attachment-capacity.mjs';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role;alter table auth.users add column email text;alter table auth.users add column encrypted_password text;alter table auth.sessions add column aal text default $$aal1$$;alter table auth.sessions add column refreshed_at timestamp;create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,secret text)');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261014061618_ouchi_closure_review_private_access.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql','20261016123247_ouchi_closure_text_review_snapshot.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016132410_ouchi_ownerless_management_status.sql','20261016142322_ouchi_home_management_private_access.sql','20261016143928_ouchi_ownerless_closure_review_scope.sql','20261016144216_ouchi_management_claim_erasure.sql','20261016144839_ouchi_closure_file_review_inventory.sql','20261016150215_ouchi_closure_file_review_decisions.sql','20261016151202_ouchi_household_attachment_custody.sql','20261016152254_ouchi_attachment_physical_budget.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 let lose=false;const port=createAttachmentCapacity({connect:async()=>({abort(){},async close(){},async query(sql,args){const r=await db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role service_role');if(sql==='COMMIT'&&lose){lose=false;throw Error('commit acknowledgement lost');}return r;}})});
 const enable=async(bytes=100)=>db.exec(`update maintenance_private.attachment_app_budget_policy set writer_coverage_verified=true,budget_bytes=${bytes},enabled=true`);
 return {db,port,enable,loseNext:()=>{lose=true;},signal:new AbortController().signal};
}
const original=(user=owner,bytes=40)=>({claimID:randomUUID(),objectPath:`${user}/${randomUUID()}/${randomUUID()}.pdf`,bytes,purpose:'upload'});
const copy=(bytes=40)=>({claimID:randomUUID(),objectPath:`households/${randomUUID()}/${randomUUID()}.pdf`,bytes,purpose:'household-copy'});
test('physical budget starts disabled and counts originals/copies independently without authorizing writes',async()=>{
 const {db,port,enable,signal}=await fixture();try{
  const a=original(),b=copy();await assert.rejects(port.reserve(a,signal),/budget unavailable/);await db.exec('set role service_role');await assert.rejects(db.exec('update maintenance_private.attachment_app_budget_policy set enabled=true'),/permission denied/);await db.exec('reset role');await assert.rejects(db.exec('update maintenance_private.attachment_app_budget_policy set enabled=true,budget_bytes=100'),/coverage unavailable/);
  await enable();assert.equal((await port.reserve(a,signal)).writeAuthorized,false);await port.reserve(b,signal);await port.reserve(b,signal);
  assert.equal((await db.query('select sum(size_bytes)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,80);assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);
  await assert.rejects(port.reserve(copy(21),signal),/budget exceeded/);assert.equal(await port.read(copy(),signal),null);
 }finally{await db.close();}
});
test('lost COMMIT acknowledgement recovers same exact claim and never double-counts or silently changes path',async()=>{
 const {db,port,enable,signal,loseNext}=await fixture();try{
  await enable();const a=copy();loseNext();await assert.rejects(port.reserve(a,signal),/acknowledgement lost/);assert.equal((await port.read(a,signal)).state,'held');await port.reserve(a,signal);
  await assert.rejects(port.reserve({...a,bytes:39},signal),/scope conflict/);await assert.rejects(port.read({...a,objectPath:copy().objectPath},signal),/scope conflict/);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,1);
 }finally{await db.close();}
});
test('timeouts, policy withdrawal and metadata/account changes do not release held physical bytes',async()=>{
 const {db,port,enable,signal}=await fixture();try{
  await enable();const a=original();await port.reserve(a,signal);await db.exec('set role service_role');await assert.rejects(db.exec('delete from maintenance_private.attachment_capacity_claims'),/permission denied/);await db.exec('reset role');
  await assert.rejects(db.exec('delete from maintenance_private.attachment_capacity_claims'),/immutable/);await assert.rejects(db.exec('update maintenance_private.attachment_capacity_claims set size_bytes=1'),/immutable/);await assert.rejects(db.exec('update maintenance_private.attachment_app_budget_policy set budget_bytes=1'),/Held capacity/);
  await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);await db.exec('update maintenance_private.attachment_app_budget_policy set enabled=false');assert.equal((await port.read(a,signal)).state,'held');await assert.rejects(port.reserve(a,signal),/budget unavailable/);
 }finally{await db.close();}
});
test('input and namespace validation refuse foreign scope and client flags before any connection',async()=>{
 let connected=0;const port=createAttachmentCapacity({connect:async()=>{connected++;throw Error('not expected');}}),signal=new AbortController().signal;
 for(const value of [{...copy(),bytes:0},{...copy(),bytes:5242881},{...copy(),purpose:'upload'},{...original(),purpose:'household-copy'},{...copy(),objectPath:'../other'},{...copy(),paid:true},{...copy(),claimID:'00000000-0000-0000-0000-000000000000'}])await assert.rejects(port.reserve(value,signal),/Exact capacity/);
 assert.equal(connected,0);
});
test('unresolved identifying capacity paths block account completion even after synthetic identity/retention prerequisites',async()=>{
 const {db,port,enable,signal}=await fixture();try{
  await enable();await port.reserve(original(recipient),signal);
  const job=randomUUID(),lease=randomUUID();await db.query('delete from public.home_members where user_id=$1',[recipient]);for(const table of ['app_session_epochs','app_epochs','account_access'])await db.query('delete from maintenance_private.'+table+' where user_id=$1',[recipient]);
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,records_erased,inventory_captured,identity_erased,receipt_sessions_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '10 minutes',true,true,true,true)",[job,recipient,re,lease]);await db.query('insert into maintenance_private.deletion_receipt_sessions values($1,$2)',[job,rs]);await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[job]);
  await db.exec('set role service_role');for(const fn of ['complete_maintenance_account_deletion','maintenance_deletion_completion_is_confirmed'])assert.equal((await db.query('select public.'+fn+'($1,$2,$3,$4) value',[job,recipient,re,lease])).rows[0].value,false);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[job])).rows[0].state,'running');
 }finally{await db.close();}
});

test('capacity read rejects malformed scalar acknowledgements instead of coercing flags into bytes',async()=>{
 const claim=original(owner,1),signal=new AbortController().signal;
 for(const size_bytes of [true,'1e0','01',' 1',null,NaN]){
  const port=createAttachmentCapacity({connect:async()=>({abort(){},async close(){},async query(sql){return {rows:sql.startsWith('select claim_id')?[{claim_id:claim.claimID,object_path:claim.objectPath,size_bytes,purpose:claim.purpose}]:[]};}})});
  await assert.rejects(port.read(claim,signal),/Capacity scope conflict/);
 }
});
