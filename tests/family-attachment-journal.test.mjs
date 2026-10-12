import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createFamilyAttachmentJournal,familyAttachmentInventoryDigest} from '../lib/family-attachment-journal.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,request,oe,re,other,rs} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();
 await db.exec('reset role');await db.exec(readFileSync('tests/fixtures/family-attachment-journal.sql','utf8'));
 await db.exec(readFileSync('tests/fixtures/family-attachment-quota.sql','utf8'));
 const id=randomUUID(),sha='b'.repeat(64),nativeLease=randomUUID();
 await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,8,'image/png','stored',$5,$5,true,$2)",[id,owner,oe,product,sha]);
 await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[id,randomUUID(),owner,oe]);
 const nativeRequestID=randomUUID();
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeRequestID,owner,oe,nativeLease]);
 const scope={requestID:request,homeID:home,userID:owner,ownerEpoch:oe,nativeRequestID,nativeLease};
 const plan={requestID:request,homeID:home,ownerID:owner,ownerEpoch:oe,recipientID:recipient,recipientEpoch:re,snapshotDigest:'a'.repeat(64),files:[{id,size:8,mime:'image/png',sha256:sha,source:{userID:owner,epoch:oe,path:`${owner}/${oe}/${id}.png`}}]};
 // Only this preparation database contract is exercised. Consent/freeze are
 // injected, not evidence of actual signed Auth/MFA/controller authorization.
 const port=(authorize=async()=>true)=>createFamilyAttachmentJournal({transaction:callback=>db.transaction(callback),authorize});
 const signal=()=>new AbortController().signal;
 const count=async()=>Number((await db.query('select count(*) n from maintenance_private.family_attachment_journals')).rows[0].n);
 return {db,scope,plan,id,port,signal,count};
}

test('journal survives a new provider instance without changing owner, bytes metadata or stage',async()=>{
 const f=await fixture();try{
  const before=(await f.db.query('select * from maintenance_private.product_attachments')).rows;
  const first=await f.port().record(f.scope,f.plan,f.signal());
  assert.equal(first.state,'planned');assert.equal(await f.count(),1);
  assert.deepEqual(await f.port().record(f.scope,f.plan,f.signal()),first);
  assert.deepEqual((await f.db.query('select * from maintenance_private.product_attachments')).rows,before);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  const row=(await f.db.query('select * from maintenance_private.family_attachment_journals')).rows[0];
  assert.equal(row.inventory_digest,familyAttachmentInventoryDigest(row.inventory));
  assert.equal(row.inventory.files.length,1);assert.equal(row.inventory.writes.length,1);
 }finally{await f.db.close();}
});

test('journal conflicts preserve original scope and manifest instead of overwriting custody evidence',async()=>{
 const f=await fixture();try{
  await f.port().record(f.scope,f.plan,f.signal());
  await assert.rejects(f.port().record({...f.scope,nativeLease:randomUUID()},f.plan,f.signal()),/Current native deletion lease/);
  const changed=structuredClone(f.plan);changed.files[0].sha256='c'.repeat(64);
  await assert.rejects(f.port().record(f.scope,changed,f.signal()),/Journal conflict/);
  assert.equal(await f.count(),1);
  await assert.rejects(f.db.exec("update maintenance_private.family_attachment_journals set state='planned'"),/Immutable family/);
  await assert.rejects(f.db.exec('delete from maintenance_private.family_attachment_journals'),/Immutable family/);
 }finally{await f.db.close();}
});

test('full metadata and settled-write inventory is mandatory before durable capture',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.port().record(f.scope,{...f.plan,files:[]},f.signal()),/Incomplete file manifest/);
  const changed=structuredClone(f.plan);changed.files[0].size=9;
  await assert.rejects(f.port().record(f.scope,changed,f.signal()),/Source metadata changed/);
  await f.db.query("update maintenance_private.attachment_write_attempts set state='started',settled_at=null where attachment_id=$1",[f.id]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/unsettled/);
  assert.equal(await f.count(),0);
 }finally{await f.db.close();}
});

test('receiver epoch, membership and original owner are checked against database rows',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.port().record(f.scope,{...f.plan,recipientEpoch:randomUUID()},f.signal()),/Receiver enrollment/);
  await f.db.query('delete from public.home_members where "homeId"=$1',[home]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Receiver membership/);
  await f.db.query('update public.homes set owner_id=$1 where id=$2',[recipient,home]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Original owner/);
  assert.equal(await f.count(),0);
 }finally{await f.db.close();}
});

test('post-insert authority loss rolls back and replay requires renewed authority',async()=>{
 const f=await fixture();try{
  let checks=0;
  await assert.rejects(f.port(async()=>++checks===1).record(f.scope,f.plan,f.signal()),/Verified frozen/);
  assert.equal(checks,2);assert.equal(await f.count(),0);
  await f.port().record(f.scope,f.plan,f.signal());
  await assert.rejects(f.port(async()=>false).record(f.scope,f.plan,f.signal()),/Verified frozen/);
  assert.equal(await f.count(),1);
 }finally{await f.db.close();}
});

test('cancellation after insert rolls back, and scope does not accept a foreign owner or request',async()=>{
 const f=await fixture();try{
  const abort=new AbortController();let checks=0;
  await assert.rejects(f.port(async()=>{if(++checks===2)abort.abort(Error('cancelled'));return true;}).record(f.scope,f.plan,abort.signal),/cancelled/);
  assert.equal(await f.count(),0);
  assert.throws(()=>f.port().record({...f.scope,userID:other},f.plan,f.signal()),/Foreign journal scope/);
  assert.throws(()=>f.port().record({...f.scope,requestID:randomUUID()},f.plan,f.signal()),/Foreign journal scope/);
 }finally{await f.db.close();}
});

test('Data API roles and service role have no journal read or write grant',async()=>{
 const f=await fixture();try{
  await f.port().record(f.scope,f.plan,f.signal());
  for(const role of ['anon','authenticated','service_role']){
   await f.db.exec('set role '+role);
   await assert.rejects(f.db.exec('select * from maintenance_private.family_attachment_journals'),/permission denied/);
   await assert.rejects(f.db.exec('delete from maintenance_private.family_attachment_journals'),/permission denied/);
   await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});

test('a closing receiver cannot acquire a durable planned inventory',async()=>{
 const f=await fixture();try{
  await f.db.query('insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id) values($1,$2)',[recipient,re]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Receiver retirement pending/);
  assert.equal(await f.count(),0);
 }finally{await f.db.close();}
});

test('actual database reclaim accepts only the new lease and preserves the immutable original inventory',async()=>{
 const f=await fixture();try{
  const receipt=await f.port().record(f.scope,f.plan,f.signal());
  const before=(await f.db.query('select * from maintenance_private.family_attachment_journals')).rows[0];
  await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.scope.nativeRequestID]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Current native deletion lease/);
  const claim=(await f.db.query('select public.claim_maintenance_account_deletion() as job')).rows[0].job;
  assert.equal(claim.requestID,f.scope.nativeRequestID);assert.notEqual(claim.leaseToken,f.scope.nativeLease);
  const renewed={...f.scope,nativeLease:claim.leaseToken};let seenOriginal;
  const port=f.port(async(tx,scope,plan,inventory,digest,signal,original)=>{
   assert.deepEqual(scope,renewed);seenOriginal=original;
   assert.equal(digest,receipt.inventoryDigest);assert.ok(Object.isFrozen(original));return true;
  });
  assert.deepEqual(await port.record(renewed,f.plan,f.signal()),receipt);
  assert.deepEqual(seenOriginal,f.scope);
  assert.deepEqual((await f.db.query('select * from maintenance_private.family_attachment_journals')).rows[0],before);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Current native deletion lease/);
 }finally{await f.db.close();}
});

test('new database lease still requires signed authority, and another native request cannot replay the manifest',async()=>{
 const f=await fixture();try{
  await f.port().record(f.scope,f.plan,f.signal());
  await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.scope.nativeRequestID]);
  const claim=(await f.db.query('select public.claim_maintenance_account_deletion() as job')).rows[0].job;
  const renewed={...f.scope,nativeLease:claim.leaseToken};
  await assert.rejects(f.port(async()=>false).record(renewed,f.plan,f.signal()),/Verified frozen/);
  await assert.rejects(f.port().record({...renewed,nativeRequestID:randomUUID()},f.plan,f.signal()),/Current native deletion lease/);
  assert.equal(await f.count(),1);
 }finally{await f.db.close();}
});

test('database lease expiry during authorization rolls back a just-inserted inventory',async()=>{
 const f=await fixture();try{
  let checks=0;
  await assert.rejects(f.port(async tx=>{
   if(++checks===2)await tx.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.scope.nativeRequestID]);
   return true;
  }).record(f.scope,f.plan,f.signal()),/Current native deletion lease/);
  assert.equal(checks,2);assert.equal(await f.count(),0);
 }finally{await f.db.close();}
});

test('terminal native request or a replaced owner epoch refuses both capture and replay',async()=>{
 const f=await fixture();try{
  await f.port().record(f.scope,f.plan,f.signal());
  await f.db.query("update maintenance_private.account_deletion_requests set state='failed',lease_token=null,lease_until=null where id=$1",[f.scope.nativeRequestID]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Current native deletion lease/);
  await f.db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=clock_timestamp()+interval '2 minutes' where id=$1",[f.scope.nativeRequestID,f.scope.nativeLease]);
  await f.db.query('update maintenance_private.app_epochs set epoch_id=$2 where user_id=$1',[owner,randomUUID()]);
  await assert.rejects(f.port().record(f.scope,f.plan,f.signal()),/Current native deletion lease/);
  assert.equal(await f.count(),1);
 }finally{await f.db.close();}
});

async function usage(f,count,size=1){
 const anotherHome=randomUUID(),anotherProduct=randomUUID();
 await f.db.query('insert into public.homes(id,owner_id) values($1,$2)',[anotherHome,recipient]);
 await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[anotherProduct,anotherHome,'air','Quota fixture']);
 for(let i=0;i<count;i++)await f.db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,captured_owner_id) values($1,$2,$3,$4,$5,'image/png',$2)",[randomUUID(),recipient,re,anotherProduct,size]);
 return anotherProduct;
}
const reserved=f=>f.db.query('select * from maintenance_private.family_attachment_quota');

test('receiver reservation persists exactly once through replay and a formally reclaimed lease',async()=>{
 const f=await fixture();try{
  const first=await f.port().reserve(f.scope,f.plan,f.signal());assert.equal(first.state,'reserved');
  assert.deepEqual(await f.port().reserve(f.scope,f.plan,f.signal()),first);
  const rows=(await reserved(f)).rows;assert.equal(rows.length,1);assert.equal(Number(rows[0].size_bytes),8);
  await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.scope.nativeRequestID]);
  const claim=(await f.db.query('select public.claim_maintenance_account_deletion() as job')).rows[0].job;
  assert.deepEqual(await f.port().reserve({...f.scope,nativeLease:claim.leaseToken},f.plan,f.signal()),first);
  assert.deepEqual((await reserved(f)).rows,rows);
  await assert.rejects(f.db.exec('delete from maintenance_private.family_attachment_quota'),/Immutable family/);
 }finally{await f.db.close();}
});

test('receiver byte and file limits include other homes and reject the whole reservation transaction',async()=>{
 for(const [count,size] of [[20,5242880],[100,1]]){
  const f=await fixture();try{
   await usage(f,count,size);
   await assert.rejects(f.port().reserve(f.scope,f.plan,f.signal()),/Attachment quota exceeded/);
   assert.equal(await f.count(),0);assert.equal((await reserved(f)).rows.length,0);
   assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  }finally{await f.db.close();}
 }
});

test('ordinary service reserve RPC accounts for pending handoff capacity and replay does not double charge',async()=>{
 const f=await fixture();try{
  const anotherProduct=await usage(f,99);
  await f.port().reserve(f.scope,f.plan,f.signal());
  await f.db.exec('set role service_role');
  await assert.rejects(f.db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,1,$6,$7)',[recipient,rs,re,anotherProduct,randomUUID(),'image/png','c'.repeat(64)]),/Attachment quota exceeded/);
  await f.db.exec('reset role');
  assert.equal((await reserved(f)).rows.length,1);
  assert.equal((await f.port().reserve(f.scope,f.plan,f.signal())).state,'reserved');
 }finally{await f.db.close();}
});

test('authority loss after capacity reservation rolls back journal and reservations together',async()=>{
 const f=await fixture();try{
  let checks=0;
  await assert.rejects(f.port(async()=>++checks<3).reserve(f.scope,f.plan,f.signal()),/Verified frozen/);
  assert.equal(checks,3);assert.equal(await f.count(),0);assert.equal((await reserved(f)).rows.length,0);
 }finally{await f.db.close();}
});

test('member-owned files retain existing quota and do not get copied or charged twice',async()=>{
 const f=await fixture();try{
  const id=randomUUID(),sha='d'.repeat(64);
  await f.db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,9,'image/png','stored',$5,$5,true,$6)",[id,recipient,re,product,sha,owner]);
  await f.db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$4,$5,'settled',clock_timestamp())",[id,randomUUID(),recipient,owner,re]);
  f.plan.files.push({id,size:9,mime:'image/png',sha256:sha,source:{userID:recipient,epoch:re,path:`${recipient}/${re}/${id}.png`}});
  assert.equal((await f.port().reserve(f.scope,f.plan,f.signal())).state,'reserved');
  const rows=(await reserved(f)).rows;assert.equal(rows.length,1);assert.equal(rows[0].attachment_id,f.id);
 }finally{await f.db.close();}
});

test('capacity failure on a later file rolls back every earlier file reservation and the new journal',async()=>{
 const f=await fixture();try{
  await usage(f,99);const id=randomUUID(),sha='e'.repeat(64);
  await f.db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,9,'image/png','stored',$5,$5,true,$2)",[id,owner,oe,product,sha]);
  await f.db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[id,randomUUID(),owner,oe]);
  f.plan.files.push({id,size:9,mime:'image/png',sha256:sha,source:{userID:owner,epoch:oe,path:`${owner}/${oe}/${id}.png`}});
  await assert.rejects(f.port().reserve(f.scope,f.plan,f.signal()),/Attachment quota exceeded/);
  assert.equal(await f.count(),0);assert.equal((await reserved(f)).rows.length,0);
 }finally{await f.db.close();}
});

test('clients cannot inspect quota rows and even service role cannot create or release a reservation',async()=>{
 const f=await fixture();try{
  await f.port().reserve(f.scope,f.plan,f.signal());
  for(const role of ['anon','authenticated','service_role']){
   await f.db.exec('set role '+role);
   if(role!=='service_role')await assert.rejects(f.db.exec('select * from maintenance_private.family_attachment_quota'),/permission denied/);
   await assert.rejects(f.db.exec('delete from maintenance_private.family_attachment_quota'),/permission denied/);
   await assert.rejects(f.db.query('insert into maintenance_private.family_attachment_quota(request_id,home_id,attachment_id,recipient_id,recipient_epoch,size_bytes) values($1,$2,$3,$4,$5,8)',[request,home,randomUUID(),recipient,re]),/permission denied/);
   await f.db.exec('reset role');
  }
  assert.equal((await reserved(f)).rows.length,1);
 }finally{await f.db.close();}
});
