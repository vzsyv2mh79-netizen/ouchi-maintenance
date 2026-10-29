import {readFileSync} from 'node:fs';

export const owner='11111111-1111-4111-8111-111111111111',recipient='22222222-2222-4222-8222-222222222222';
export const other='33333333-3333-4333-8333-333333333333',home='44444444-4444-4444-8444-444444444444';
export const product='55555555-5555-4555-8555-555555555555',request='66666666-6666-4666-8666-666666666666';
export const os='77777777-7777-4777-8777-777777777777',rs='88888888-8888-4888-8888-888888888888';
export const oe='99999999-9999-4999-8999-999999999999',re='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

export async function seedHomeHandoffFixture(db){
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
 create table public.homes(id uuid primary key,owner_id uuid references auth.users(id));
 create table public.home_members("homeId" uuid references public.homes(id) on delete cascade,user_id uuid references auth.users(id),nickname text,primary key("homeId",user_id));
 create table public.products(id uuid primary key,"homeId" uuid references public.homes(id) on delete cascade);
 create table public.maintenance_tasks(id uuid primary key,"productId" uuid references public.products(id) on delete cascade);
 create table public.maintenance_history(id uuid primary key,"taskId" uuid references public.maintenance_tasks(id) on delete cascade);`);
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261011122749_ouchi_explicit_enrollment_guard.sql','20261011123511_ouchi_explicit_enrollment_consent.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(`create table maintenance_private.product_attachments(id uuid primary key,product_id uuid references public.products(id),state text);
 grant select on public.products,maintenance_private.product_attachments to service_role;`);
 await db.exec(readFileSync('supabase/migrations/20261013043000_ouchi_family_handoff.sql','utf8'));
 await db.query('insert into auth.users values($1),($2),($3)',[owner,recipient,other]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[os,owner,rs,recipient]);
 await db.query('insert into maintenance_private.app_epochs values($1,$2,true),($3,$4,true)',[owner,oe,recipient,re]);
 await db.query('insert into maintenance_private.account_access values($1,true),($2,true)',[owner,recipient]);
 await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3),($4,$5,$6)',[os,owner,oe,rs,recipient,re]);
 await db.exec('update maintenance_private.enrollment_policy set require_explicit=true');
 await db.query('insert into public.homes values($1,$2)',[home,owner]);
 await db.query('insert into public.home_members values($1,$2,$3)',[home,recipient,'family']);
 await db.query('insert into public.products values($1,$2)',[product,home]);
 await db.query('insert into public.maintenance_tasks values($1,$2)',[request,product]);
 await db.query('insert into public.maintenance_history values($1,$2)',[re,request]);
 await db.exec('set role service_role');
 return db;
}
