import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('strict enrollment guard denies absent/deleted epochs and unmapped or revoked sessions without recreating identity; default remains compatible',async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;");
  for(const file of ['20261010141353_ouchi_billing_identity.sql','20261011122749_ouchi_explicit_enrollment_guard.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec('grant usage on schema auth,maintenance_private to authenticated;');
  const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',fresh='44444444-4444-4444-8444-444444444444',otherSession='55555555-5555-4555-8555-555555555555';
  await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)',[session,user,fresh,otherSession,other]);
  await db.exec('set role service_role');const read=async(u=user,s=session)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as epoch',[u,s])).rows[0].epoch;
  const epoch=await read(),otherEpoch=await read(other,otherSession);assert.ok(epoch&&otherEpoch);assert.equal(await read(),epoch);
  const open=async(u=user,s=session)=>{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u,session_id:s})]);return (await db.query('select maintenance_private.maintenance_account_is_open() as open')).rows[0].open;};
  assert.equal(await open(),true);await db.exec('update maintenance_private.enrollment_policy set require_explicit=true where id=1;');
  assert.equal(await read(),epoch);assert.equal(await open(),true);assert.equal(await read(user,fresh),null);assert.equal(await open(user,fresh),false);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[session]);await db.exec('set role service_role');assert.equal(await read(),null);assert.equal(await open(),false);
  await db.exec('reset role');await db.query('delete from maintenance_private.app_session_epochs where user_id=$1',[user]);await db.query('delete from maintenance_private.app_epochs where user_id=$1',[user]);await db.query('delete from maintenance_private.account_access where user_id=$1',[user]);await db.exec('set role service_role');
  assert.equal(await read(user,fresh),null);assert.equal(await open(user,fresh),false);assert.equal(await read(other,otherSession),otherEpoch);assert.equal(await open(other,otherSession),true);
  assert.equal((await db.query('select count(*)::int as total from maintenance_private.app_epochs where user_id=$1',[user])).rows[0].total,0);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int as total from auth.users')).rows[0].total,2);assert.equal((await db.query('select count(*)::int as total from auth.sessions where id=$1',[fresh])).rows[0].total,1);
  await db.exec('set role authenticated');await assert.rejects(()=>db.exec('update maintenance_private.enrollment_policy set require_explicit=false'));await assert.rejects(()=>read());await assert.rejects(()=>db.query('select public.maintenance_explicit_enrollment_is_required()'));
 }finally{await db.close();}
});
