import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createFamilyAttachmentJournal,familyAttachmentInventoryDigest} from '../lib/family-attachment-journal.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,request,oe,re,other} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();
 await db.exec('reset role');await db.exec(readFileSync('tests/fixtures/family-attachment-journal.sql','utf8'));
 const id=randomUUID(),sha='b'.repeat(64),nativeLease=randomUUID();
 await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,8,'image/png','stored',$5,$5,true,$2)",[id,owner,oe,product,sha]);
 await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[id,randomUUID(),owner,oe]);
 const scope={requestID:request,homeID:home,userID:owner,ownerEpoch:oe,nativeLease};
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
  await assert.rejects(f.port().record({...f.scope,nativeLease:randomUUID()},f.plan,f.signal()),/Journal conflict/);
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
