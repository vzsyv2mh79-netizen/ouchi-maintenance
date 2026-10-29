import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('members lose closed-owner household access without losing other open homes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/20261010141353_ouchi_billing_identity.sql','utf8'));
 await db.exec(`create table public.homes(id uuid primary key,owner_id uuid);create table public.home_members("homeId" uuid,user_id uuid);
 create table public.products(id uuid primary key,"homeId" uuid);
 create function maintenance_private.maintenance_account_is_open() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and not exists(select 1 from maintenance_private.account_access where user_id=auth.uid() and not enabled) and not exists(select 1 from maintenance_private.app_epochs where user_id=auth.uid() and not enabled)$$;
 grant usage on schema maintenance_private to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/20261011000718_ouchi_closed_household_owner_gate.sql','utf8'));
 await db.exec(`grant execute on function maintenance_private.access_home(uuid),maintenance_private.owns_home(uuid) to authenticated;
 alter table public.products enable row level security;grant all on public.products to authenticated;
 create policy accessible_products on public.products for all to authenticated using(maintenance_private.access_home("homeId")) with check(maintenance_private.access_home("homeId"));`);
 const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',home='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',product='55555555-5555-4555-8555-555555555555';
 await db.query('insert into auth.users values($1),($2)',[owner,member]);await db.query('insert into public.homes values($1,$2),($3,$4)',[home,owner,other,member]);await db.query('insert into public.home_members values($1,$2)',[home,member]);await db.query('insert into public.products values($1,$2)',[product,home]);
 const access=async h=>(await db.query('select maintenance_private.access_home($1) as value',[h])).rows[0].value;
 await db.query("select set_config('test.user',$1,false)",[member]);await db.exec('set role authenticated');assert.equal(await access(home),true);assert.equal(await access(other),true);assert.equal((await db.query('select * from public.products')).rows.length,1);
 await db.exec('reset role');await db.query('insert into maintenance_private.account_access values($1,false)',[owner]);await db.exec('set role authenticated');
 assert.equal(await access(home),false);assert.equal(await access(other),true);assert.equal((await db.query('select * from public.products')).rows.length,0);assert.equal((await db.query('update public.products set id=id returning *')).rows.length,0);await assert.rejects(()=>db.query('insert into public.products values($1,$2)',['66666666-6666-4666-8666-666666666666',home]));
 await db.exec('reset role');assert.equal((await db.query('select * from public.products')).rows.length,1);
 }finally{await db.close();}
});
