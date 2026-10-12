import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
// Execute the prepared production query itself, rather than a hand-coded boolean.
// Narrow SQL fixture only: no Auth signature, live policy or transaction proof.
const sql=readFileSync('lib/home-handoff-identity.ts','utf8').match(/SQL=`([\s\S]*?)`;/)[1];
test('session SQL refuses future/expired timestamps and preserves explicit inactivity refusal',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema auth;
   create table auth.sessions(id uuid primary key,user_id uuid,aal text,created_at timestamptz,not_after timestamptz,refreshed_at timestamp);
   create table auth.mfa_factors(user_id uuid,status text);
   create function public.read_maintenance_explicit_enrollment(uuid,uuid) returns uuid language sql as $$select '33333333-3333-4333-8333-333333333333'::uuid$$;
   insert into auth.sessions values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','aal1',clock_timestamp()-interval '1 minute',null,null);`);
  const current=async(timebox=null,inactivity=null)=>(await db.query(sql,['22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',timebox,inactivity])).rows[0];
  assert.equal((await current()).session_current,true);
  assert.equal((await current(null,900)).session_current,false,'null refreshed_at remains explicitly unsupported with inactivity');
  assert.equal((await current(30)).session_current,false);
  await db.exec("update auth.sessions set refreshed_at=(clock_timestamp()+interval '1 day') at time zone 'UTC'");
  assert.equal((await current()).session_current,false);
  assert.equal((await current(null,900)).session_current,false,'future refresh cannot extend inactivity');
  await db.exec("update auth.sessions set refreshed_at=(clock_timestamp()-interval '1 minute') at time zone 'UTC'");
  assert.equal((await current(null,900)).session_current,true);
  assert.equal((await current(null,30)).session_current,false);
  await db.exec("update auth.sessions set not_after=clock_timestamp()-interval '1 second'");
  assert.equal((await current()).session_current,false);
  await db.exec("update auth.sessions set not_after=null,created_at=clock_timestamp()+interval '1 day'");
  assert.equal((await current()).session_current,false);
 } finally {await db.close();}
});
