import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('current lookup proves absence read-only and refuses stale or unresolved scope',async()=>{
 const db=new PGlite();try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now());
   create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;`);
  for(const file of ['20261010141353_ouchi_billing_identity','20261010234402_ouchi_account_deletion_requests','20261011122749_ouchi_explicit_enrollment_guard','20261011123511_ouchi_explicit_enrollment_consent','20261011001303_ouchi_deletion_progress_read','20261011002954_ouchi_current_deletion_progress','20261011052015_ouchi_deletion_live_session','20261011065720_ouchi_deletion_progress_epoch','20261011131725_ouchi_deletion_receipt_session_snapshot','20261012174446_ouchi_current_deletion_lookup'])await db.exec(readFileSync('supabase/migrations/'+file+'.sql','utf8'));
  const user=randomUUID(),session=randomUUID(),fresh=randomUUID(),foreign=randomUUID();
  await db.query('insert into auth.users values($1)',[user]);
  for(const id of [session,fresh])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id,user]);
  const read=async(u=user,s=session,r=null)=>(await db.query('select public.read_maintenance_session_deletion_lookup($1,$2,$3) as value',[u,s,r])).rows[0].value;
  await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from maintenance_private.app_epochs where user_id=$1',[user])).rows[0].n,0);
  await db.exec('update maintenance_private.enrollment_policy set require_explicit=true;set role service_role');
  const epoch=(await db.query('select public.enroll_maintenance_app_with_consent($1,$2,$3,$4) as value',[user,session,fresh,randomUUID()])).rows[0].value.epochID;
  await db.exec('begin read only');assert.deepEqual(await read(),{state:'not_requested',userID:user,epochID:epoch});
  assert.equal(await read(foreign),null);assert.equal(await read(user,foreign),null);assert.equal(await read(user,session,foreign),null);await db.exec('rollback;reset role');
  await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[session]);await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=null where id=$1',[session]);
  await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[user]);
  const old=randomUUID();await db.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[old,user,randomUUID()]);
  await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');await db.query('delete from maintenance_private.account_deletion_requests where id=$1',[old]);await db.exec('set role service_role');
  const id=(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) as value',[user,session,epoch])).rows[0].value;
  await db.exec('begin read only');assert.deepEqual(await read(),{state:'pending',userID:user,requestID:id,epochID:epoch});await db.exec('rollback;reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>read());await db.exec('reset role');}
 } finally {await db.close();}
});
