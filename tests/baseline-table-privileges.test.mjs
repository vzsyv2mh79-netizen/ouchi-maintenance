import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const directory='supabase/migrations';
const migration=readFileSync(`${directory}/20261015174935_ouchi_baseline_table_privilege_hardening.sql`,'utf8');
const baseline=readdirSync(directory).filter(n=>n.endsWith('.sql')).sort().slice(0,7);
const tables=['homes','products','maintenance_tasks','maintenance_history','home_members','home_invites','maintenance_imports','maintenance_backup_restores','maintenance_push_subscriptions','maintenance_push_test_limits'];
const owner='11111111-1111-4111-8111-111111111111';
const member='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const home='44444444-4444-4444-8444-444444444444';
const foreignHome='55555555-5555-4555-8555-555555555555';
const product='66666666-6666-4666-8666-666666666666';
const task='77777777-7777-4777-8777-777777777777';
async function setup(){
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   grant usage on schema public,auth to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  for(const name of baseline)await db.exec(readFileSync(`${directory}/${name}`,'utf8'));
  await db.exec('create table public.unrelated_app_sentinel(id integer primary key);insert into public.unrelated_app_sentinel values(1);');
  await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,member,other]);
  await db.query('insert into public.homes(id,owner_id) values($1,$2),($3,$4)',[home,owner,foreignHome,other]);
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,member,'サンプル家族']);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','サンプル家電']);
  await db.query(`insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,'フィルター確認','掃除',30,current_date,'ユーザー設定')`,[task,product]);
  return db;
 }catch(error){await db.close();throw error;}
}
async function asUser(db,user){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
}
async function privileges(db){
 return (await db.query(`select c.relname,r.name as role,p.name as privilege,
  has_table_privilege(r.name,c.oid,p.name) as allowed
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join (values('anon'),('authenticated'),('service_role')) r(name)
  cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(name)
  where n.nspname='public' and c.relkind='r' order by c.relname,r.name,p.name`)).rows;
}
const key=x=>`${x.relname}/${x.role}/${x.privilege}`;
test('narrow privilege change blocks table-wide operations while preserving CRUD and other apps',async()=>{
 const db=await setup();try{
  const before=await privileges(db);
  assert.ok(before.some(x=>x.relname==='homes'&&x.role==='authenticated'&&x.privilege==='TRUNCATE'&&x.allowed));
  // Disposable data only: demonstrate that row visibility does not restrict a table-wide operation.
  await asUser(db,owner);
  assert.equal((await db.query('select id from public.homes')).rows.length,1);
  await db.exec('begin;truncate public.homes cascade;reset role');
  assert.equal((await db.query('select count(*)::integer as n from public.homes')).rows[0].n,0);
  await db.exec('rollback;reset role');
  assert.equal((await db.query('select count(*)::integer as n from public.homes')).rows[0].n,2);
  await db.exec(migration);
  const after=await privileges(db);
  for(const row of after){
   const target=tables.includes(row.relname)&&['anon','authenticated'].includes(row.role)&&['TRUNCATE','REFERENCES','TRIGGER'].includes(row.privilege);
   assert.equal(row.allowed,target?false:before.find(x=>key(x)===key(row)).allowed,key(row));
  }
  await asUser(db,owner);
  await assert.rejects(()=>db.exec('truncate public.homes cascade'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::integer as n from public.homes')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::integer as n from public.unrelated_app_sentinel')).rows[0].n,1);
  await db.exec(migration);
  assert.deepEqual(await privileges(db),after);
 }finally{await db.close();}
});
test('family cloud reads, updates, completion history and export snapshot work after hardening',async()=>{
 const db=await setup();try{
  await db.exec(migration);
  await asUser(db,member);
  assert.equal((await db.query('select name from public.products where id=$1',[product])).rows[0].name,'サンプル家電');
  await db.query('update public.products set memo=$1 where id=$2',['家族のお手入れメモ',product]);
  await db.query('select public.complete_maintenance($1)',[task]);
  await db.query('select public.complete_maintenance($1)',[task]);
  assert.equal((await db.query('select count(*)::integer as n from public.maintenance_history')).rows[0].n,1);
  assert.equal((await db.query('select "nextDueAt"="lastCompletedAt"+30 as correct from public.maintenance_tasks where id=$1',[task])).rows[0].correct,true);
  const snapshot=(await db.query('select public.load_household() as data')).rows[0].data;
  assert.ok(snapshot.homes.some(h=>h.id===home));
  assert.ok(!snapshot.homes.some(h=>h.id===foreignHome));
  assert.equal(snapshot.products[0].memo,'家族のお手入れメモ');
  assert.equal(snapshot.history.length,1);
  await asUser(db,other);
  assert.equal((await db.query('select id from public.products where id=$1',[product])).rows.length,0);
  assert.equal((await db.query('update public.products set memo=$1 where id=$2 returning id',['変更不可',product])).rows.length,0);
  await db.exec('reset role');
  assert.equal((await db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'家族のお手入れメモ');
  assert.equal((await db.query('select count(*)::integer as n from public.homes where id=$1',[foreignHome])).rows[0].n,1);
 }finally{await db.close();}
});
