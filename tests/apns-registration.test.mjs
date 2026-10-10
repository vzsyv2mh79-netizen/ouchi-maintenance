import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('test-only APNs registry rejects cross-account binding and closed enrollment delivery', async () => {
 const db = new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));grant usage on schema public to service_role,anon,authenticated;');
  await db.exec(readFileSync('ios/Tests/Fixtures/account-epochs-prototype.sql','utf8'));
  await db.exec(readFileSync('tests/fixtures/apns-registration-prototype.sql','utf8'));
  const user='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
  const session='33333333-3333-4333-8333-333333333333', otherSession='44444444-4444-4444-8444-444444444444';
  await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions values($1,$2),($3,$4)',[session,user,otherSession,other]); await db.exec('set role service_role');
  const enroll=async(u,s)=>(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[u,s])).rows[0].epoch;
  const epoch=await enroll(user,session), otherEpoch=await enroll(other,otherSession), token='ab'.repeat(32);
  const register=async(u,s,e,t=token)=>(await db.query('select public.register_maintenance_apns($1,$2,$3,$4,$5) as id',[u,s,e,t,'jp.ouchi.maintenance'])).rows[0].id;
  const allowed=async(id)=>(await db.query('select public.maintenance_apns_registration_allowed($1) as allowed',[id])).rows[0].allowed;
  const disable=async(u,s,e,id)=>(await db.query('select public.disable_maintenance_apns($1,$2,$3,$4) as disabled',[u,s,e,id])).rows[0].disabled;
  const id=await register(user,session,epoch); assert.equal(await register(user,session,epoch),id); assert.equal(await allowed(id),true);
  await assert.rejects(()=>register(other,otherSession,otherEpoch));
  await assert.rejects(()=>register(user,otherSession,epoch,'cd'.repeat(32)));
  await assert.rejects(()=>register(user,session,epoch,'../secret'));
  assert.equal(await disable(other,otherSession,otherEpoch,id),false);
  assert.equal(await disable(user,session,epoch,id),true); assert.equal(await allowed(id),false);
  assert.equal(await disable(user,session,epoch,id),false);
  const replacement=await register(user,session,epoch); assert.notEqual(replacement,id);
  await db.query('select maintenance_private.close_app_epoch($1,$2)',[user,epoch]);
  assert.equal(await allowed(replacement),false);
  const freshSession='55555555-5555-4555-8555-555555555555';await db.exec('reset role');await db.query('insert into auth.sessions values($1,$2)',[freshSession,user]);await db.exec('set role service_role');const fresh=await enroll(user,freshSession);
  assert.equal(await allowed(replacement),false);
  const freshId=await register(user,freshSession,fresh); assert.equal(await allowed(freshId),true); assert.equal(await allowed(replacement),false);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[freshSession]);await db.exec('set role service_role');assert.equal(await allowed(freshId),false);await assert.rejects(()=>register(user,freshSession,fresh,'cd'.repeat(32)));
  await db.exec('reset role;set role authenticated');
  await assert.rejects(()=>allowed(replacement));
  await assert.rejects(()=>db.query('select * from maintenance_private.apns_registrations'));
 } finally { await db.close(); }
});
