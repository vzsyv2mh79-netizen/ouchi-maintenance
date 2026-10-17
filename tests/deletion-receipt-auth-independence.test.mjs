import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedClosureReauthenticationDatabase} from './fixtures/closure-reauth-database.mjs';
import {owner,recipient,os,rs,oe} from './fixtures/home-handoff-identifiers.mjs';
const sql=readFileSync('supabase/migrations/20261015052134_ouchi_deletion_receipt_auth_independence.sql','utf8');
test('detached receipt keeps live-session intake and immutable original request/actor/epoch/acceptance',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await db.exec('reset role');await db.exec(sql);await db.exec('set role service_role');
  await assert.rejects(db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[owner,rs,oe]),/Live app session/);
  await assert.rejects(db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[randomUUID(),randomUUID(),randomUUID()]),/Live app session/);
  await assert.rejects(db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[owner,os,oe]),/Family handoff required/);
  await db.exec('reset role');await db.query('delete from public.home_members where \"homeId\" in(select id from public.homes where owner_id=$1)',[owner]);await db.exec('set role service_role');
  const id=(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) id',[owner,os,oe])).rows[0].id;assert.ok(id);
  await db.exec('reset role');const before=(await db.query('select to_jsonb(r) value from maintenance_private.account_deletion_requests r where id=$1',[id])).rows;
  for(const [column,value] of [['id',randomUUID()],['user_id',recipient],['app_epoch_id',randomUUID()],['requested_at','2000-01-01T00:00:00Z']])await assert.rejects(db.query(`update maintenance_private.account_deletion_requests set ${column}=$2 where id=$1`,[id,value]),/immutable/);
  assert.deepEqual((await db.query('select to_jsonb(r) value from maintenance_private.account_deletion_requests r where id=$1',[id])).rows,before);
 }finally{await db.close();}
});
test('receipt independence grants no new table/function entry and retains RLS and non-null actor',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await db.exec('reset role');const access=()=>db.query("select relacl::text,relrowsecurity from pg_class where oid='maintenance_private.account_deletion_requests'::regclass").then(result=>result.rows);
  const before=await access();await db.exec(sql);assert.deepEqual(await access(),before);assert.equal(before[0].relrowsecurity,true);
  assert.equal((await db.query("select attnotnull from pg_attribute where attrelid='maintenance_private.account_deletion_requests'::regclass and attname='user_id'")).rows[0].attnotnull,true);
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='maintenance_private.account_deletion_requests'::regclass and confrelid='auth.users'::regclass")).rows[0].n,0);
  assert.equal((await db.query("select prosecdef from pg_proc where oid='maintenance_private.keep_deletion_request_actor()'::regprocedure")).rows[0].prosecdef,false);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'maintenance_private.keep_deletion_request_actor()','execute') value",[role])).rows[0].value,false);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id) values($1,$2)',[owner,oe]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('an unexpected prior foreign-key history is refused without dropping another constraint',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await db.exec('reset role;alter table maintenance_private.account_deletion_requests rename constraint account_deletion_requests_user_id_fkey to unexpected_actor_reference');
  await assert.rejects(db.exec(sql),/Expected deletion actor reference/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conrelid='maintenance_private.account_deletion_requests'::regclass and conname='unexpected_actor_reference'")).rows[0].n,1);
 }finally{await db.close();}
});
