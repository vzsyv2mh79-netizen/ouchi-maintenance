import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('deletion SQL claims one immutable scope, resumes expired leases and rejects stale workers',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261010234907_ouchi_account_deletion_leases.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
 const request=async(u=user,s=session,e=epoch)=>(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) as value',[u,s,e])).rows[0].value;
 const id=await request();assert.match(id,/^[0-9a-f-]{36}$/);assert.equal(await request(),id);
 const rows=(await db.query('select user_id,app_epoch_id,state from maintenance_private.account_deletion_requests')).rows;assert.deepEqual(rows,[{user_id:user,app_epoch_id:epoch,state:'pending'}]);
 const claim=async()=>(await db.query('select public.claim_maintenance_account_deletion() as value')).rows[0].value;
 const current=async j=>(await db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) as value',[j.requestID,j.userID,j.epochID,j.leaseToken])).rows[0].value;
 const defer=async j=>(await db.query('select public.defer_maintenance_account_deletion($1,$2,$3,$4) as value',[j.requestID,j.userID,j.epochID,j.leaseToken])).rows[0].value;
 const first=await claim();assert.equal(first.requestID,id);assert.equal(first.epochID,epoch);assert.equal(await current(first),true);assert.equal(await claim(),null);assert.equal(await request(),id);
 assert.equal(await current({...first,userID:other}),false);assert.equal(await defer({...first,epochID:other}),false);
 await db.exec('reset role');await db.query("update maintenance_private.account_deletion_requests set lease_until=now()-interval '1 second' where id=$1",[id]);await db.exec('set role service_role');assert.equal(await current(first),false);assert.equal(await defer(first),false);
 const resumed=await claim();assert.notEqual(resumed.leaseToken,first.leaseToken);assert.equal(await current(resumed),true);assert.equal(await defer(resumed),true);assert.equal(await defer(resumed),false);assert.equal(await claim(),null);
 for(let attempt=3;attempt<=8;attempt++){
  await db.exec('reset role');await db.query("update maintenance_private.account_deletion_requests set available_at=now()-interval '1 second' where id=$1",[id]);await db.exec('set role service_role');const retry=await claim();assert.ok(retry);assert.equal(await defer(retry),true);
 }
 assert.equal(await claim(),null);assert.equal((await db.query('select state,attempts from maintenance_private.account_deletion_requests where id=$1',[id])).rows[0].state,'failed');
 await assert.rejects(()=>request(other));await assert.rejects(()=>request(user,session,other));
 await db.exec('reset role');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[session]);await db.exec('set role service_role');await assert.rejects(()=>request());
 await assert.rejects(()=>db.query('update maintenance_private.account_deletion_requests set app_epoch_id=$1 where id=$2',[other,id]));
 await db.exec('reset role');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');await assert.rejects(()=>request());assert.equal((await db.query('select app_epoch_id from maintenance_private.account_deletion_requests where id=$1',[id])).rows[0].app_epoch_id,epoch);
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>request());await assert.rejects(()=>db.query('select * from maintenance_private.account_deletion_requests'));await assert.rejects(()=>claim());await assert.rejects(()=>current(first));await assert.rejects(()=>defer(first));
 }finally{await db.close();}
});
