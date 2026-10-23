import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,os,rs,oe,re} from './fixtures/home-handoff-identifiers.mjs';
const submission='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016120051_ouchi_shared_member_closure_review.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');return db;
}
const review=(db,user=recipient,session=rs,epoch=re,verb='request')=>db.query(`select public.${verb}_maintenance_closure_review($1,$2,$3,$4) receipt`,[user,session,epoch,submission]);
const remove=(db,user=recipient,session=rs,epoch=re)=>db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[user,session,epoch]);
const family=async db=>(await db.query("select jsonb_build_object('homes',(select jsonb_agg(to_jsonb(t)) from public.homes t),'members',(select jsonb_agg(to_jsonb(t)) from public.home_members t),'products',(select jsonb_agg(to_jsonb(t)) from public.products t),'tasks',(select jsonb_agg(to_jsonb(t)) from public.maintenance_tasks t),'history',(select jsonb_agg(to_jsonb(t)) from public.maintenance_history t),'access',(select jsonb_agg(to_jsonb(t)) from maintenance_private.account_access t)) value")).rows[0].value;
test('a joined family member can request, recover and cancel review without owning a home or changing family data',async()=>{
 const db=await fixture();try{
  await db.exec('reset role');const before=await family(db);await db.exec('set role service_role');
  const first=(await review(db)).rows[0].receipt;assert.equal(first.state,'review_required');assert.equal(first.epochID,re);
  assert.deepEqual((await review(db)).rows[0].receipt,first);assert.deepEqual((await review(db,recipient,rs,re,'read')).rows[0].receipt,first);
  const cancelled=(await review(db,recipient,rs,re,'cancel')).rows[0].receipt;assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.reviewRequestID,first.reviewRequestID);
  await db.exec('reset role');assert.deepEqual(await family(db),before);assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
test('shared members cannot bypass review through direct deletion, including before intake and after cancellation',async()=>{
 const db=await fixture();try{
  for(const phase of ['before','pending','cancelled']){
   if(phase==='pending')await review(db);
   if(phase==='cancelled')await review(db,recipient,rs,re,'cancel');
   await assert.rejects(remove(db),/Family review required/);
  }
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
test('existing owner handoff refusal remains distinct, while an accepted operator review blocks direct deletion',async()=>{
 const db=await fixture();try{
  await assert.rejects(remove(db,owner,os,oe),/Family handoff required/);
  const first=(await review(db,owner,os,oe)).rows[0].receipt;assert.equal(first.state,'review_required');
  await assert.rejects(remove(db,owner,os,oe),/Family review required/);
  assert.deepEqual((await review(db,owner,os,oe,'read')).rows[0].receipt,first);
 }finally{await db.close();}
});
test('member review still requires the exact live account session and epoch; browser roles cannot call intake',async()=>{
 const db=await fixture();try{
  for(const scope of [[recipient,os,re],[recipient,rs,oe],[owner,rs,oe]])await assert.rejects(review(db,...scope),/Current app session required/);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=clock_timestamp()-interval \'1 second\' where id=$1',[rs]);await db.exec('set role service_role');
  await assert.rejects(review(db),/Current app session required/);
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(review(db),/permission denied/);await assert.rejects(remove(db),/permission denied/);}
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews')).rows[0].n,0);
 }finally{await db.close();}
});
