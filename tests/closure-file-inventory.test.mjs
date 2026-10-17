import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,other,home,product,rs,re,oe} from './fixtures/home-handoff-identifiers.mjs';
import {createClosureOperatorReview} from '../lib/closure-operator-review.mjs';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql','20261016123247_ouchi_closure_text_review_snapshot.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016144839_ouchi_closure_file_review_inventory.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const submission=randomUUID(),receipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,submission])).rows[0].receipt;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true)');
 const input={reviewRequestID:receipt.reviewRequestID,userID:recipient,epochID:re,afterFile:null};
 const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql,args){const result=await db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');return result;}})});
 const file=async({id=randomUUID(),user=owner,epoch=oe,target=product,state='reserved',capturedOwner=owner}={})=>{await db.query('insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id) values($1,$2,$3,$4,12,$5,$6,$7)',[id,user,epoch,target,'application/pdf',state,capturedOwner]);return id;};
 const readInput=row=>({reviewRequestID:input.reviewRequestID,userID:recipient,epochID:re,fileID:row.attachment_id,expectedMetadataDigest:row.metadata_digest});
 return {db,input,port,file,readInput,submission};
}
test('private inventory finds household files and actor residual metadata without assuming authorship or returning paths',async()=>{
 const {db,input,port,file,readInput}=await fixture();try{
  const family=await file(),orphan=await file({user:recipient,epoch:re,target:randomUUID(),state:'removed',capturedOwner:null});
  const foreignHome=randomUUID(),foreignProduct=randomUUID();await db.query('insert into public.homes(id,owner_id) values($1,$2)',[foreignHome,other]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[foreignProduct,foreignHome,'air','Private unrelated']);await file({user:other,target:foreignProduct,capturedOwner:other});
  const page=await port.fileInventory(input,new AbortController().signal);assert.deepEqual(new Set(page.items.map(v=>v.attachment_id)),new Set([family,orphan]));
  assert.equal(page.consistentSnapshot,false);assert.equal(page.subjectConfirmed,false);assert.equal(page.accountErasureConfirmed,false);assert.equal(JSON.stringify(page).includes('objectPath'),false);
  const row=page.items.find(v=>v.attachment_id===family);assert.equal(row.write_state,'untracked');assert.equal(row.size_bytes,12);
  const read=await port.readFile(readInput(row),new AbortController().signal);assert.equal(read.metadataDigest,row.metadata_digest);assert.equal(read.file.subjectConfirmed,false);assert.equal(read.file.bucket,'ouchi-product-attachments');assert.equal(read.accountErasureConfirmed,false);assert.ok(Object.isFrozen(read.file));
  const missing=page.items.find(v=>v.attachment_id===orphan);assert.equal(missing.home_id,null);assert.equal(missing.home_instance_id,null);assert.equal((await port.readFile(readInput(missing),new AbortController().signal)).file.state,'removed');
 }finally{await db.close();}
});
test('ownerless scope follows current membership or explicit legacy context, and revoked contexts do not revive',async()=>{
 const {db,input,port,file,readInput}=await fixture();try{
  await file();await db.query('update public.homes set owner_id=null where id=$1',[home]);const signal=new AbortController().signal;
  const row=(await port.fileInventory(input,signal)).items[0];assert.ok(row);await db.query('delete from public.home_members where user_id=$1',[recipient]);
  assert.equal((await port.fileInventory(input,signal)).items.length,0);await assert.rejects(port.readFile(readInput(row),signal),/Scoped file unavailable/);
  const context={eventID:randomUUID(),reviewRequestID:input.reviewRequestID,userID:recipient,epochID:re,homeID:home,action:'confirmed',evidenceDigest:'a'.repeat(64),confirmation:'CONFIRM_REVIEWED_LEGACY_CONTEXT'};
  await port.recordLegacyContext(context,signal);assert.equal((await port.fileInventory(input,signal)).items.length,1);
  await port.recordLegacyContext({...context,eventID:randomUUID(),action:'revoked',confirmation:'REVOKE_LEGACY_CONTEXT'},signal);await port.recordLegacyContext(context,signal);
  assert.equal((await port.fileInventory(input,signal)).items.length,0);await assert.rejects(port.readFile(readInput(row),signal),/Scoped file unavailable/);
 }finally{await db.close();}
});
test('metadata digest changes with file state and write attempt, and stale descriptor reads refuse',async()=>{
 const {db,input,port,file,readInput}=await fixture();try{
  const id=await file(),signal=new AbortController().signal,row=(await port.fileInventory(input,signal)).items[0];
  await db.query('update maintenance_private.product_attachments set write_tracking=true where id=$1',[id]);await assert.rejects(port.readFile(readInput(row),signal),/File metadata changed/);
  const tracked=(await port.fileInventory(input,signal)).items[0];assert.equal(tracked.write_state,'missing');
  await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state) values($1,$2,$3,$3,$4,'started')",[id,randomUUID(),owner,oe]);
  const started=(await port.fileInventory(input,signal)).items[0];assert.equal(started.write_state,'started');assert.notEqual(started.metadata_digest,tracked.metadata_digest);
  await db.query("update maintenance_private.attachment_write_attempts set state='settled',settled_at=clock_timestamp() where attachment_id=$1",[id]);const settled=(await port.fileInventory(input,signal)).items[0];assert.equal(settled.write_state,'settled');assert.notEqual(settled.metadata_digest,started.metadata_digest);
  await db.query('update maintenance_private.product_attachments set removal_pending=true where id=$1',[id]);await assert.rejects(port.readFile(readInput(settled),signal),/File metadata changed/);
 }finally{await db.close();}
});
test('pagination is bounded, unique and read-only, without claiming a consistent full inventory',async()=>{
 const {db,input,port,file}=await fixture();try{
  for(let i=1;i<=54;i++)await file({id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`});
  const signal=new AbortController().signal,first=await port.fileInventory(input,signal),last=await port.fileInventory({...input,afterFile:first.nextCursor},signal);
  assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.equal(last.items.length,4);assert.equal(last.hasMore,false);assert.equal(last.nextCursor,null);assert.equal(first.consistentSnapshot,false);
  const keys=[...first.items,...last.items].map(v=>v.attachment_id);assert.equal(new Set(keys).size,54);assert.deepEqual([...keys].sort(),keys);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments')).rows[0].n,54);assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
test('disabled operator, wrong review, cancelled request and ordinary roles cannot read descriptors or metadata',async()=>{
 const {db,input,port,file,readInput,submission}=await fixture();try{
  await file();const signal=new AbortController().signal,row=(await port.fileInventory(input,signal)).items[0];
  await assert.rejects(port.fileInventory({...input,userID:owner},signal),/matching review/);
  for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await assert.rejects(db.query('select * from maintenance_private.closure_review_file_inventory($1,$2,$3,null)',[input.reviewRequestID,recipient,re]),/permission denied/);await assert.rejects(db.query('select maintenance_private.read_closure_review_file($1,$2,$3,$4,$5)',[input.reviewRequestID,recipient,re,row.attachment_id,row.metadata_digest]),/permission denied/);await db.exec('reset role');}
  await db.exec('update maintenance_private.closure_operator_principals set enabled=false');await assert.rejects(port.readFile(readInput(row),signal),/Authorized operator/);
  await db.exec('update maintenance_private.closure_operator_principals set enabled=true;set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[recipient,rs,re,submission]);await db.exec('reset role');await assert.rejects(port.fileInventory(input,signal),/matching review/);
 }finally{await db.close();}
});
test('file port refuses malformed pages and inputs before acknowledging metadata',async()=>{
 const input={reviewRequestID:randomUUID(),userID:recipient,epochID:re,afterFile:null},row={attachment_id:randomUUID(),home_id:home,home_instance_id:randomUUID(),product_id:product,size_bytes:'12',mime:'application/pdf',file_state:'stored',write_state:'settled',removal_pending:false,metadata_digest:'a'.repeat(64)};
 for(const rows of [[row,row],[{...row,size_bytes:'9007199254740993'}],[{...row,home_id:null}],[{...row,object_path:'private'}],[{...row,write_state:'assumed'}],[{...row,metadata_digest:'client-approved'}],Array(52).fill(row)]){
  const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql){return {rows:sql.startsWith('select *')?rows:[]};}})});await assert.rejects(port.fileInventory(input,new AbortController().signal),/File inventory unconfirmed/);
 }
 let connected=false;const port=createClosureOperatorReview({connect:async()=>{connected=true;throw Error('not expected');}});await assert.rejects(port.fileInventory({...input,afterFile:'bad'},new AbortController().signal),/Scoped file review/);assert.equal(connected,false);
});

test('descriptor port rejects path, bucket, digest, subject and unexpected-field substitutions',async()=>{
 const fileID=randomUUID(),metadataDigest='a'.repeat(64),input={reviewRequestID:randomUUID(),userID:recipient,epochID:re,fileID,expectedMetadataDigest:metadataDigest};
 const file={attachmentID:fileID,uploaderID:owner,uploaderEpoch:oe,productID:product,homeID:home,homeInstanceID:randomUUID(),bucket:'ouchi-product-attachments',objectPath:`${owner}/${oe}/${fileID}.pdf`,sizeBytes:12,mime:'application/pdf',state:'reserved',writeState:'untracked',removalPending:false,sha256:null,expectedSHA256:null,subjectConfirmed:false};
 const receipt={metadataDigest,file,accountErasureConfirmed:false};
 for(const value of [{...receipt,metadataDigest:'b'.repeat(64)},{...receipt,accountErasureConfirmed:true},...[
  {objectPath:'../private-file'},{bucket:'other-app'},{subjectConfirmed:true},{sizeBytes:'12'},{homeInstanceID:null},{extra:'unexpected'},{sha256:'invented'}
 ].map(change=>({...receipt,file:{...file,...change}}))]){
  const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql){return {rows:sql.startsWith('select maintenance_private.read_closure_review_file')?[{receipt:value}]:[]};}})});
  await assert.rejects(port.readFile(input,new AbortController().signal),/Reviewed file unconfirmed/);
 }
});
