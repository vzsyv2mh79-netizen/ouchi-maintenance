import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('current and exact deletion receipts bind epoch; reenrollment and revoked session cannot inherit them',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
  for(const name of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261011001303_ouchi_deletion_progress_read.sql','20261011002954_ouchi_current_deletion_progress.sql','20261011052015_ouchi_deletion_live_session.sql','20261011065720_ouchi_deletion_progress_epoch.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',replacement='44444444-4444-4444-8444-444444444444';
  await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
  const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as v',[user,session])).rows[0].v;
  const id=(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) as v',[user,session,epoch])).rows[0].v;
  const read=async(request=id,u=user)=>(await db.query('select public.read_maintenance_session_deletion_progress($1,$2,$3) as v',[u,session,request])).rows[0].v;
  assert.deepEqual(await read(),{requestID:id,userID:user,epochID:epoch,state:'pending'});assert.deepEqual(await read(null),await read());assert.equal(await read(id,other),null);
  await db.exec('reset role');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');assert.equal((await read()).epochID,epoch);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[session]);await db.exec('set role service_role');assert.equal(await read(),null);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=null where id=$1',[session]);await db.query('update maintenance_private.app_epochs set epoch_id=$1,enabled=true where user_id=$2',[replacement,user]);await db.exec('set role service_role');assert.equal(await read(),null);assert.equal(await read(null),null);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(()=>db.query('select public.read_maintenance_deletion_progress($1,$2)',[id,user]));
   await assert.rejects(()=>db.query('select public.read_maintenance_current_deletion_progress($1)',[user]));
   await assert.rejects(()=>read());
  }
 }finally{await db.close();}
});
