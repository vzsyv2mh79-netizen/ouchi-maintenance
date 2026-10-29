import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const owner='11111111-1111-4111-8111-111111111111';
const member='22222222-2222-4222-8222-222222222222';
const home='33333333-3333-4333-8333-333333333333';
const product='44444444-4444-4444-8444-444444444444';
const sql=readFileSync('tests/fixtures/content-contribution-prototype.sql','utf8');
async function asUser(db,id){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
 if(id)await db.exec('set role authenticated');
}
async function setup(legacy=false){
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   grant usage on schema public,auth to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort().slice(0,7))
   await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner,member]);
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner]);
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,member,'サンプル家族']);
  if(legacy)await db.query('insert into public.products(id,"homeId","categoryId",name,memo) values($1,$2,$3,$4,$5)',[product,home,'air','既存の家電','作者不明のメモ']);
  await db.exec(sql);
  return db;
 }catch(e){await db.close();throw e;}
}
async function contributors(db,field){
 await asUser(db,null);
 return (await db.query('select user_id from maintenance_private.content_contributors where relation_name=$1 and record_id=$2 and field_name=$3 order by user_id',['products',product,field])).rows.map(r=>r.user_id);
}
async function state(db,field){
 await asUser(db,null);
 return (await db.query('select unknown_contributor from maintenance_private.content_fields where relation_name=$1 and record_id=$2 and field_name=$3',['products',product,field])).rows;
}

test('legacy authorship stays unknown after family edits, without assigning the current owner',async()=>{
 const db=await setup(true);try{
  assert.deepEqual(await contributors(db,'memo'),[]);
  assert.deepEqual(await state(db,'memo'),[{unknown_contributor:true}]);
  await asUser(db,member);
  await db.query('update public.products set memo=$1 where id=$2',['家族が追記したメモ',product]);
  assert.deepEqual(await contributors(db,'memo'),[member]);
  assert.deepEqual(await state(db,'memo'),[{unknown_contributor:true}]);
  assert.deepEqual(await contributors(db,'name'),[]);
  assert.deepEqual(await state(db,'name'),[{unknown_contributor:true}]);
  await asUser(db,member);
  const snapshot=(await db.query('select public.load_household() as value')).rows[0].value;
  assert.equal(JSON.stringify(snapshot).includes('unknown_contributor'),false);
  assert.equal(JSON.stringify(snapshot).includes('content_contributors'),false);
 }finally{await db.close();}
});

test('new field contributors are conservative, private, deduplicated and transactional',async()=>{
 const db=await setup();try{
  await asUser(db,owner);
  await db.query('insert into public.products(id,"homeId","categoryId",name,memo) values($1,$2,$3,$4,$5)',[product,home,'air','新しい家電','所有者のメモ']);
  await asUser(db,member);
  await db.query('update public.products set memo=$1 where id=$2',['共同で編集したメモ',product]);
  await db.query('update public.products set memo=memo where id=$1',[product]);
  assert.deepEqual(await contributors(db,'memo'),[owner,member]);
  assert.deepEqual(await contributors(db,'name'),[owner]);
  assert.deepEqual(await state(db,'memo'),[{unknown_contributor:false}]);
  await asUser(db,member);
  await assert.rejects(()=>db.query('select * from maintenance_private.content_contributors'),/permission denied/);
  await db.exec('begin');
  await db.query('update public.products set memo=null where id=$1',[product]);
  await db.exec('rollback');
  assert.deepEqual(await contributors(db,'memo'),[owner,member]);
  await db.exec('set role service_role');
  await assert.rejects(()=>db.query('delete from maintenance_private.content_fields'),/permission denied/);
  await asUser(db,null);
  await assert.rejects(()=>db.query('delete from auth.users where id=$1',[member]),/foreign key constraint/);
 }finally{await db.close();}
});

test('cleared live values release only their own contributor metadata; unknown service writes stay unknown',async()=>{
 const db=await setup();try{
  await asUser(db,owner);
  await db.query('insert into public.products(id,"homeId","categoryId",name,memo) values($1,$2,$3,$4,$5)',[product,home,'air','残す家電','最初のメモ']);
  await asUser(db,member);
  await db.query('update public.products set memo=$1 where id=$2',['家族のメモ',product]);
  await db.query('update public.products set memo=null where id=$1',[product]);
  assert.deepEqual(await contributors(db,'memo'),[]);
  assert.deepEqual(await state(db,'memo'),[]);
  assert.deepEqual(await contributors(db,'name'),[owner]);
  await asUser(db,null);
  await db.query('update public.products set memo=$1 where id=$2',['本人が確認できない書き込み',product]);
  assert.deepEqual(await state(db,'memo'),[{unknown_contributor:true}]);
  assert.deepEqual(await contributors(db,'memo'),[]);
  await db.query('delete from auth.users where id=$1',[member]);
  assert.equal((await db.query('select name from public.products where id=$1',[product])).rows[0].name,'残す家電');
  await db.query('delete from public.products where id=$1',[product]);
  assert.equal((await db.query('select count(*)::integer n from maintenance_private.content_fields where relation_name=$1 and record_id=$2',['products',product])).rows[0].n,0);
 }finally{await db.close();}
});

test('the existing completion RPC records the acting family member without changing retries or next due dates',async()=>{
 const db=await setup();const task='55555555-5555-4555-8555-555555555555';try{
  await asUser(db,owner);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','共有の家電']);
  await db.query(`insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,'確認','点検',30,current_date,'ユーザー設定')`,[task,product]);
  await asUser(db,member);
  await db.query('select public.complete_maintenance($1)',[task]);
  await db.query('select public.complete_maintenance($1)',[task]);
  const history=(await db.query('select id from public.maintenance_history')).rows;
  assert.equal(history.length,1);
  assert.equal((await db.query('select "nextDueAt"="lastCompletedAt"+30 correct from public.maintenance_tasks where id=$1',[task])).rows[0].correct,true);
  await asUser(db,null);
  const actors=(await db.query(`select user_id from maintenance_private.content_contributors where relation_name='maintenance_history' and record_id=$1 and field_name='completedAt'`,[history[0].id])).rows;
  assert.deepEqual(actors,[{user_id:member}]);
  await asUser(db,member);
  await db.query('delete from public.maintenance_history where id=$1',[history[0].id]);
  await asUser(db,null);
  assert.equal((await db.query(`select count(*)::integer n from maintenance_private.content_fields where relation_name='maintenance_history' and record_id=$1`,[history[0].id])).rows[0].n,0);
 }finally{await db.close();}
});
