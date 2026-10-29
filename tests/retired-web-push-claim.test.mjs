import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reviewedCleanupFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {owner,recipient} from './fixtures/home-handoff-identifiers.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
const migration=readFileSync('supabase/migrations/20261016234937_ouchi_retired_web_push_claim_guard.sql','utf8');
const closedSubscription='00000000-0000-4000-8000-000000000001',familySubscription='00000000-0000-4000-8000-000000000002';
async function fixture(){
 return reviewedCleanupFixture({asOwner:true,beforeCoverage:async f=>{
  const h=randomUUID(),p=randomUUID();
  await f.db.query('insert into public.homes(id,owner_id,name) values($1,$2,$3)',[h,recipient,'Synthetic unshared home']);
  await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[p,h,'air','Synthetic unshared product']);
  await f.db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[randomUUID(),p,'Synthetic due work','掃除','ユーザー設定']);
  for(const [id,user] of [[closedSubscription,recipient],[familySubscription,owner]])await f.db.query('insert into public.maintenance_push_subscriptions(id,user_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5)',[id,user,'https://web.push.apple.com/'+id,'a'.repeat(87),'a'.repeat(22)]);
 }});
}
async function claim(db,size=1){await db.exec('set role service_role');try{return (await db.query('select * from public.claim_maintenance_push($1)',[size])).rows;}finally{await db.exec('reset role');}}
const subscription=async db=>(await db.query('select * from public.maintenance_push_subscriptions where id=$1',[closedSubscription])).rows[0];
test('old sender can claim closed unshared-home work; candidate excludes it before LIMIT and preserves remaining family',async()=>{
 const f=await fixture();try{
  await f.retire.execute(f.execute,f.signal);const before=await subscription(f.db);
  await f.db.exec('begin');const old=await claim(f.db);assert.equal(old[0].id,closedSubscription);assert.ok(old[0].claim_token);assert.ok(Number(old[0].due_count)>0);await f.db.exec('rollback');
  await f.db.exec(migration);const rows=await claim(f.db);assert.equal(rows.length,1);assert.equal(rows[0].id,familySubscription);assert.deepEqual(await subscription(f.db),before);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in ($1,$2)',[owner,recipient])).rows[0].n,2);
 }finally{await f.db.close();}
});
test('a prior delivery lease is not refreshed after actual reviewed retirement, even after lease expiry',async()=>{
 const f=await fixture();try{
  await f.db.exec(migration);const rows=await claim(f.db);assert.equal(rows[0].id,closedSubscription);const token=rows[0].claim_token;assert.ok(token);
  await f.retire.execute(f.execute,f.signal);
  await f.db.query("update public.maintenance_push_subscriptions set claimed_until=clock_timestamp()-interval '1 second' where id=$1",[closedSubscription]);const before=await subscription(f.db);
  await claim(f.db,100);assert.deepEqual(await subscription(f.db),before);
  await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.can_dispatch_maintenance_push($1,$2) allowed',[closedSubscription,token])).rows[0].allowed,false);await f.db.exec('reset role');
 }finally{await f.db.close();}
});
test('missing explicit enrollment fails closed; enrollment policy latch cannot be reversed or removed',async()=>{
 const f=await fixture();try{
  await f.db.exec(migration);await f.db.query('delete from maintenance_private.app_session_epochs where user_id=$1',[recipient]);await f.db.query('delete from maintenance_private.app_epochs where user_id=$1',[recipient]);await f.db.query('delete from maintenance_private.account_access where user_id=$1',[recipient]);
  const before=await subscription(f.db);assert.equal((await claim(f.db))[0].id,familySubscription);assert.deepEqual(await subscription(f.db),before);
  await assert.rejects(f.db.exec('update maintenance_private.enrollment_policy set require_explicit=false'),/cannot be reversed/);await assert.rejects(f.db.exec('delete from maintenance_private.enrollment_policy'),/cannot be removed/);
 }finally{await f.db.close();}
});
test('sender and private open-account predicate stay service-only invokers with empty search_path; stale transaction mode refused',async()=>{
 const f=await fixture();try{
  await f.db.exec(migration);
  const rows=(await f.db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('web_push_account_is_open','claim_maintenance_push')")).rows;
  assert.equal(rows.length,2);for(const row of rows){assert.equal(row.prosecdef,false);assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);assert.ok(row.proconfig.includes('search_path=""'));}
  await f.db.exec('begin isolation level repeatable read;set local role service_role');await assert.rejects(f.db.query('select * from public.claim_maintenance_push(100)'),/read committed/);await f.db.exec('rollback');
 }finally{await f.db.close();}
});

test('new guard remains compatible with an originally non-explicit MVP policy, without reversing the activated latch',async()=>{
 const db=await seedHomeHandoffFullSchemaFixture({explicitEnrollment:false});try{
  await db.exec('reset role');await db.exec(migration);
  await db.query('delete from maintenance_private.app_session_epochs where user_id=$1',[owner]);await db.query('delete from maintenance_private.app_epochs where user_id=$1',[owner]);await db.query('delete from maintenance_private.account_access where user_id=$1',[owner]);
  await db.query('insert into public.maintenance_push_subscriptions(id,user_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5)',[familySubscription,owner,'https://web.push.apple.com/legacy-only','a'.repeat(87),'a'.repeat(22)]);
  const rows=await claim(db);assert.equal(rows[0].id,familySubscription);assert.ok(rows[0].claim_token);
  assert.equal((await db.query('select require_explicit from maintenance_private.enrollment_policy')).rows[0].require_explicit,false);
 }finally{await db.close();}
});
