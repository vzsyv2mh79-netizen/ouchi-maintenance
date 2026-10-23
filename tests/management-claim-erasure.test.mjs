import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,rs,oe,re} from './fixtures/home-handoff-identifiers.mjs';
const job='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',lease='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role;alter table auth.users add column email text;alter table auth.users add column encrypted_password text;alter table auth.sessions add column aal text default $$aal1$$;alter table auth.sessions add column refreshed_at timestamp;create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,secret text);');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261014061618_ouchi_closure_review_private_access.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016132410_ouchi_ownerless_management_status.sql','20261016142322_ouchi_home_management_private_access.sql','20261016144216_ouchi_management_claim_erasure.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 for(const [user,epoch] of [[recipient,re],[recipient,randomUUID()],[owner,oe]])await db.query('insert into maintenance_private.ownerless_home_claims(request_id,home_id,home_instance,generation,user_id,app_epoch_id) values($1,$2,$3,$4,$5,$6)',[randomUUID(),home,randomUUID(),randomUUID(),user,epoch]);
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,records_erased,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '10 minutes',true,true)",[job,recipient,re,lease]);
 const args=[job,recipient,re,lease];
 return {db,args,erase:async(values=args)=>(await db.query('select public.erase_maintenance_deletion_management_claims($1,$2,$3,$4) value',values)).rows[0].value};
}
async function retire(db){await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[recipient]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[recipient]);await db.query('delete from public.home_members where user_id=$1',[recipient]);}
test('management metadata erasure requires exact live lease, completed record stage and retired enrollment without household roles',async()=>{
 const {db,args,erase}=await fixture();try{
  await db.exec('set role service_role');assert.equal(await erase(),false);
  await db.exec('reset role');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[recipient]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[recipient]);await db.exec('set role service_role');assert.equal(await erase(),false,'remaining membership must be resolved by family-preserving dispatcher');
  await db.exec('reset role');await retire(db);await db.exec('set role service_role');
  for(const index of [0,1,2,3]){const wrong=[...args];wrong[index]=randomUUID();assert.equal(await erase(wrong),false);}
  await db.exec('reset role');await db.query('update public.homes set owner_id=$2 where id=$1',[home,recipient]);await db.exec('set role service_role');assert.equal(await erase(),false);
  await db.exec('reset role');await db.query('update public.homes set owner_id=$2 where id=$1',[home,owner]);await db.query('update maintenance_private.account_deletion_requests set records_erased=false where id=$1',[job]);await db.exec('set role service_role');assert.equal(await erase(),false);
  await db.exec('reset role');await db.query("update maintenance_private.account_deletion_requests set records_erased=true,lease_until=clock_timestamp()-interval '1 second' where id=$1",[job]);await db.exec('set role service_role');assert.equal(await erase(),false);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,3);
 }finally{await db.close();}
});
test('acknowledged cleanup removes only this actor across retired generations and preserves records, Auth, other claims and completion state',async()=>{
 const {db,erase}=await fixture();try{
  await retire(db);const family=(await db.query('select to_jsonb(p) value from public.products p')).rows,users=(await db.query('select id from auth.users order by id')).rows;
  await db.exec('set role service_role');assert.equal(await erase(),true);assert.equal(await erase(),true);
  const remaining=(await db.query('select user_id,app_epoch_id from maintenance_private.ownerless_home_claims')).rows;assert.deepEqual(remaining,[{user_id:owner,app_epoch_id:oe}]);
  await db.exec('reset role');assert.deepEqual((await db.query('select to_jsonb(p) value from public.products p')).rows,family);assert.deepEqual((await db.query('select id from auth.users order by id')).rows,users);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[job])).rows[0].state,'running');
  for(const role of ['anon','authenticated','ouchi_closure_operator']){await db.exec('reset role;set role '+role);await assert.rejects(erase(),/permission denied/);}
 }finally{await db.close();}
});
test('new active epoch and pending review independently refuse cleanup with no partial erasure',async()=>{
 const {db,erase}=await fixture();try{
  await retire(db);await db.query('update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[recipient,randomUUID()]);await db.exec('set role service_role');assert.equal(await erase(),false);
  await db.exec('reset role');await db.query('update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[recipient,re]);
  await db.query("insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)",[recipient,re,randomUUID()]);await db.exec('set role service_role');assert.equal(await erase(),false);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,3);
 }finally{await db.close();}
});
test('completion and receipt readback remain false while any management metadata remains, including earlier generations',async()=>{
 const {db,args,erase}=await fixture();try{
  await retire(db);
  // Synthetic prerequisite fixtures only; not an implementation of identity erasure or retention approval.
  await db.query('delete from maintenance_private.app_session_epochs where user_id=$1',[recipient]);await db.query('delete from maintenance_private.app_epochs where user_id=$1',[recipient]);await db.query('delete from maintenance_private.account_access where user_id=$1',[recipient]);
  await db.query('update maintenance_private.account_deletion_requests set identity_erased=true,receipt_sessions_captured=true where id=$1',[job]);
  await db.query('insert into maintenance_private.deletion_receipt_sessions values($1,$2)',[job,rs]);await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-policy-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[job]);
  const complete=async()=>(await db.query('select public.complete_maintenance_account_deletion($1,$2,$3,$4) value',args)).rows[0].value;
  const confirmed=async()=>(await db.query('select public.maintenance_deletion_completion_is_confirmed($1,$2,$3,$4) value',args)).rows[0].value;
  await db.exec('set role service_role');assert.equal(await complete(),false);assert.equal(await confirmed(),false);
  await db.exec('reset role');await db.query('delete from maintenance_private.ownerless_home_claims where user_id=$1 and app_epoch_id=$2',[recipient,re]);await db.exec('set role service_role');assert.equal(await complete(),false,'older generation still contains actor metadata');
  assert.equal(await erase(),true);assert.equal(await complete(),true);assert.equal(await confirmed(),true);
  const expiry=(await db.query('select updated_at,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[job])).rows;assert.equal(await complete(),true);assert.deepEqual((await db.query('select updated_at,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[job])).rows,expiry);
  // Preserve the preexisting sealed-retention/restore-proof gates as well.
  await db.exec('reset role');await db.query("update maintenance_private.account_deletion_requests set receipt_expires_at=receipt_expires_at+interval '1 minute' where id=$1",[job]);await db.exec('set role service_role');assert.equal(await confirmed(),false);
 }finally{await db.close();}
});
