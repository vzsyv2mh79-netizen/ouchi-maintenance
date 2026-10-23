import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {reviewedCleanupFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {owner,recipient,os,rs,re} from './fixtures/home-handoff-identifiers.mjs';
const migration='supabase/migrations/20261016224912_ouchi_legacy_erasure_review_guard.sql';
async function fixture(){const f=await reviewedCleanupFixture();await f.db.exec(readFileSync(migration,'utf8'));await f.db.exec("create table public.unrelated_app_sentinel(value text);insert into public.unrelated_app_sentinel values('Synthetic unrelated app bytes')");return f;}
async function asActor(db,actor,operation){await db.exec('begin;set local role authenticated');try{
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,session_id:actor===owner?os:rs})]);
 const result=await operation();await db.exec('commit');return result;
}catch(error){await db.exec('rollback');throw error;}}
async function snapshot(db){const out={};for(const name of ['auth.users','auth.sessions','public.homes','public.home_members','public.products','public.maintenance_tasks','public.maintenance_history','public.maintenance_push_subscriptions','public.unrelated_app_sentinel','maintenance_private.product_attachments','maintenance_private.app_epochs','maintenance_private.account_access'])out[name]=(await db.query('select to_jsonb(t) data from '+name+' t order by to_jsonb(t)::text')).rows;return out;}
test('current full local schema blocks legacy erase before any writes when reviewed retirement is enabled',async()=>{
 const f=await fixture();try{const before=await snapshot(f.db);
  for(const [reviewEnabled,retirementEnabled] of [[true,false],[false,true],[true,true]]){
   await f.db.query('update maintenance_private.account_closure_review_policy set enabled=$1',[reviewEnabled]);await f.db.query('update maintenance_private.reviewed_retirement_policy set enabled=$1',[retirementEnabled]);
   for(const actor of [owner,recipient])await assert.rejects(asActor(f.db,actor,()=>f.db.query('select public.erase_maintenance_data()')),/Legacy maintenance erasure disabled/);
  }
  await assert.rejects(asActor(f.db,recipient,async()=>{await f.db.query("select set_config('maintenance.reviewed_retirement_enabled','false',true)");await f.db.query('select public.erase_maintenance_data()');}),/Legacy maintenance erasure disabled/);
  assert.deepEqual(await snapshot(f.db),before);
  await f.db.query('update maintenance_private.account_closure_review_policy set enabled=false');
  await f.db.query('delete from maintenance_private.reviewed_retirement_policy where id=1');
  await assert.rejects(asActor(f.db,recipient,()=>f.db.query('select public.erase_maintenance_data()')),/Legacy maintenance erasure disabled/);
 }finally{await f.db.close();}
});
test('policy disabled preserves existing invoker/RLS behavior without deleting shared home, other app or Auth',async()=>{
 const f=await fixture();try{
  await f.db.query('update maintenance_private.reviewed_retirement_policy set enabled=false where id=1');await f.db.query('update maintenance_private.account_closure_review_policy set enabled=false where id=1');const before=await snapshot(f.db);
  await assert.rejects(asActor(f.db,owner,()=>f.db.query('select public.erase_maintenance_data()')),/Family handoff required/);assert.deepEqual(await snapshot(f.db),before);
  await asActor(f.db,recipient,()=>f.db.query('select public.erase_maintenance_data()'));const after=await snapshot(f.db);
  assert.equal(after['public.home_members'].some(row=>row.data.user_id===recipient),false);
  assert.equal(before['public.home_members'].some(row=>row.data.user_id===recipient),true);
  for(const table of Object.keys(before).filter(name=>name!=='public.home_members'&&name!=='public.maintenance_push_subscriptions'))assert.deepEqual(after[table],before[table],table);
 }finally{await f.db.close();}
});
test('private definer gate grants no data/activation rights and public erase remains invoker',async()=>{
 const f=await fixture();try{
  const helper=(await f.db.query("select n.nspname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid='maintenance_private.require_legacy_maintenance_erasure_allowed()'::regprocedure")).rows[0];assert.equal(helper.nspname,'maintenance_private');assert.equal(helper.prosecdef,true);assert.deepEqual(helper.proconfig,['search_path=""']);
  assert.equal((await f.db.query("select prosecdef from pg_proc where oid='public.erase_maintenance_data()'::regprocedure")).rows[0].prosecdef,false);
  for(const role of ['anon','authenticated','service_role']){
   const allowed=(await f.db.query("select has_function_privilege($1,'maintenance_private.require_legacy_maintenance_erasure_allowed()','execute') allowed",[role])).rows[0].allowed;assert.equal(allowed,role==='authenticated');
  }
  await assert.rejects(asActor(f.db,recipient,()=>f.db.query('update maintenance_private.reviewed_retirement_policy set enabled=false')),/permission denied/);
  await assert.rejects(asActor(f.db,recipient,()=>f.db.query('select * from maintenance_private.account_closure_review_policy')),/permission denied/);
  await assert.rejects(asActor(f.db,recipient,()=>f.db.query('delete from auth.users where id=$1',[recipient])),/permission denied/);
  assert.equal((await f.db.query('select epoch_id from maintenance_private.app_epochs where user_id=$1',[recipient])).rows[0].epoch_id,re);
 }finally{await f.db.close();}
});
