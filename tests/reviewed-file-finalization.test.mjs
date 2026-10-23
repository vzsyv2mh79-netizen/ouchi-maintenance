import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {createReviewedFileFinalization} from '../lib/reviewed-file-cleanup.mjs';
async function fixture(options){const f=await reviewedCleanupReadyFixture(options);return {...f,finalizer:createReviewedFileFinalization({connect:f.cleanupConnect})};}
const count=async(f,table)=>(await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n;
const held=async f=>(await f.db.query('select maintenance_private.held_attachment_capacity_bytes() n')).rows[0].n;
test('checked metadata finalization retires source ID, preserves household origin, minimizes journal and holds exactly the same bytes without account links',async()=>{
 const f=await fixture();try{
  const before=await held(f);assert.equal(await f.finalizer.status(f.cleanupInput,f.signal),null);
  await f.cleanupPort.cleanup(f.cleanupInput,f.signal);const receipt=await f.finalizer.finalize(f.cleanupInput,f.signal);assert.equal(receipt.sourceMetadataErased,true);assert.equal(receipt.capacityReleased,false);assert.equal(receipt.accountErasureConfirmed,false);
  for(const t of ['product_attachments','attachment_write_attempts','household_copy_intents','household_copy_writes'])assert.equal(await count(f,t),0);
  assert.equal(await count(f,'household_attachments'),1);assert.equal(await count(f,'household_attachment_origins'),1);assert.equal(await count(f,'attachment_capacity_claims'),1);assert.equal(await count(f,'attachment_capacity_quarantine'),1);assert.equal(await held(f),before);
  const q=(await f.db.query('select * from maintenance_private.attachment_capacity_quarantine')).rows[0];assert.deepEqual(Object.keys(q).sort(),['hold_id','size_bytes']);assert.notEqual(q.hold_id,f.input.fileID);assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
  const source=(await f.db.query("select * from maintenance_private.reviewed_retirement_files where kind='personal_file'")).rows[0];assert.equal(source.state,'absence_confirmed');assert.equal(source.copy_intent_id,null);assert.equal(source.retained_asset_id,null);
  assert.deepEqual(await f.finalizer.finalize(f.cleanupInput,f.signal),receipt);assert.equal(await count(f,'attachment_capacity_quarantine'),1);assert.equal(f.cleanupCalls(),1);
  await assert.rejects(f.db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking) values($1,$2,$3,$4,$5,'application/pdf','stored',$2,$6,$6,true)",[f.input.fileID,f.manifest.source.uploaderID,f.manifest.source.uploaderEpoch,f.manifest.source.productID,f.bytes.length,f.manifest.source.sha256]),/cannot be reused/);
 }finally{await f.db.close();}
});
test('finalization refuses without durable observation, under foreign lease, or after source/writer fingerprint changed',async()=>{
 for(const variant of ['missing','lease','changed']){const f=await fixture();try{
  if(variant!=='missing')await f.cleanupPort.cleanup(f.cleanupInput,f.signal);
  if(variant==='lease')f.cleanupInput.leaseToken=randomUUID();
  if(variant==='changed')await f.db.exec("update maintenance_private.attachment_write_attempts set settled_at=settled_at+interval '1 second'");
  await assert.rejects(f.finalizer.finalize(f.cleanupInput,f.signal),/Durable exact|lease required|fingerprint changed/);assert.equal(await count(f,'product_attachments'),1);assert.equal(await count(f,'retired_attachment_ids'),0);assert.equal(await count(f,'attachment_capacity_quarantine'),0);
 }finally{await f.db.close();}}
});
test('lost finalizer COMMIT recovers one receipt and never duplicates held capacity or requires new Storage deletion',async()=>{
 const f=await fixture();try{
  await f.cleanupPort.cleanup(f.cleanupInput,f.signal);f.loseNextCommit();await assert.rejects(f.finalizer.finalize(f.cleanupInput,f.signal),/commit acknowledgement lost/);assert.equal((await f.finalizer.status(f.cleanupInput,f.signal)).sourceMetadataErased,true);await f.finalizer.finalize(f.cleanupInput,f.signal);assert.equal(await count(f,'attachment_capacity_quarantine'),1);assert.equal(f.cleanupCalls(),1);
 }finally{await f.db.close();}
});
test('failure after accounting move rolls back tombstone, metadata, queue and journal atomically',async()=>{
 const f=await fixture();try{
  await f.cleanupPort.cleanup(f.cleanupInput,f.signal);const before=await held(f);
  await f.db.exec("create function maintenance_private.fail_finalization_fixture() returns trigger language plpgsql as $$begin raise exception 'Synthetic metadata erase failure';end;$$;create trigger zz_fail_finalization_fixture before delete on maintenance_private.product_attachments for each row execute function maintenance_private.fail_finalization_fixture()");
  await assert.rejects(f.finalizer.finalize(f.cleanupInput,f.signal),/Synthetic metadata erase failure/);assert.equal(await count(f,'product_attachments'),1);assert.equal(await count(f,'household_copy_intents'),1);assert.equal(await count(f,'household_copy_writes'),1);assert.equal(await count(f,'retired_attachment_ids'),0);assert.equal(await count(f,'attachment_capacity_quarantine'),0);assert.equal(await held(f),before);assert.equal(await f.finalizer.status(f.cleanupInput,f.signal),null);
 }finally{await f.db.close();}
});
test('opaque capacity quarantine cannot be removed, expired, or excluded from admission and policy limits',async()=>{
 const f=await fixture();try{
  await f.cleanupPort.cleanup(f.cleanupInput,f.signal);await f.finalizer.finalize(f.cleanupInput,f.signal);const bytes=Number(await held(f));
  for(const sql of ['delete from maintenance_private.attachment_capacity_quarantine','truncate maintenance_private.attachment_capacity_quarantine','update maintenance_private.attachment_capacity_quarantine set size_bytes=1'])await assert.rejects(f.db.exec(sql),/remains held/);
  await assert.rejects(f.db.query('update maintenance_private.attachment_app_budget_policy set budget_bytes=$1',[bytes-1]),/Held capacity/);
  await f.db.query('update maintenance_private.attachment_app_budget_policy set budget_bytes=$1',[bytes]);await assert.rejects(f.db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),`${randomUUID()}/${randomUUID()}/${randomUUID()}.pdf`,1,'upload']),/budget exceeded/);
  await assert.rejects(f.db.exec('delete from maintenance_private.attachment_capacity_claims'),/immutable/);
 }finally{await f.db.close();}
});
test('minimum role and clients cannot fabricate capacity moves, delete holds or erase arbitrary metadata',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator','ouchi_retirement_file_executor']){
   await f.db.exec('set role '+role);for(const t of ['retirement_capacity_moves','attachment_capacity_quarantine'])await assert.rejects(f.db.exec('select * from maintenance_private.'+t),/permission denied/);await f.db.exec('reset role');
  }
  await assert.rejects(f.finalizer.finalize({...f.cleanupInput,sourceAbsenceObserved:true},f.signal),/Exact leased/);assert.equal(await count(f,'product_attachments'),1);
 }finally{await f.db.close();}
});
test('erased personal source without a retained copy has the same tombstone and held-byte guarantees',async()=>{
 const f=await fixture({move:false});try{await f.cleanupPort.cleanup(f.cleanupInput,f.signal);const before=await held(f);await f.finalizer.finalize(f.cleanupInput,f.signal);assert.equal(await count(f,'product_attachments'),0);assert.equal(await count(f,'household_attachments'),0);assert.equal(await held(f),before);}finally{await f.db.close();}
});
