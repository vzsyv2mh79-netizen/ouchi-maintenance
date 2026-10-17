import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('closed account restrictive policies deny ordinary CRUD and privileged invitation membership writes',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await db.exec(readFileSync('supabase/migrations/20261010141353_ouchi_billing_identity.sql','utf8'));
 const tables=['homes','products','maintenance_tasks','maintenance_history','home_members','home_invites','maintenance_push_subscriptions','maintenance_imports','maintenance_backup_restores'];
 for(const name of tables)await db.exec(`create table public.${name}(id integer);alter table public.${name} enable row level security;grant all on public.${name} to authenticated;create policy existing_access on public.${name} for all to authenticated using(true) with check(true);insert into public.${name} values(1);`);
 await db.exec(readFileSync('supabase/migrations/20261010234625_ouchi_closed_account_access_gate.sql','utf8'));await db.exec('grant usage on schema maintenance_private to authenticated');
 const user='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users values($1)',[user]);await db.query("select set_config('test.user',$1,false)",[user]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from public.homes')).rows.length,1);
 await db.exec('reset role');await db.query('insert into maintenance_private.account_access values($1,false)',[user]);await db.exec('set role authenticated');
 for(const name of tables){assert.equal((await db.query(`select * from public.${name}`)).rows.length,0);await assert.rejects(()=>db.query(`insert into public.${name} values(2)`));assert.equal((await db.query(`update public.${name} set id=3 returning *`)).rows.length,0);assert.equal((await db.query(`delete from public.${name} returning *`)).rows.length,0);}
 await db.exec('reset role');await assert.rejects(()=>db.query('insert into public.home_members values(2)'));await db.query("select set_config('test.user','',false)");await db.query('insert into public.home_members values(2)');assert.equal((await db.query('select * from public.homes')).rows.length,1);
 }finally{await db.close();}
});
