import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Repository-root invocation. In-memory DB only, no Supabase connection.
test('access gate denies old identity without deleting shared credentials',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const file of ['20261001144732_household_storage.sql','20261001232931_atomic_import.sql','20261001233450_household_sharing.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(readFileSync('ios/Tests/Fixtures/account-access-prototype.sql','utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into maintenance_private.account_access values($1,true),($2,true)',[a,b]);
 await db.exec('create table public.other_app_records(user_id uuid references auth.users(id) on delete restrict,value text)');await db.query('insert into public.other_app_records values($1,$2)',[a,'preserved']);
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await user(a);const home=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];await assert.rejects(()=>db.query('update maintenance_private.account_access set enabled=true'));
 await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[a]);await user(a);
 assert.equal((await db.query('select * from public.homes')).rows.length,0);await assert.rejects(()=>db.query('select public.load_household()'));await assert.rejects(()=>db.query('select public.create_maintenance_home($1,$2)',['blocked','home']));assert.equal((await db.query('update public.homes set name=$1 where id=$2 returning id',['blocked',home.id])).rows.length,0);
 await user(b);assert.equal((await db.query('select public.load_household() as data')).rows[0].data.homes.length,1);await db.exec('reset role');assert.equal((await db.query('select * from public.other_app_records')).rows[0].value,'preserved');assert.equal((await db.query('select * from auth.users')).rows.length,2);
 }finally{await db.close();}
});
