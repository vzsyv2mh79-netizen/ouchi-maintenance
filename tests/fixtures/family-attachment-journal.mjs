import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createFamilyAttachmentJournal} from '../../lib/family-attachment-journal.mjs';

/** Actual disposable PostgreSQL/GoTrue users; signed consent/freeze injected.
 * No Storage copying, quota reservation, ownership activation or erasure here.
 */
export async function verifyDisposableFamilyAttachmentJournal({account,origin,bytes}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');
 assert.equal(origin,'http://127.0.0.1:54321');
 const {Client}=await import('pg');
 const config={host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000};
 const db=new Client(config);await db.connect();
 try{
  await db.query(readFileSync('tests/fixtures/family-attachment-journal.sql','utf8'));
  const owner=await account(),receiver=await account();
  const homeID=randomUUID(),productID=randomUUID(),fileID=randomUUID(),requestID=randomUUID(),nativeRequestID=randomUUID(),nativeLease=randomUUID();
  const sha=createHash('sha256').update(bytes).digest('hex');
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[homeID,owner.user]);
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[homeID,receiver.user,'Synthetic journal receiver']);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[productID,homeID,'air','Synthetic journal product']);
  await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,$5,'image/png','stored',$6,$6,true,$2)",[fileID,owner.user,owner.epoch,productID,bytes.length,sha]);
  await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),owner.user,owner.epoch]);
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts,requested_at) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1,'1970-01-01')",[nativeRequestID,owner.user,owner.epoch,nativeLease]);
  const scope={requestID,homeID,userID:owner.user,ownerEpoch:owner.epoch,nativeRequestID,nativeLease};
  const plan={requestID,homeID,ownerID:owner.user,ownerEpoch:owner.epoch,recipientID:receiver.user,recipientEpoch:receiver.epoch,snapshotDigest:'a'.repeat(64),files:[{id:fileID,mime:'image/png',size:bytes.length,sha256:sha,source:{userID:owner.user,epoch:owner.epoch,path:`${owner.user}/${owner.epoch}/${fileID}.png`}}]};
  const transaction=async callback=>{
   await db.query('begin');
   try{await db.query("set local statement_timeout='4500ms'");const result=await callback(db);await db.query('commit');return result;}
   catch(error){await db.query('rollback');throw error;}
  };
  const port=authorize=>createFamilyAttachmentJournal({transaction,authorize});
  const signal=()=>AbortSignal.timeout(10000);
  const first=await port(async()=>true).record(scope,plan,signal());
  const original=(await db.query('select * from maintenance_private.family_attachment_journals where request_id=$1',[requestID])).rows[0];
  await db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[nativeRequestID]);
  await assert.rejects(port(async()=>true).record(scope,plan,signal()),/Current native deletion lease/);
  const claim=(await db.query('select public.claim_maintenance_account_deletion() as job')).rows[0].job;
  assert.equal(claim.requestID,nativeRequestID);assert.notEqual(claim.leaseToken,nativeLease);
  const renewed={...scope,nativeLease:claim.leaseToken};
  // Neither valid database lease nor a planned row substitutes for dual consent.
  await assert.rejects(port(async()=>false).record(renewed,plan,signal()),/Verified frozen/);
  let checkedOriginal=false;
  assert.deepEqual(await port(async(tx,current,p,inventory,digest,s,initial)=>{
   assert.deepEqual(initial,scope);assert.deepEqual(current,renewed);assert.equal(digest,first.inventoryDigest);checkedOriginal=true;
   return true;
  }).record(renewed,plan,signal()),first);
  assert.equal(checkedOriginal,true);
  await assert.rejects(port(async()=>true).record(scope,plan,signal()),/Current native deletion lease/);
  assert.deepEqual((await db.query('select * from maintenance_private.family_attachment_journals where request_id=$1',[requestID])).rows[0],original);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[homeID])).rows[0].owner_id,owner.user);
  assert.equal((await db.query('select user_id from maintenance_private.product_attachments where id=$1',[fileID])).rows[0].user_id,owner.user);
 }finally{await db.end();}
}
