import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
const migration='20261016174056_ouchi_retired_attachment_ids.sql';
async function fixture(){const f=await householdCopyFixture();await f.db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));return f;}
async function personal(f,id){return f.db.query(`insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking)
 select $1,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id,sha256,expected_sha256,write_tracking from maintenance_private.product_attachments limit 1`,[id]);}
async function household(f,id){const m=await f.port.prepare(f.input,f.signal);return f.db.query(`insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256,state)
 select $1,home_id,home_instance_id,product_id,size_bytes,mime,sha256,'staged' from maintenance_private.household_attachments where id=$2`,[id,m.destination.id]);}
test('permanent opaque ID blocks personal and household path reuse while fresh IDs remain usable',async()=>{
 const f=await fixture();try{
  const retired=randomUUID();await f.db.query('insert into maintenance_private.retired_attachment_ids(attachment_id) values($1)',[retired]);
  await assert.rejects(personal(f,retired),/cannot be reused/);await assert.rejects(household(f,retired),/cannot be reused/);
  await personal(f,randomUUID());await household(f,randomUUID());
  const row=(await f.db.query('select * from maintenance_private.retired_attachment_ids')).rows[0];assert.deepEqual(Object.keys(row).sort(),['attachment_id','retired_at']);
 }finally{await f.db.close();}
});
test('tombstones cannot expire, mutate, delete or truncate and roll back with their transaction',async()=>{
 const f=await fixture();try{
  const id=randomUUID();await f.db.query('insert into maintenance_private.retired_attachment_ids(attachment_id) values($1)',[id]);
  for(const sql of ["update maintenance_private.retired_attachment_ids set retired_at=clock_timestamp()-interval '100 years'",'delete from maintenance_private.retired_attachment_ids','truncate maintenance_private.retired_attachment_ids'])await assert.rejects(f.db.exec(sql),/permanent/);
  await f.db.exec('begin');const rolledBack=randomUUID();await f.db.query('insert into maintenance_private.retired_attachment_ids(attachment_id) values($1)',[rolledBack]);await f.db.exec('rollback');await personal(f,rolledBack);
 }finally{await f.db.close();}
});
test('ordinary, service and operator roles cannot read/write tombstones or call raw identity locks',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){
   await f.db.exec('set role '+role);
   for(const sql of ['select * from maintenance_private.retired_attachment_ids',`insert into maintenance_private.retired_attachment_ids(attachment_id) values('${randomUUID()}')`,`select maintenance_private.lock_attachment_identity('${randomUUID()}')`])await assert.rejects(f.db.exec(sql),/permission denied/);
   await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});
test('stale transaction isolation cannot admit a new file or insert tombstones',async()=>{
 const f=await fixture();try{
  for(const level of ['repeatable read','serializable']){
   await f.db.exec('begin isolation level '+level);await assert.rejects(personal(f,randomUUID()),/Fresh attachment identity/);await f.db.exec('rollback');
   await f.db.exec('begin isolation level '+level);await assert.rejects(f.db.query('insert into maintenance_private.retired_attachment_ids(attachment_id) values($1)',[randomUUID()]),/Fresh attachment identity/);await f.db.exec('rollback');
  }
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set id=$1',[randomUUID()]),/identity is immutable/);
 }finally{await f.db.close();}
});
