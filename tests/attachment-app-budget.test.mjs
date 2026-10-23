import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('tests/fixtures/attachment-app-budget.sql','utf8');
const path=()=>`${randomUUID()}/${randomUUID()}/${randomUUID()}.png`;
const reserve=(db,id= randomUUID(),object=path(),bytes=1,purpose='upload')=>db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4) as id',[id,object,bytes,purpose]);
async function setup(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema maintenance_private;grant usage on schema maintenance_private to service_role;');await db.exec(sql);return db;}
test('disabled or unverified budget cannot reserve or be enabled by a service/client role',async()=>{
 const db=await setup();try{
  await db.exec('set role service_role');await assert.rejects(reserve(db),/budget unavailable/);
  await assert.rejects(db.exec('update maintenance_private.attachment_app_budget_policy set enabled=true,writer_coverage_verified=true,budget_bytes=100'),/permission denied/);
  await db.exec('reset role');await assert.rejects(db.exec('update maintenance_private.attachment_app_budget_policy set enabled=true,budget_bytes=100'),/coverage unavailable/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(reserve(db),/permission denied/);await assert.rejects(db.exec('select * from maintenance_private.attachment_capacity_claims'),/permission denied/);await db.exec('reset role');}
  assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,0);
 }finally{await db.close();}
});
test('all paths share an allocated app budget, copy paths count separately and exact lost-reply replay does not double-charge',async()=>{
 const db=await setup();try{
  await db.exec('update maintenance_private.attachment_app_budget_policy set budget_bytes=10,writer_coverage_verified=true,enabled=true;set role service_role');
  const id=randomUUID(),object=path();await reserve(db,id,object,6);
  await reserve(db,randomUUID(),path(),4,'transfer-copy');
  await reserve(db,id,object,6);
  await assert.rejects(reserve(db),/budget exceeded/);
  await assert.rejects(reserve(db,id,object,5),/scope conflict/);
  await assert.rejects(reserve(db,id,path(),6),/scope conflict/);
  assert.equal((await db.query('select sum(size_bytes)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,10);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);
  await db.exec('reset role');await assert.rejects(db.exec('update maintenance_private.attachment_app_budget_policy set budget_bytes=9'),/Held capacity/);
  await assert.rejects(db.exec('delete from maintenance_private.attachment_capacity_claims'),/immutable/);
  await db.exec('update maintenance_private.attachment_app_budget_policy set enabled=false;set role service_role');
  await assert.rejects(reserve(db,id,object,6),/budget unavailable/);
  assert.equal((await db.query('select sum(size_bytes)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,10);
 }finally{await db.close();}
});
test('aborted transactions free no committed claim, uncertain old claims stay charged and malformed/direct writes cannot bypass limits',async()=>{
 const db=await setup();try{
  await db.exec('update maintenance_private.attachment_app_budget_policy set budget_bytes=10,writer_coverage_verified=true,enabled=true;set role service_role');
  const old=randomUUID(),oldPath=path();await reserve(db,old,oldPath,6);
  await db.exec('begin');await reserve(db,randomUUID(),path(),4);await db.exec('rollback');
  await reserve(db,randomUUID(),path(),4);
  await assert.rejects(db.query('insert into maintenance_private.attachment_capacity_claims(claim_id,object_path,size_bytes,purpose) values($1,$2,1,$3)',[randomUUID(),path(),'upload']),/budget exceeded/);
  await assert.rejects(db.query('update maintenance_private.attachment_capacity_claims set size_bytes=1 where claim_id=$1',[old]),/permission denied/);
  await db.exec('reset role;update maintenance_private.attachment_app_budget_policy set budget_bytes=100;set role service_role');
  for(const [bytes,object,purpose] of [[0,path(),'upload'],[1,'wrong-prefix','upload'],[1,`00000000-0000-0000-0000-000000000000/${randomUUID()}/${randomUUID()}.png`,'upload'],[1,path(),'flag']])await assert.rejects(reserve(db,randomUUID(),object,bytes,purpose));
  await reserve(db,old,oldPath,6);
  assert.equal((await db.query('select sum(size_bytes)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,10);
 }finally{await db.close();}
});
