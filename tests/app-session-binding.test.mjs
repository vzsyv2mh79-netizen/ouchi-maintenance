import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('additional live sessions share one app epoch without reopening or transferring closed enrollment',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));grant usage on schema public to service_role;');
  await db.exec(readFileSync('ios/Tests/Fixtures/account-epochs-prototype.sql','utf8'));
  await db.exec('create table maintenance_private.account_access(user_id uuid primary key,enabled boolean not null);grant select,update on maintenance_private.account_access to service_role;');
  await db.exec(readFileSync('tests/fixtures/app-session-binding-prototype.sql','utf8'));
  const u='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',s1='33333333-3333-4333-8333-333333333333',s2='44444444-4444-4444-8444-444444444444',s3='55555555-5555-4555-8555-555555555555';
  await db.query('insert into auth.users values($1),($2)',[u,other]);await db.query('insert into auth.sessions values($1,$2),($3,$2),($4,$2)',[s1,u,s2,s3]);await db.query('insert into maintenance_private.account_access values($1,true)',[u]);await db.exec('set role service_role');
  const epoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as e',[u,s1])).rows[0].e;
  const binding=async(user,session)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as e',[user,session])).rows[0].e;
  assert.equal(await binding(u,s2),epoch);assert.equal(await binding(u,s2),epoch);assert.equal(await binding(other,s2),null);
  assert.equal((await db.query('select * from maintenance_private.app_session_epochs where session_id=$1',[s2])).rows.length,1);
  await db.query('select maintenance_private.close_app_epoch($1,$2)',[u,epoch]);assert.equal(await binding(u,s3),null);
  const fresh=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as e',[u,s3])).rows[0].e;
  assert.notEqual(fresh,epoch);assert.equal(await binding(u,s1),null);assert.equal(await binding(u,s2),null);assert.equal(await binding(u,s3),fresh);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[s3]);await db.exec('set role service_role');assert.equal(await binding(u,s3),null);
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>binding(u,s2));
 }finally{await db.close();}
});
