import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {createReviewedFileFinalization} from '../lib/reviewed-file-cleanup.mjs';
import {owner,os,oe,recipient,rs,re,other,product} from './fixtures/home-handoff-identifiers.mjs';
async function fixture({finalize=true}={}){
 const f=await reviewedCleanupReadyFixture({asOwner:true});
 try{
  for(const file of ['20261017031407_ouchi_private_operator_inspection.sql','20261017060229_ouchi_ordinary_deletion_capacity_minimization.sql','20261017064517_ouchi_household_attachment_removal.sql'])await f.db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  await f.db.exec('create schema if not exists storage;create table if not exists storage.objects(bucket_id text,name text)');
  if(finalize){await f.cleanupPort.cleanup(f.cleanupInput,f.signal);await createReviewedFileFinalization({connect:f.cleanupConnect}).finalize(f.cleanupInput,f.signal);}
  const d=f.manifest.destination,args=[owner,os,oe,d.id],complete=[...args,d.homeInstanceID,d.objectPath];
  const rpc=async(name,values=args)=>{await f.db.exec('set role service_role');try{return (await f.db.query('select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') value',values)).rows[0].value;}finally{await f.db.exec('reset role');}};
  const count=async table=>(await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,held=async()=>(await f.db.query('select maintenance_private.held_attachment_capacity_bytes() value')).rows[0].value;
  return {...f,d,args,complete,rpc,count,held};
 }catch(error){await f.db.close();throw error;}
}
test('current member fences established copy, retries one receipt, preserves held bytes, and unblocks parent deletion',async()=>{
 const f=await fixture();try{
  const held=await f.held(),first=await f.rpc('begin_maintenance_household_attachment_removal');assert.equal(first.phase,'pending');assert.equal(first.objectPath,f.d.objectPath);const time=(await f.db.query('select removal_requested_at from maintenance_private.household_attachments where id=$1',[f.d.id])).rows[0].removal_requested_at;
  assert.deepEqual(await f.rpc('begin_maintenance_household_attachment_removal'),first);assert.deepEqual((await f.db.query('select removal_requested_at from maintenance_private.household_attachments where id=$1',[f.d.id])).rows[0].removal_requested_at,time);
  assert.equal(await f.rpc('read_maintenance_household_attachment'),null);const pending=await f.rpc('page_maintenance_household_attachment_removals',[owner,os,oe,product,null]);assert.equal(pending.items[0].id,f.d.id);
  await f.db.query("insert into storage.objects values('ouchi-product-attachments',$1)",[f.d.objectPath]);assert.equal(await f.rpc('complete_maintenance_household_attachment_removal',f.complete),false);await f.db.exec('delete from storage.objects');
  assert.equal(await f.rpc('complete_maintenance_household_attachment_removal',f.complete),true);assert.equal(await f.held(),held);assert.equal(await f.count('household_attachments'),0);assert.equal(await f.count('household_attachment_origins'),0);assert.equal(await f.count('household_removal_capacity_moves'),0);
  const receipt=(await f.db.query('select * from maintenance_private.household_file_removal_receipts')).rows[0];assert.deepEqual(Object.keys(receipt).sort(),['attachment_id','completed_at','home_id','home_instance_id','mime','product_id']);assert.equal(await f.rpc('complete_maintenance_household_attachment_removal',f.complete),true);assert.deepEqual((await f.db.query('select * from maintenance_private.household_file_removal_receipts')).rows[0],receipt);assert.equal((await f.rpc('begin_maintenance_household_attachment_removal')).phase,'removed');
  await f.db.query('delete from public.products where id=$1',[product]);assert.equal(await f.count('household_file_removal_receipts'),0);assert.equal(await f.held(),held);assert.equal(await f.rpc('begin_maintenance_household_attachment_removal'),null);
 }finally{await f.db.close();}
});
test('retired actor, nonmember, stale epoch/home and in-flight retained-copy dependency cannot delete a family file',async()=>{
 const f=await fixture();try{
  const outsiderSession=randomUUID(),outsiderEpoch=randomUUID();await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[outsiderSession,other]);await f.db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[other,outsiderEpoch]);await f.db.query('insert into maintenance_private.account_access values($1,true)',[other]);await f.db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[outsiderSession,other,outsiderEpoch]);
  for(const args of [[recipient,rs,re,f.d.id],[other,outsiderSession,outsiderEpoch,f.d.id],[owner,os,randomUUID(),f.d.id]])assert.equal(await f.rpc('begin_maintenance_household_attachment_removal',args),null);
  await f.rpc('begin_maintenance_household_attachment_removal');assert.equal(await f.rpc('complete_maintenance_household_attachment_removal',[...f.args,randomUUID(),f.d.objectPath]),false);assert.equal(await f.rpc('complete_maintenance_household_attachment_removal',[...f.args,f.d.homeInstanceID,'households/foreign/path.pdf']),false);assert.equal(await f.count('household_file_removal_receipts'),0);
 }finally{await f.db.close();}
 const pending=await fixture({finalize:false});try{assert.equal(await pending.rpc('begin_maintenance_household_attachment_removal'),null);assert.equal((await pending.db.query('select removal_pending from maintenance_private.household_attachments where id=$1',[pending.d.id])).rows[0].removal_pending,false);}finally{await pending.db.close();}
});
test('late SQL failure rolls back capacity/metadata/receipt and a remaining family member can retry',async()=>{
 const f=await fixture();try{
  await f.rpc('begin_maintenance_household_attachment_removal');const held=await f.held(),claims=await f.count('attachment_capacity_claims');
  await f.db.exec("create function maintenance_private.fail_household_removal_fixture() returns trigger language plpgsql as $$begin raise exception 'Synthetic household erase failure';end;$$;create trigger zz_fail_household_removal_fixture before delete on maintenance_private.household_attachments for each row execute function maintenance_private.fail_household_removal_fixture()");
  await assert.rejects(f.rpc('complete_maintenance_household_attachment_removal',f.complete),/Synthetic household erase failure/);assert.equal(await f.held(),held);assert.equal(await f.count('attachment_capacity_claims'),claims);assert.equal(await f.count('household_file_removal_receipts'),0);assert.equal(await f.count('household_removal_capacity_moves'),0);assert.equal(await f.count('retired_attachment_ids'),1);
  await f.db.exec('drop trigger zz_fail_household_removal_fixture on maintenance_private.household_attachments');assert.equal(await f.rpc('complete_maintenance_household_attachment_removal',f.complete),true);assert.equal(await f.held(),held);
 }finally{await f.db.close();}
});
test('browser/private roles cannot fabricate household receipts or capacity moves, or bypass the service-only entry',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator','ouchi_retirement_file_executor','ouchi_closure_inspector']){
   await f.db.exec('set role '+role);for(const table of ['household_file_removal_receipts','household_removal_capacity_moves'])await assert.rejects(f.db.exec('select * from maintenance_private.'+table),/permission denied/);await assert.rejects(f.db.exec("select maintenance_private.household_removal_move_is_current(null,'11111111-1111-4111-8111-111111111111',1)"),/permission denied/);if(role!=='service_role')await assert.rejects(f.db.query('select public.begin_maintenance_household_attachment_removal($1,$2,$3,$4)',f.args),/permission denied/);await f.db.exec('reset role');
  }
  await assert.rejects(f.db.exec('update maintenance_private.attachment_capacity_claims set size_bytes=size_bytes'),/immutable/);await assert.rejects(f.db.exec('delete from maintenance_private.attachment_capacity_quarantine'),/remains held/);
 }finally{await f.db.close();}
});
