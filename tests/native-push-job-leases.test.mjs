import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('native job leases fence stale workers and never automatically resend uncertain delivery', async () => {
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
  for(const name of ['20261010141353_ouchi_billing_identity.sql','20261011004515_ouchi_native_notification_registry.sql','20261011004715_ouchi_native_notification_registration.sql','20261011041519_ouchi_native_push_job_leases.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  const user='11111111-1111-4111-8111-111111111111', session='22222222-2222-4222-8222-222222222222', wrong='33333333-3333-4333-8333-333333333333';
  await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
  const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as e',[user,session])).rows[0].e;
  const device=(await db.query('select public.register_maintenance_native_push($1,$2,$3,$4,$5) as id',[user,session,epoch,'ab'.repeat(32),'Sandbox'])).rows[0].id;
  const job=async(state='pending')=>(await db.query("insert into maintenance_private.native_notification_jobs(device_id,due_at,state) values($1,clock_timestamp()-interval '1 second',$2) returning id",[device,state])).rows[0].id;
  const claim=async id=>(await db.query('select public.claim_maintenance_native_push_job($1) as v',[id])).rows[0].v;
  const start=async(id,lease)=>(await db.query('select public.start_maintenance_native_push_job($1,$2) as v',[id,lease])).rows[0].v;
  const finish=async(id,lease,result)=>(await db.query('select public.finish_maintenance_native_push_job($1,$2,$3) as v',[id,lease,result])).rows[0].v;
  const state=async id=>(await db.query('select state from maintenance_private.native_notification_jobs where id=$1',[id])).rows[0].state;
  const expire=async id=>db.query("update maintenance_private.native_notification_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[id]);
  const id=await job(),lease=await claim(id);assert.ok(lease);assert.equal(await claim(id),null);
  assert.equal(await start(id,wrong),false);assert.equal(await finish(id,lease,'accepted'),false);
  assert.equal(await start(id,lease),true);assert.equal(await start(id,lease),false);
  await expire(id);assert.equal(await claim(id),null);assert.equal(await state(id),'unknown');
  assert.equal(await finish(id,wrong,'accepted'),false);assert.equal(await finish(id,lease,'accepted'),true);
  assert.equal(await state(id),'sent');assert.equal(await finish(id,lease,'accepted'),true);assert.equal(await claim(id),null);
  const recoverable=await job(),old=await claim(recoverable);await expire(recoverable);
  const replacement=await claim(recoverable);assert.ok(replacement);assert.notEqual(old,replacement);
  assert.equal(await start(recoverable,old),false);assert.equal(await start(recoverable,replacement),true);
  assert.equal(await finish(recoverable,replacement,'delivery-unknown'),true);assert.equal(await claim(recoverable),null);
  const legacy=await job('claimed');assert.equal(await claim(legacy),null);assert.equal(await start(legacy,null),false);
  const retrying=await job();
  for(let attempt=0;attempt<3;attempt++){
   await db.query("update maintenance_private.native_notification_jobs set due_at=clock_timestamp()-interval '1 second' where id=$1",[retrying]);
   const retryLease=await claim(retrying);assert.ok(retryLease);assert.equal(await start(retrying,retryLease),true);
   assert.equal(await finish(retrying,retryLease,'retry'),true);
   assert.equal(await state(retrying),attempt<2?'pending':'failed');
   assert.equal(await finish(retrying,retryLease,'accepted'),false);
  }
  assert.equal(await claim(retrying),null);
  const revoked=await job(),revokedLease=await claim(revoked);
  await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[user]);
  assert.equal(await start(revoked,revokedLease),false);assert.equal(await claim(await job()),null);
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>claim(id));await assert.rejects(()=>start(id,lease));await assert.rejects(()=>finish(id,lease,'accepted'));
 } finally {await db.close();}
});
