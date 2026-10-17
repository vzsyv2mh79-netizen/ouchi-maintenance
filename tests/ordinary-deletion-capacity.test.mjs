import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {other} from './fixtures/home-handoff-identifiers.mjs';
const migration='20261017060229_ouchi_ordinary_deletion_capacity_minimization.sql';
async function fixture(){
 const f=await reviewedCleanupReadyFixture();
 try{
  await f.db.exec(readFileSync('supabase/migrations/20261017031407_ouchi_private_operator_inspection.sql','utf8'));await f.db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
  const epoch=randomUUID(),session=randomUUID(),home=randomUUID(),product=randomUUID(),file=randomUUID(),bytes=31,sha=createHash('sha256').update('synthetic').digest('hex'),path=`${other}/${epoch}/${file}.pdf`;
  await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,other]);await f.db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[other,epoch]);await f.db.query('insert into maintenance_private.account_access values($1,true)',[other]);await f.db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[session,other,epoch]);
  await f.db.query('insert into public.homes(id,owner_id) values($1,$2)',[home,other]);await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Synthetic ordinary item']);
  await f.db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[file,other,epoch,product,bytes,sha]);await f.db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[file,randomUUID(),other,epoch]);await f.db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),path,bytes,'upload']);
  await f.db.exec('set role service_role');const request=(await f.db.query('select public.request_maintenance_account_deletion($1,$2,$3) id',[other,session,epoch])).rows[0].id,lease=(await f.db.query('select public.claim_maintenance_account_deletion() value')).rows[0].value;assert.equal(lease.requestID,request);await f.db.exec('reset role');const args=[request,other,epoch,lease.leaseToken];
  const rpc=async(name,values=args)=>{await f.db.exec('set role service_role');try{return (await f.db.query('select public.'+name+'($1,$2,$3,$4) value',values)).rows[0].value;}finally{await f.db.exec('reset role');}};
  assert.equal(await rpc('capture_maintenance_deletion_objects'),true);
  // Only a synthetic SQL witness here. Actual API absence is independently
  // exercised with GoTrue/PostgREST/filesystem-backed Storage in the full profile.
  const acknowledgeAbsence=()=>f.db.query('update maintenance_private.account_deletion_objects set absence_confirmed=true where request_id=$1',[request]);
  const prepare=async()=>{await acknowledgeAbsence();assert.equal(await rpc('erase_maintenance_deletion_records'),true);};
  const held=async()=>(await f.db.query('select maintenance_private.held_attachment_capacity_bytes() value')).rows[0].value;
  const count=async table=>(await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n;
  return {...f,args,rpc,prepare,acknowledgeAbsence,held,count,epoch,path,file,request,bytes};
 }catch(error){await f.db.close();throw error;}
}
test('ordinary deletion moves held bytes without account linkage, preserves foreign claims, and is repeatable',async()=>{
 const f=await fixture();try{
  await f.prepare();const held=await f.held(),claims=await f.count('attachment_capacity_claims');
  assert.equal(await f.rpc('minimize_maintenance_deletion_object_inventory'),true);assert.equal(await f.held(),held);assert.equal(await f.count('attachment_capacity_claims'),claims-1);assert.equal(await f.count('deletion_capacity_moves'),0);
  const quarantine=(await f.db.query('select * from maintenance_private.attachment_capacity_quarantine')).rows;assert.equal(quarantine.length,1);assert.deepEqual(Object.keys(quarantine[0]).sort(),['hold_id','size_bytes']);assert.equal(Number(quarantine[0].size_bytes),f.bytes);assert.notEqual(quarantine[0].hold_id,f.file);
  assert.equal(await f.rpc('minimize_maintenance_deletion_object_inventory'),true);assert.equal(await f.count('attachment_capacity_quarantine'),1);assert.equal(await f.held(),held);
  await assert.rejects(f.db.query('insert into maintenance_private.product_attachments(id) values($1)',[f.file]),/cannot be reused/);await assert.rejects(f.db.exec('delete from maintenance_private.attachment_capacity_quarantine'),/remains held/);
 }finally{await f.db.close();}
});
test('wrong scope, missing absence and live source metadata cannot authorize capacity minimization',async()=>{
 const f=await fixture();try{
  const held=await f.held();for(const index of [0,1,2,3]){const args=[...f.args];args[index]=randomUUID();assert.equal(await f.rpc('minimize_maintenance_deletion_object_inventory',args),false);}
  assert.equal(await f.rpc('minimize_maintenance_deletion_object_inventory'),false);
  // Isolate the absence check even with an adversarial records-erased flag.
  await f.db.query('update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.request]);assert.equal(await f.rpc('minimize_maintenance_deletion_object_inventory'),false);
  // A confirmed absence flag still cannot bypass remaining live metadata.
  await f.acknowledgeAbsence();await assert.rejects(f.rpc('minimize_maintenance_deletion_object_inventory'),/Removed quiet attachment metadata/);
  assert.equal(await f.held(),held);assert.equal(await f.count('attachment_capacity_quarantine'),0);assert.equal(await f.count('retired_attachment_ids'),0);
 }finally{await f.db.close();}
});
test('uncaptured capacity remains unknown and a failure after accounting rolls back the complete move',async()=>{
 for(const variant of ['unknown','rollback']){const f=await fixture();try{
  await f.prepare();if(variant==='unknown')await f.db.query('select maintenance_private.reserve_attachment_capacity($1,$2,1,$3)',[randomUUID(),`${other}/${f.epoch}/${randomUUID()}.pdf`,'upload']);else await f.db.exec("create function maintenance_private.fail_ordinary_minimization_fixture() returns trigger language plpgsql as $$begin raise exception 'Synthetic inventory delete failure';end;$$;create trigger zz_fail_ordinary_minimization_fixture before delete on maintenance_private.account_deletion_objects for each row execute function maintenance_private.fail_ordinary_minimization_fixture()");
  const held=await f.held(),claims=await f.count('attachment_capacity_claims');if(variant==='unknown')assert.equal(await f.rpc('minimize_maintenance_deletion_object_inventory'),false);else await assert.rejects(f.rpc('minimize_maintenance_deletion_object_inventory'),/Synthetic inventory delete failure/);
  assert.equal(await f.held(),held);assert.equal(await f.count('attachment_capacity_claims'),claims);assert.equal(await f.count('attachment_capacity_quarantine'),0);assert.equal(await f.count('deletion_capacity_moves'),0);assert.equal(await f.count('retired_attachment_ids'),0);
 }finally{await f.db.close();}}
});
test('clients and minimum runtime roles cannot read/fabricate movement proof or bypass the service-only boundary',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator','ouchi_retirement_file_executor','ouchi_closure_inspector']){
   await f.db.exec('set role '+role);await assert.rejects(f.db.exec('select * from maintenance_private.deletion_capacity_moves'),/permission denied/);await assert.rejects(f.db.exec("select maintenance_private.ordinary_capacity_move_is_current(null,'11111111-1111-4111-8111-111111111111',1)"),/permission denied/);if(role!=='service_role')await assert.rejects(f.db.query('select public.minimize_maintenance_deletion_object_inventory($1,$2,$3,$4)',f.args),/permission denied/);await f.db.exec('reset role');
  }
  assert.equal((await f.db.query("select relrowsecurity from pg_class where oid='maintenance_private.deletion_capacity_moves'::regclass")).rows[0].relrowsecurity,true);
 }finally{await f.db.close();}
});
