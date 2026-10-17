import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedSharedMaintenanceComposition} from './fixtures/shared-maintenance-composition.mjs';
import {owner,os,oe,product} from './fixtures/home-handoff-identifiers.mjs';

// SQL-only adversarial capability checks. Physical NoSuchKey is separately
// required by the actual-service caller; this fixture does not prove bytes.
test('original object acknowledgement requires both leases, all ordered receipts, quiet writers and absent Storage metadata',async()=>{
 const f=await seedSharedMaintenanceComposition(),id=randomUUID(),writing=randomUUID();const db=f.db;
 try{
  await db.exec("create schema if not exists storage;create table if not exists storage.objects(bucket_id text,name text)");
  await db.exec(readFileSync('tests/fixtures/shared-maintenance-object-absence.sql','utf8'));
  await db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,$6,$7)',[owner,os,oe,product,id,'image/png','a'.repeat(64)]);
  await db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,$6,$7)',[owner,os,oe,product,writing,'image/png','b'.repeat(64)]);
  await db.query('select public.begin_maintenance_attachment_write($1,$2,$3,$4,$5)',[owner,os,oe,writing,randomUUID()]);
  await f.run();
  const scope=f.scope,n=f.native.leaseToken;
  const current=async(s=scope,lease=n)=>(await db.query('select maintenance_private.shared_native_attachment_scope_is_current($1,$2) value',[s,lease])).rows[0].value;
  const ack=async(a=id,s=scope,lease=n)=>(await db.query('select maintenance_private.confirm_shared_native_object_absence($1,$2,$3) value',[s,lease,a])).rows[0].value;
  const confirmed=async()=>(await db.query('select absence_confirmed from maintenance_private.account_deletion_objects where request_id=$1 and attachment_id=$2',[f.native.requestID,id])).rows[0].absence_confirmed;
  const rolled=async work=>{await db.exec('begin');try{await work();}finally{await db.exec('rollback');}};
  assert.equal(await current(),true);assert.equal(await confirmed(),false);
  await assert.rejects(rolled(()=>ack(writing)));
  assert.equal((await db.query('select absence_confirmed from maintenance_private.account_deletion_objects where request_id=$1 and attachment_id=$2',[f.native.requestID,writing])).rows[0].absence_confirmed,false);
  for(const changed of [{...scope,userID:randomUUID()},{...scope,inventoryDigest:'b'.repeat(64)},{...scope,leaseToken:randomUUID()}]){assert.equal(await current(changed),false);await assert.rejects(rolled(()=>ack(id,changed)));}
  assert.equal(await current(scope,randomUUID()),false);await assert.rejects(rolled(()=>ack(id,scope,randomUUID())));
  await assert.rejects(rolled(()=>ack(randomUUID())));assert.equal(await confirmed(),false);
  for(const table of ['private.kb_shared_deletion_journal','maintenance_private.household_stop_bindings']){
   await rolled(async()=>{await db.query(`update ${table} set lease_until=clock_timestamp()-interval '1 second'`);assert.equal(await current(),false);await assert.rejects(ack());});
  }
  await assert.rejects(rolled(()=>db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second'")),/refused|stopped/i);
  for(const stage of ['prepare','verify-family-before','verify-sessions-before']){
   await rolled(async()=>{await db.query('update private.kb_shared_deletion_journal set receipts=receipts-$1 where request_id=$2',[stage,scope.requestID]);assert.equal(await current(),false);await assert.rejects(ack());});
  }
  await assert.rejects(rolled(()=>db.query('update private.kb_shared_deletion_journal set receipts=receipts-$1 where request_id=$2',['handoff-family',scope.requestID])),/Immutable/);
  await assert.rejects(rolled(()=>db.query('delete from maintenance_private.shared_family_stage_contexts where request_id=$1',[scope.requestID])),/Immutable|immutable/);
  const path=(await db.query('select object_path from maintenance_private.account_deletion_objects where request_id=$1 and attachment_id=$2',[f.native.requestID,id])).rows[0].object_path;
  await db.query("insert into storage.objects values('ouchi-product-attachments',$1)",[path]);await assert.rejects(rolled(()=>ack()));assert.equal(await confirmed(),false);
  await db.query('delete from storage.objects where name=$1',[path]);
  assert.equal(await ack(),true);assert.equal(await confirmed(),true);assert.equal(await ack(),true);
  for(const role of ['anon','authenticated','service_role'])for(const signature of ['shared_native_attachment_scope_is_current(jsonb,uuid)','shared_native_object_absence_is_confirmed(jsonb,uuid,uuid)','confirm_shared_native_object_absence(jsonb,uuid,uuid)']){
   assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,'maintenance_private.'+signature])).rows[0].allowed,false);
  }
 }finally{await db.close();}
});

test('native record erasure cascades only a settled original acknowledged attachment write',async()=>{
 const f=await seedSharedMaintenanceComposition(),id=randomUUID(),attempt=randomUUID(),db=f.db;
 try{
  await db.exec("create schema if not exists storage;create table if not exists storage.objects(bucket_id text,name text)");
  await db.exec(readFileSync('tests/fixtures/shared-maintenance-object-absence.sql','utf8'));
  await db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,$6,$7)',[owner,os,oe,product,id,'image/png','a'.repeat(64)]);
  await db.query('select public.begin_maintenance_attachment_write($1,$2,$3,$4,$5)',[owner,os,oe,id,attempt]);
  await db.query('select public.settle_maintenance_attachment_write($1,$2)',[id,attempt]);
  await f.run();
  assert.equal((await db.query('select maintenance_private.confirm_shared_native_object_absence($1,$2,$3) value',[f.scope,f.native.leaseToken,id])).rows[0].value,true);
  const prior=(await db.query('select to_jsonb(w) value from maintenance_private.attachment_write_attempts w where attachment_id=$1',[id])).rows[0].value;
  await db.exec('begin');
  try{
   await db.query("insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),$1,$2,$3,$4,'eraseRecords',clock_timestamp()+interval '15 seconds')",[f.scope,f.native.requestID,f.native.epochID,f.native.leaseToken]);
   const matches=async(row=prior,op='DELETE')=>(await db.query("select maintenance_private.shared_native_stage_write_matches('maintenance_private','attachment_write_attempts',$1,$2,null) value",[op,row])).rows[0].value;
   assert.equal(await matches(),true);
   for(const change of [{owner_id:randomUUID()},{uploader_id:randomUUID()},{app_epoch_id:randomUUID()},{attachment_id:randomUUID()},{state:'started',settled_at:null},{settled_at:null}])assert.equal(await matches({...prior,...change}),false);
   assert.equal(await matches(prior,'UPDATE'),false);assert.equal(await matches(prior,'INSERT'),false);
  }finally{await db.exec('rollback');}
  await db.exec('begin');
  try{
   assert.equal((await db.query('select maintenance_private.run_shared_native_stage($1,$2,$3) value',[f.scope,f.native.leaseToken,'eraseRecords'])).rows[0].value,true);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_write_attempts where attachment_id=$1',[id])).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[id])).rows[0].n,0);
   await db.exec('commit');
  }catch(error){await db.exec('rollback');throw error;}
 }finally{await db.close();}
});
