import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {maintenanceMigrationCatalog,maintenanceMigrationPlan} from '../scripts/maintenance-migration-plan.mjs';
const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const home='44444444-4444-4444-8444-444444444444',foreignHome='55555555-5555-4555-8555-555555555555',product='66666666-6666-4666-8666-666666666666',foreignProduct='77777777-7777-4777-8777-777777777777',task='88888888-8888-4888-8888-888888888888',session='99999999-9999-4999-8999-999999999999';
test('pending additive migrations preserve pre-existing free family records, other-app rows, access and enrollment opt-in',{timeout:30000},async()=>{
 const history=JSON.parse(readFileSync('tests/fixtures/migration-history/recorded-ouchi-baseline.json','utf8'));
 const plan=maintenanceMigrationPlan(history),db=new PGlite();
 try{
  await db.exec('create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now(),user_agent text);create table auth.refresh_tokens(user_id uuid references auth.users(id),token text);');
  await db.exec(readFileSync('tests/fixtures/auth/rest-bootstrap.sql','utf8'));
  const recorded=new Set(plan.recorded.map(row=>row.file));
  for(const file of maintenanceMigrationCatalog())if(recorded.has(file.file))await db.exec(readFileSync(file.file,'utf8'));
  await db.query('insert into auth.users values($1),($2),($3)',[owner,member,other]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
  await db.query("insert into auth.refresh_tokens values($1,'synthetic-refresh-token')",[owner]);
  await db.query("insert into public.homes(id,owner_id,name) values($1,$2,'Synthetic pre-upgrade home'),($3,$4,'Synthetic foreign home')",[home,owner,foreignHome,other]);
  await db.query("insert into public.home_members(\"homeId\",user_id,nickname) values($1,$2,'Synthetic member')",[home,member]);
  await db.query("insert into public.products(id,\"homeId\",\"categoryId\",name) values($1,$2,'air','Synthetic existing product'),($3,$4,'air','Synthetic foreign product')",[product,home,foreignProduct,foreignHome]);
  await db.query("insert into public.maintenance_tasks(id,\"productId\",name,kind,\"intervalDays\",\"nextDueAt\",\"sourceKind\") values($1,$2,'Synthetic existing care','掃除',30,current_date,'ユーザー設定')",[task,product]);
  await db.query('insert into public.maintenance_history("taskId","productId","completedAt") values($1,$2,current_date)',[task,product]);
  await db.exec(`create schema other_app_fixture;create table other_app_fixture.records(id uuid primary key,user_id uuid not null,payload text not null);alter table other_app_fixture.records enable row level security;
   grant usage on schema other_app_fixture to authenticated;grant select on other_app_fixture.records to authenticated;
   create policy own_record on other_app_fixture.records for select to authenticated using(user_id=auth.uid());`);
  await db.query("insert into other_app_fixture.records values($1,$2,'Synthetic other-app data')",[foreignProduct,other]);
  const snapshot=async()=>{
   const result={};
   for(const table of ['public.homes','public.home_members','public.products','public.maintenance_tasks','public.maintenance_history','auth.users','auth.sessions','auth.refresh_tokens','other_app_fixture.records'])result[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as value from ${table} t`)).rows[0].value;
   return result;
  };
  const before=await snapshot();
  for(const file of plan.pending)await db.exec(readFileSync(file,'utf8'));
  assert.deepEqual(await snapshot(),before,'DDL must not rewrite or erase pre-existing rows');
  for(const table of ['account_access','app_epochs','app_session_epochs','account_deletion_requests','verified_transactions'])assert.equal((await db.query(`select count(*)::int n from maintenance_private.${table}`)).rows[0].n,0,'no enrollment, deletion job or rights implicitly created');
  assert.equal((await db.query('select require_explicit from maintenance_private.enrollment_policy where id=1')).rows[0].require_explicit,false);
  assert.equal((await db.query('select enabled from maintenance_private.home_handoff_policy where id=1')).rows[0].enabled,false);
  assert.equal((await db.query('select enabled from maintenance_private.account_closure_review_policy where id=1')).rows[0].enabled,false);
  for(const table of ['account_closure_reviews','closure_reauth_markers'])assert.equal((await db.query(`select count(*)::int n from maintenance_private.${table}`)).rows[0].n,0);
  for(const role of ['ouchi_closure_review_executor','ouchi_closure_reauth_worker'])assert.equal((await db.query('select rolcanlogin from pg_roles where rolname=$1',[role])).rows[0].rolcanlogin,false);
  // The shared Auth trigger must leave ordinary sessions usable while refusing
  // a marked session with no registered scope, even while intake is disabled.
  const freshSession='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[freshSession,owner,'Synthetic ordinary client']);
  await db.query('delete from auth.sessions where id=$1',[freshSession]);
  await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[freshSession,owner,'OuchiMaintenance/closure-reauth/v1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']),/Reauthentication agent closed/);
  assert.deepEqual(await snapshot(),before,'ordinary/marked session witnesses must preserve the pre-upgrade snapshot');
  const asActor=async(user,work)=>{
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})]);await db.exec('set role authenticated');
   try{return await work();}finally{await db.exec('reset role');}
  };
  for(const actor of [owner,member])await asActor(actor,async()=>{
   assert.deepEqual((await db.query('select id from public.products order by id')).rows,[{id:product}]);
   assert.equal((await db.query('select id from public.maintenance_tasks')).rows.length,1);
   assert.equal((await db.query('select id from public.maintenance_history')).rows.length,1);
   assert.deepEqual((await db.query('select * from other_app_fixture.records')).rows,[]);
  });
  await asActor(member,async()=>assert.equal((await db.query("update public.products set memo='Synthetic member edit after upgrade' where id=$1 returning id",[product])).rows.length,1));
  await asActor(other,async()=>{
   assert.deepEqual((await db.query('select id from public.products order by id')).rows,[{id:foreignProduct}]);
   assert.deepEqual((await db.query('select payload from other_app_fixture.records')).rows,[{payload:'Synthetic other-app data'}]);
  });
  assert.equal((await db.query('select count(*)::int n from maintenance_private.app_epochs')).rows[0].n,0);
 }finally{await db.close();}
});
