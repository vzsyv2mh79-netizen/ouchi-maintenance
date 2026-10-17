import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('dispatch rejects closed account, changed or expired claim and deleted subscription',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
 await db.exec(readFileSync('supabase/migrations/20261010141353_ouchi_billing_identity.sql','utf8'));
 await db.exec('create table public.maintenance_push_subscriptions(id uuid primary key,user_id uuid,claim_token uuid,claimed_until timestamptz,endpoint text);grant select on public.maintenance_push_subscriptions to service_role;');
 await db.exec(readFileSync('supabase/migrations/20261011001818_ouchi_closed_account_push_dispatch.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261011002147_ouchi_closed_account_push_test_dispatch.sql','utf8'));
 const user='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[user]);await db.query("insert into public.maintenance_push_subscriptions values($1,$2,$3,now()+interval '1 minute','synthetic-endpoint')",[device,user,lease]);
 const allowed=async token=>(await db.query('select public.can_dispatch_maintenance_push($1,$2) as value',[device,token])).rows[0].value;
 const testAllowed=async endpoint=>(await db.query('select public.can_dispatch_maintenance_push_test($1,$2) as value',[user,endpoint])).rows[0].value;
 await db.exec('set role service_role');assert.equal(await testAllowed('synthetic-endpoint'),true);assert.equal(await testAllowed('other-endpoint'),false);assert.equal(await allowed(lease),true);assert.equal(await allowed(user),false);
 await db.exec('reset role');await db.query('insert into maintenance_private.account_access values($1,false)',[user]);await db.exec('set role service_role');assert.equal(await allowed(lease),false);assert.equal(await testAllowed('synthetic-endpoint'),false);
 await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[user]);await db.query("update public.maintenance_push_subscriptions set claimed_until=now()-interval '1 second'");await db.exec('set role service_role');assert.equal(await allowed(lease),false);
 await db.exec('reset role;delete from public.maintenance_push_subscriptions;set role service_role');assert.equal(await allowed(lease),false);await db.exec('reset role;set role authenticated');await assert.rejects(()=>allowed(lease));await assert.rejects(()=>testAllowed('synthetic-endpoint'));
 }finally{await db.close();}
});
