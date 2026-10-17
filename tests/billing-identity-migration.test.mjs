import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('additive purchase identity preserves existing sharing and free access without granting premium',async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create schema maintenance_private;grant usage on schema maintenance_private to authenticated;create function maintenance_private.access_home(home_id uuid) returns boolean language sql as 'select true';create table public.homes(id uuid primary key);alter table public.homes enable row level security;create policy existing_free_access on public.homes for select to authenticated using(true);grant select on public.homes to authenticated;");
  await db.exec(readFileSync('supabase/migrations/20261010141353_ouchi_billing_identity.sql','utf8'));
  const u='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',s1='33333333-3333-4333-8333-333333333333',s2='44444444-4444-4444-8444-444444444444';
  await db.query('insert into auth.users values($1),($2)',[u,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2)',[s1,u,s2]);await db.query('insert into homes values($1)',[u]);
  await db.exec('set role authenticated');assert.equal((await db.query('select * from homes')).rows.length,1);assert.equal((await db.query('select maintenance_private.access_home($1) as ok',[u])).rows[0].ok,true);
  await assert.rejects(()=>db.query('select * from maintenance_private.app_epochs'));
  await assert.rejects(()=>db.query('select public.current_maintenance_purchase_account($1,$2)',[u,s1]));
  await db.exec('reset role;set role service_role');
  const bind=async(user,session)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as token',[user,session])).rows[0].token;
  assert.equal(await bind(other,s1),null);const token=await bind(u,s1);assert.ok(token);assert.notEqual(token,u);assert.equal(await bind(u,s1),token);assert.equal(await bind(u,s2),token);
  await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[u]);assert.equal(await bind(u,s1),null);assert.equal(await bind(u,s2),null);
  await db.query('update maintenance_private.app_epochs set enabled=true where user_id=$1',[u]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[u]);assert.equal(await bind(u,s1),null);
  await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[u]);
  await db.exec('reset role');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[s1]);await db.exec('set role service_role');assert.equal(await bind(u,s1),null);
  await db.query('update maintenance_private.app_epochs set epoch_id=gen_random_uuid() where user_id=$1',[u]);assert.equal(await bind(u,s2),null);
  await db.exec('reset role;set role authenticated');assert.equal((await db.query('select * from homes')).rows.length,1);
 }finally{await db.close();}
});
