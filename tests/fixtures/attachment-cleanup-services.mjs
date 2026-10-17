import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
import {StorageApiError} from '@supabase/supabase-js';
import {runAttachmentCleanupBatch,storedAttachmentCleanupServices} from './attachment-cleanup-module.mjs';

// Explicit disposable services only. PostgreSQL-owner fixture is not a reviewed
// deployment role, provider-retention policy or published deletion deadline.
export async function verifyDisposableAttachmentCleanup({account,admin,origin,bytes,retainedPath,dropReplies}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const config={host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000};
 const db=new Client(config),competitor=new Client(config);await db.connect();await competitor.connect();
 const ok=result=>{assert.equal(result.error,null);return result.data;};
 try{
  const actor=await account(),home=randomUUID(),product=randomUUID(),id=randomUUID(),writing=randomUUID(),attempt=randomUUID();
  ok(await actor.client.from('homes').insert({id:home,owner_id:actor.user,name:'Synthetic cleanup',kind:'home'}));
  ok(await actor.client.from('products').insert({id:product,homeId:home,categoryId:'air',name:'Synthetic cleanup file'}));
  const identity={target_user:actor.user,verified_session:actor.session,expected_epoch:actor.epoch};
  const hash=createHash('sha256').update(bytes).digest('hex'),path=`${actor.user}/${actor.epoch}/${id}.png`;
  for(const file of [id,writing])assert.equal(ok(await admin.rpc('reserve_maintenance_attachment',{...identity,target_product:product,attachment_id:file,byte_count:bytes.length,media_type:'image/png',measured_sha256:hash})),file);
  ok(await admin.rpc('begin_maintenance_attachment_write',{...identity,target_attachment:id,target_attempt:attempt}));
  ok(await admin.storage.from('ouchi-product-attachments').upload(path,bytes,{contentType:'image/png',upsert:false}));
  assert.equal(ok(await admin.rpc('settle_maintenance_attachment_write',{target_attachment:id,target_attempt:attempt})),true);
  assert.equal(ok(await admin.rpc('finalize_maintenance_attachment',{...identity,attachment_id:id,actual_bytes:bytes.length,verified_sha256:hash})),id);
  ok(await admin.rpc('begin_maintenance_attachment_write',{...identity,target_attachment:writing,target_attempt:randomUUID()}));
  assert.ok((await admin.rpc('begin_maintenance_attachment_removal',{...identity,target_attachment:writing})).error);
  assert.equal(ok(await admin.rpc('begin_maintenance_attachment_removal',{...identity,target_attachment:id})).id,id);
  const beforeForeign=(await db.query('select to_jsonb(f) value from maintenance_private.product_attachments f where object_path=$1',[retainedPath])).rows;
  assert.equal(beforeForeign.length,1);assert.equal(beforeForeign[0].value.removal_pending,false);
  const foreignAuth=(await db.query('select id from auth.users where id<>$1 order by id',[actor.user])).rows;
  const oldLease=randomUUID(),first=(await db.query('select maintenance_private.claim_attachment_cleanup($1,$2) value',[id,oldLease])).rows[0].value;assert.ok(first);
  const deadline=(await db.query('select removal_cleanup_until::text value from maintenance_private.product_attachments where id=$1',[id])).rows;
  const raced=await Promise.all([db.query('select maintenance_private.claim_attachment_cleanup($1,$2) value',[id,oldLease]),competitor.query('select maintenance_private.claim_attachment_cleanup($1,$2) value',[id,randomUUID()])]);
  assert.deepEqual(raced[0].rows[0].value,first);assert.equal(raced[1].rows[0].value,null);
  assert.deepEqual((await db.query('select removal_cleanup_until::text value from maintenance_private.product_attachments where id=$1',[id])).rows,deadline);
  // Privileged time-expiry fixture only. Expiry cannot itself acknowledge any
  // disappearance, and the old nonce cannot renew or complete this work.
  await db.query("update maintenance_private.product_attachments set removal_cleanup_until=clock_timestamp()-interval '1 second' where id=$1",[id]);
  assert.equal((await db.query('select maintenance_private.claim_attachment_cleanup($1,$2) value',[id,oldLease])).rows[0].value,null);
  assert.equal((await db.query('select maintenance_private.complete_attachment_cleanup($1,$2,$3,$4,$5,$6,$7) value',[id,oldLease,actor.user,actor.epoch,actor.user,path,'image/png'])).rows[0].value,false);
  // Accepted removal survives logout; the worker does not impersonate or
  // recreate the initiating session. The Auth USER itself remains afterwards.
  ok(await actor.client.auth.signOut());
  const unknown=[];
  const storage={storage:{from:bucket=>{
   assert.equal(bucket,'ouchi-product-attachments');const api=admin.storage.from(bucket);
   return {remove:async paths=>{try{const result=await api.remove(paths);if(result.error)unknown.push(...paths);return result;}catch(error){unknown.push(...paths);throw error;}},download:target=>api.download(target)};
  }}};
  const query=async(sql,args,signal)=>{signal.throwIfAborted();const result=await db.query(sql,args);signal.throwIfAborted();return result;};
  dropReplies.start();let report;
  try{report=await runAttachmentCleanupBatch(storedAttachmentCleanupServices(storage,query),AbortSignal.timeout(30000));}
  finally{dropReplies.stop();}
  assert.ok(report.completed>=1);assert.equal(report.deferred,0);assert.ok(dropReplies.count()>0);assert.ok(unknown.includes(path),'SDK must expose actual response loss for the stored file');
  const absent=await admin.storage.from('ouchi-product-attachments').download(path);assert.ok(absent.error instanceof StorageApiError);assert.equal(absent.error.code,'NoSuchKey');
  assert.deepEqual((await db.query('select state,removal_cleanup_lease,removal_cleanup_until from maintenance_private.product_attachments where id=$1',[id])).rows[0],{state:'removed',removal_cleanup_lease:null,removal_cleanup_until:null});
  assert.deepEqual((await db.query('select state,removal_pending from maintenance_private.product_attachments where id=$1',[writing])).rows[0],{state:'reserved',removal_pending:false});
  assert.equal(Number((await db.query("select sum(size_bytes) bytes from maintenance_private.product_attachments where user_id=$1 and state<>'removed'",[actor.user])).rows[0].bytes),bytes.length);
  assert.deepEqual((await db.query('select to_jsonb(f) value from maintenance_private.product_attachments f where object_path=$1',[retainedPath])).rows,beforeForeign);
  const kept=ok(await admin.storage.from('ouchi-product-attachments').download(retainedPath));assert.deepEqual(Buffer.from(await kept.arrayBuffer()),bytes);
  // Explicit native-request fixture, not actual intake/consent. Completed
  // cleanup metadata must enter a NEW immutable retirement inventory too.
  // The unresolved write remains a separate blocker, even though no bytes for
  // it currently exist. Existing captured inventories are not repaired here.
  const request=randomUUID(),nativeLease=randomUUID();
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes')",[request,actor.user,actor.epoch,nativeLease]);
  const deletion={target_request:request,target_user:actor.user,target_epoch:actor.epoch,target_lease:nativeLease};
  assert.equal(ok(await admin.rpc('capture_maintenance_deletion_objects',deletion)),true);
  const inventory=(await db.query('select attachment_id,absence_confirmed from maintenance_private.account_deletion_objects where request_id=$1 order by attachment_id',[request])).rows;
  assert.deepEqual(inventory.map(row=>row.attachment_id).sort(),[id,writing].sort());assert.ok(inventory.every(row=>row.absence_confirmed===false));
  const retired=await admin.storage.from('ouchi-product-attachments').download(path);assert.ok(retired.error instanceof StorageApiError);assert.equal(retired.error.code,'NoSuchKey');
  assert.equal(ok(await admin.rpc('confirm_maintenance_deletion_object_absence',{...deletion,target_attachment:id})),true);
  assert.equal(ok(await admin.rpc('confirm_maintenance_deletion_object_absence',{...deletion,target_attachment:writing})),false);
  assert.equal(ok(await admin.rpc('erase_maintenance_deletion_records',deletion)),false);
  assert.equal((await db.query('select records_erased from maintenance_private.account_deletion_requests where id=$1',[request])).rows[0].records_erased,false);
  assert.deepEqual((await db.query('select id from auth.users where id<>$1 order by id',[actor.user])).rows,foreignAuth);assert.equal(Number((await db.query('select count(*) n from auth.users where id=$1',[actor.user])).rows[0].n),1);
  console.log('attachment cleanup actual PostgreSQL/Auth/Storage: accepted removal survives logout, competing lease refused without renewal, expired nonce cannot acknowledge, actual successful Storage DELETE replies dropped and SDK error reconciled through definitive NoSuchKey before quota release; fresh retirement recaptures removed metadata and requires a new absence receipt while unresolved writes still block record erasure; unsettled write reservation, foreign metadata/private bytes and Auth users retained; operator fixture role/intake only, no production scheduler or SLA proof');
 }finally{dropReplies.stop();await competitor.end();await db.end();}
}
