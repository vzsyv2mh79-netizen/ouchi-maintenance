import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,os,oe,home,product} from './fixtures/home-handoff-identifiers.mjs';
const observation='supabase/migrations/20261015023355_ouchi_attachment_retention_observation.sql';
const migration='supabase/migrations/20261015041238_ouchi_attachment_cleanup_lease.sql';
const reserve=(db,id)=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,$6,$7)',[owner,os,oe,product,id,'image/png','a'.repeat(64)]);
const begin=(db,id)=>db.query('select public.begin_maintenance_attachment_removal($1,$2,$3,$4)',[owner,os,oe,id]);
const claim=async(db,id,lease)=>(await db.query('select maintenance_private.claim_attachment_cleanup($1,$2) value',[id,lease])).rows[0].value;
const candidates=async db=>(await db.query('select maintenance_private.attachment_cleanup_candidates(25) value')).rows[0].value;
const args=s=>[s.id,s.lease,s.user,s.epoch,s.owner,s.path,s.mime];
const current=async(db,s)=>(await db.query('select maintenance_private.attachment_cleanup_current($1,$2,$3,$4,$5,$6,$7) value',args(s))).rows[0].value;
const complete=async(db,s)=>(await db.query('select maintenance_private.complete_attachment_cleanup($1,$2,$3,$4,$5,$6,$7) value',args(s))).rows[0].value;
async function fixture(before=async()=>{}){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');await before(db);
 await db.exec(readFileSync(observation,'utf8'));await db.exec(readFileSync(migration,'utf8'));
 await db.exec('create schema if not exists storage;create table if not exists storage.objects(bucket_id text,name text)');
 return db;
}
test('accepted removal has one fixed lease, no expiry extension, exact mapping and physical-metadata gate before quota release',async()=>{
 const db=await fixture();try{
  const id=randomUUID(),lease=randomUUID();await reserve(db,id);assert.deepEqual(await candidates(db),[]);await begin(db,id);
  assert.deepEqual(await candidates(db),[id]);
  await db.exec('begin');assert.ok(await claim(db,id,lease));await db.exec('rollback');
  assert.equal((await db.query('select removal_cleanup_lease from maintenance_private.product_attachments where id=$1',[id])).rows[0].removal_cleanup_lease,null);
  const s=await claim(db,id,lease);assert.equal(s.id,id);assert.equal(s.owner,owner);assert.equal(await current(db,s),true);assert.deepEqual(await candidates(db),[]);
  const deadline=await db.query('select removal_cleanup_until::text deadline from maintenance_private.product_attachments where id=$1',[id]);
  assert.deepEqual(await claim(db,id,lease),s);assert.deepEqual((await db.query('select removal_cleanup_until::text deadline from maintenance_private.product_attachments where id=$1',[id])).rows,deadline.rows);
  assert.equal(await claim(db,id,randomUUID()),null);
  for(const changed of [{lease:randomUUID()},{owner:randomUUID()},{epoch:randomUUID()},{path:'foreign/object'},{mime:'application/pdf'}]){assert.equal(await current(db,{...s,...changed}),false);assert.equal(await complete(db,{...s,...changed}),false);}
  await db.query("insert into storage.objects(bucket_id,name) values('ouchi-product-attachments',$1)",[s.path]);assert.equal(await complete(db,s),false);
  assert.equal((await db.query('select state from maintenance_private.product_attachments where id=$1',[id])).rows[0].state,'reserved');
  // SQL fixture only: absence here is not physical-byte proof. SDK/backend
  // orchestration separately requires definitive NoSuchKey before calling.
  await db.query('delete from storage.objects where name=$1',[s.path]);assert.equal(await complete(db,s),true);
  assert.equal(await current(db,s),false);assert.equal(await complete(db,s),false);assert.deepEqual(await candidates(db),[]);
  assert.deepEqual((await db.query('select state,removal_cleanup_lease,removal_cleanup_until from maintenance_private.product_attachments where id=$1',[id])).rows[0],{state:'removed',removal_cleanup_lease:null,removal_cleanup_until:null});
 }finally{await db.close();}
});
test('expired lease needs a different nonce; disabled enrollment or changed epoch stops remaining cleanup',async()=>{
 const db=await fixture();try{
  const id=randomUUID(),first=randomUUID();await reserve(db,id);await begin(db,id);const old=await claim(db,id,first);
  await db.query("update maintenance_private.product_attachments set removal_cleanup_until=clock_timestamp()-interval '1 second' where id=$1",[id]);
  assert.equal(await current(db,old),false);assert.equal(await claim(db,id,first),null);assert.equal(await complete(db,old),false);
  const fresh=await claim(db,id,randomUUID());assert.equal(fresh.path,old.path);assert.notEqual(fresh.lease,old.lease);
  await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);assert.equal(await current(db,fresh),false);assert.equal(await complete(db,fresh),false);assert.deepEqual(await candidates(db),[]);
  await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[owner]);await db.query('update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[owner,randomUUID()]);
  assert.equal(await current(db,fresh),false);assert.equal(await complete(db,fresh),false);
  assert.equal((await db.query('select state from maintenance_private.product_attachments where id=$1',[id])).rows[0].state,'reserved');
 }finally{await db.close();}
});
test('unknown acceptance, legacy tracking and unsettled writes never become cleanup work',async()=>{
 const unknown=randomUUID();const db=await fixture(async db=>{await reserve(db,unknown);await db.query('update maintenance_private.product_attachments set removal_pending=true where id=$1',[unknown]);});try{
  const writing=randomUUID(),legacy=randomUUID();await reserve(db,writing);await reserve(db,legacy);await begin(db,legacy);
  await db.query('select public.begin_maintenance_attachment_write($1,$2,$3,$4,$5)',[owner,os,oe,writing,randomUUID()]);
  // Privileged disposable fault fixtures only, never a production adoption.
  await db.query('update maintenance_private.product_attachments set removal_pending=true where id=$1',[writing]);
  await db.query('update maintenance_private.product_attachments set write_tracking=false where id=$1',[legacy]);
  for(const id of [unknown,writing,legacy])assert.equal(await claim(db,id,randomUUID()),null);
  assert.deepEqual(await candidates(db),[]);assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where state<>\'removed\'')).rows[0].n,3);
 }finally{await db.close();}
});
test('private invoker functions create no client or service-role entry point and reject unbounded batches',async()=>{
 const db=await fixture();try{
  for(const limit of [null,0,26])await assert.rejects(db.query('select maintenance_private.attachment_cleanup_candidates($1)',[limit]),/Bounded/);
  const functions=(await db.query("select p.oid::regprocedure::text signature,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='maintenance_private' and p.proname in('attachment_cleanup_eligible','attachment_cleanup_candidates','claim_attachment_cleanup','attachment_cleanup_current','complete_attachment_cleanup')")).rows;
  assert.equal(functions.length,5);assert.ok(functions.every(f=>f.prosecdef===false));
  for(const role of ['anon','authenticated','service_role'])for(const f of functions)assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,f.signature])).rows[0].allowed,false);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)','execute') allowed",[role])).rows[0].allowed,role==='service_role');
  for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await assert.rejects(candidates(db),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('previously removed file metadata needs fresh retirement inventory and absence proof before record erasure',async()=>{
 const db=await fixture();try{
  const id=randomUUID();await reserve(db,id);await begin(db,id);const scope=await claim(db,id,randomUUID());assert.equal(await complete(db,scope),true);
  await db.query('delete from public.home_members where "homeId"=$1',[home]);
  const request=randomUUID(),lease=randomUUID(),parameters=[request,owner,oe,lease];
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes')",parameters);
  assert.equal((await db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) value',parameters)).rows[0].value,true);
  assert.deepEqual((await db.query('select attachment_id,absence_confirmed from maintenance_private.account_deletion_objects where request_id=$1',[request])).rows,[{attachment_id:id,absence_confirmed:false}]);
  assert.equal((await db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) value',parameters)).rows[0].value,false,'removed metadata alone is not a fresh absence receipt');
  // SQL-only fixture: trusted production caller still needs SDK NoSuchKey.
  assert.equal((await db.query('select public.confirm_maintenance_deletion_object_absence($1,$2,$3,$4,$5) value',[...parameters,id])).rows[0].value,true);
  assert.equal((await db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) value',parameters)).rows[0].value,true);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,3);
 }finally{await db.close();}
});
test('a legacy captured inventory remains frozen instead of silently adopting previously omitted metadata',async()=>{
 const id=randomUUID(),request=randomUUID(),lease=randomUUID(),parameters=[request,owner,oe,lease];
 const db=await fixture(async db=>{
  await reserve(db,id);await db.query("update maintenance_private.product_attachments set state='removed',removal_pending=true where id=$1",[id]);
  await db.query('delete from public.home_members where "homeId"=$1',[home]);
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes')",parameters);
  assert.equal((await db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) value',parameters)).rows[0].value,true);
 });try{
  assert.equal((await db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) value',parameters)).rows[0].value,true);
  assert.deepEqual((await db.query('select attachment_id from maintenance_private.account_deletion_objects where request_id=$1',[request])).rows,[]);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[request])).rows[0].state,'running');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments where id=$1',[id])).rows[0].n,1);
 }finally{await db.close();}
});
