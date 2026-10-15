import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedSharedMaintenanceComposition} from './fixtures/shared-maintenance-composition.mjs';
import {createSharedFamilyStageStore} from '../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../lib/shared-family-handoff-stage.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {owner,os,oe,product,recipient,home} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const f=await seedSharedMaintenanceComposition({deferInventory:true}),db=f.db,id=randomUUID();
 await db.exec("create schema if not exists storage;create table if not exists storage.objects(bucket_id text,name text)");
 for(const name of ['shared-maintenance-object-absence.sql','shared-maintenance-inventory-capture.sql'])await db.exec(readFileSync('tests/fixtures/'+name,'utf8'));
 await db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,$6,$7)',[owner,os,oe,product,id,'image/png','a'.repeat(64)]);
 return {...f,id};
}
const capture=f=>(f.db.query('select maintenance_private.capture_shared_native_deletion_objects($1,$2) value',[f.scope,f.native.leaseToken]));

test('post-family capability captures canonical objects only after ordered checkpoint while normal app access stays stopped',async()=>{
 const f=await fixture(),db=f.db;
 try{
  await assert.rejects(capture(f),/authority/);
  assert.deepEqual(await f.run(),{state:'pending',stage:'erase:ouchi-maintenance'});
  assert.equal((await db.query('select enabled from maintenance_private.account_access where user_id=$1',[owner])).rows[0].enabled,false);
  assert.equal((await db.query('select inventory_captured from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows[0].inventory_captured,false);
  const args=[f.scope,f.native.leaseToken];
  assert.equal((await db.query('select maintenance_private.shared_native_attachment_scope_is_current($1,$2) value',args)).rows[0].value,false);
  assert.equal((await capture(f)).rows[0].value,true);
  assert.equal((await db.query('select maintenance_private.shared_native_attachment_scope_is_current($1,$2) value',args)).rows[0].value,true);
  const inventory=(await db.query('select * from maintenance_private.account_deletion_objects where request_id=$1',[f.native.requestID])).rows;
  assert.equal(inventory.length,1);assert.equal(inventory[0].attachment_id,f.id);assert.equal(inventory[0].absence_confirmed,false);
  assert.equal((await capture(f)).rows[0].value,true);assert.deepEqual((await db.query('select * from maintenance_private.account_deletion_objects where request_id=$1',[f.native.requestID])).rows,inventory);
  // SQL fixture only: prove the new capture context does not replace the
  // existing acknowledgement/metadata guards after its own statement ends.
  assert.equal((await db.query('select maintenance_private.confirm_shared_native_object_absence($1,$2,$3) value',[f.scope,f.native.leaseToken,f.id])).rows[0].value,true);
  await db.exec('begin');
  try{assert.equal((await db.query('select maintenance_private.run_shared_native_stage($1,$2,$3) value',[f.scope,f.native.leaseToken,'eraseRecords'])).rows[0].value,true);await db.exec('commit');}catch(error){await db.exec('rollback');throw error;}
  for(const role of ['anon','authenticated','service_role'])for(const name of ['shared_native_capture_scope_is_current(jsonb,uuid)','capture_shared_native_deletion_objects(jsonb,uuid)','shared_native_capture_write_matches(text,text,text,jsonb,jsonb)'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,'maintenance_private.'+name])).rows[0].allowed,false);
 }finally{await db.close();}
});

test('capture refuses foreign scope, expired lease, missing prerequisite and unrelated metadata writes',async()=>{
 const f=await fixture(),db=f.db;
 const rollback=async work=>{await db.exec('begin');try{await work();}finally{await db.exec('rollback');}};
 try{
  await f.run();
  for(const bad of [{...f.scope,userID:randomUUID()},{...f.scope,inventoryDigest:'b'.repeat(64)},{...f.scope,leaseToken:randomUUID()}])await assert.rejects(capture({...f,scope:bad}),/authority/);
  await assert.rejects(capture({...f,native:{...f.native,leaseToken:randomUUID()}}),/authority/);
  await rollback(async()=>{await db.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[f.scope.requestID]);await assert.rejects(capture(f),/authority/);});
  await rollback(async()=>{await db.query('update private.kb_shared_deletion_journal set receipts=receipts-$1 where request_id=$2',['verify-sessions-before',f.scope.requestID]);await assert.rejects(capture(f),/authority/);});
  await rollback(async()=>{
   await db.query("insert into maintenance_private.shared_native_capture_contexts values(pg_backend_pid(),txid_current(),$1,$2,clock_timestamp()+interval '15 seconds')",[f.scope,f.native.leaseToken]);
   const match=async(table,op,prior,next)=>(await db.query("select maintenance_private.shared_native_capture_write_matches('maintenance_private',$1,$2,$3,$4) value",[table,op,prior,next])).rows[0].value;
   const old=(await db.query('select to_jsonb(a) value from maintenance_private.account_access a where user_id=$1',[owner])).rows[0].value;
   assert.equal(await match('account_access','UPDATE',old,{...old,enabled:false}),true);
   assert.equal(await match('account_access','UPDATE',old,{...old,enabled:true}),false);
   assert.equal(await match('account_access','DELETE',old,null),false);
   assert.equal(await match('account_access','UPDATE',{...old,user_id:randomUUID()},{...old,user_id:randomUUID(),enabled:false}),false);
   const file=(await db.query('select * from maintenance_private.product_attachments where id=$1',[f.id])).rows[0];
   const row={request_id:f.native.requestID,attachment_id:f.id,uploader_id:owner,uploader_epoch:oe,bucket:'ouchi-product-attachments',object_path:file.object_path,absence_confirmed:false};
   assert.equal(await match('account_deletion_objects','INSERT',null,row),true);
   for(const change of [{request_id:randomUUID()},{attachment_id:randomUUID()},{uploader_id:randomUUID()},{uploader_epoch:randomUUID()},{object_path:'foreign/object'},{absence_confirmed:true}])assert.equal(await match('account_deletion_objects','INSERT',null,{...row,...change}),false);
   assert.equal(await match('account_deletion_objects','UPDATE',row,row),false);
  });
 }finally{await db.close();}
});

test('SQL checkpoint refuses omitted family when the owner is implicit and only the recipient has a membership row',async()=>{
 const f=await fixture(),db=f.db;
 try{
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,recipient,'Synthetic recipient']);
  // Adversarial SQL-only fixture: synthetic prepare receipt and deliberately
  // dishonest higher-level coverage providers must not bypass the SQL check.
  const inventory={...f.scope};delete inventory.leaseToken;
  await db.query("update private.kb_shared_deletion_journal set receipts=jsonb_build_object('prepare',$2::jsonb) where request_id=$1",[f.scope.requestID,{...inventory,durable:true,stage:'prepare'}]);
  const store=createSharedFamilyStageStore({verifyReadAuthority:async()=>true,loadValidatedTargets:async()=>[]});
  await assert.rejects(async()=>{
   await db.exec('begin');try{
    await runWithTransactionCommitChecks(db,f.controller.signal,tx=>store.record(tx,f.scope,sharedFamilyCoverageDigest([],f.scope),f.controller.signal));
    await db.exec('commit');
   }catch(error){await db.exec('rollback');throw error;}
  },/Complete original family coverage/);
 }finally{await db.close();}
});
