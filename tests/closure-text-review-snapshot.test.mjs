import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,os,rs,oe,re,home,product} from './fixtures/home-handoff-identifiers.mjs';
import {createClosureOperatorReview} from '../lib/closure-operator-review.mjs';
const submission='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',plan='cccccccc-cccc-4ccc-8ccc-cccccccccccc',next='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
async function fixture(member=false){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql','20261016123247_ouchi_closure_text_review_snapshot.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const user=member?recipient:owner,session=member?rs:os,epoch=member?re:oe;
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');const receipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[user,session,epoch,submission])).rows[0].receipt;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true)');
 const scope={planID:plan,reviewRequestID:receipt.reviewRequestID,userID:user,epochID:epoch};
 const capture={...scope,replacesPlanID:null,confirmation:'CAPTURE_REVIEW_TEXT_SNAPSHOT'};
 return {db,scope,capture};
}
function portFor(db,options={}){return createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql,args){const result=await db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');if(sql==='COMMIT'&&options.loseCommit){options.loseCommit=false;throw Error('commit acknowledgement lost');}return result;}})});}
test('capture persists one coherent text inventory of identifiers and hashes without copying original text or authorizing erasure',async()=>{
 const {db,scope,capture}=await fixture();try{
  await db.query('update public.products set memo=$1 where id=$2',['Synthetic private phrase',product]);const port=portFor(db),signal=new AbortController().signal;
  const receipt=await port.captureTextSnapshot(capture,signal);assert.equal(receipt.itemCount,4);assert.equal(receipt.state,'open');assert.equal(receipt.accountErasureConfirmed,false);
  const current=await port.readTextSnapshot(scope,signal);assert.equal(current.needsNewSnapshot,false);assert.equal(current.accountErasureConfirmed,false);
  const stored=(await db.query('select * from maintenance_private.closure_text_snapshot_items')).rows;assert.equal(stored.length,4);assert.equal(JSON.stringify(stored).includes('Synthetic private phrase'),false);assert.equal(JSON.stringify(stored).includes('わが家'),false);
  const inventory=await port.inventory({reviewRequestID:scope.reviewRequestID,userID:scope.userID,epochID:scope.epochID,afterKey:null},signal);
  for(const item of stored)assert.equal(item.content_digest,inventory.items.find(row=>row.field_key===item.field_key).content_digest);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
test('family additions and edits invalidate the observation; replay does not recapture, and replacement must name the current plan',async()=>{
 const {db,scope,capture}=await fixture();try{
  const port=portFor(db),signal=new AbortController().signal;await port.captureTextSnapshot(capture,signal);
  await db.query('update public.products set memo=$1 where id=$2',['New family text',product]);assert.equal((await port.readTextSnapshot(scope,signal)).needsNewSnapshot,true);
  assert.equal((await port.captureTextSnapshot(capture,signal)).itemCount,3);assert.equal((await port.readTextSnapshot(scope,signal)).needsNewSnapshot,true);
  await assert.rejects(port.captureTextSnapshot({...capture,planID:next},signal),/explicitly replaced/);
  const replacement={...capture,planID:next,replacesPlanID:plan,confirmation:'REPLACE_REVIEW_TEXT_SNAPSHOT'};
  assert.equal((await port.captureTextSnapshot(replacement,signal)).itemCount,4);
  const current=await port.readTextSnapshot({...scope,planID:next},signal);assert.equal(current.needsNewSnapshot,false);
  const old=await port.readTextSnapshot(scope,signal);assert.equal(old.state,'superseded');assert.equal(old.needsNewSnapshot,true);
  assert.equal((await port.captureTextSnapshot(capture,signal)).state,'superseded');
  await assert.rejects(port.captureTextSnapshot({...replacement,replacesPlanID:null,confirmation:'CAPTURE_REVIEW_TEXT_SNAPSHOT'},signal),/event conflict/);
 }finally{await db.close();}
});
test('revoking a legacy investigation scope invalidates the snapshot even when the original family text still exists',async()=>{
 const {db,scope,capture}=await fixture(true);try{
  await db.query('delete from public.home_members where user_id=$1',[recipient]);const port=portFor(db),signal=new AbortController().signal;
  const context={eventID:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',reviewRequestID:scope.reviewRequestID,userID:recipient,epochID:re,homeID:home,action:'confirmed',evidenceDigest:'a'.repeat(64),confirmation:'CONFIRM_REVIEWED_LEGACY_CONTEXT'};
  await port.recordLegacyContext(context,signal);await port.captureTextSnapshot(capture,signal);
  await port.recordLegacyContext({...context,eventID:'ffffffff-ffff-4fff-8fff-ffffffffffff',action:'revoked',confirmation:'REVOKE_LEGACY_CONTEXT'},signal);
  assert.equal((await port.readTextSnapshot(scope,signal)).needsNewSnapshot,true);assert.equal((await db.query('select count(*)::int n from public.products')).rows[0].n,1);
 }finally{await db.close();}
});
test('recreating a home with identical logical record IDs and text still requires a new snapshot',async()=>{
 const {db,scope,capture}=await fixture();try{
  const data={};for(const table of ['homes','products','maintenance_tasks','maintenance_history'])data[table]=(await db.query(`select to_jsonb(t) value from public.${table} t`)).rows.map(row=>row.value);
  const port=portFor(db),signal=new AbortController().signal;await port.captureTextSnapshot(capture,signal);
  await db.query('delete from public.home_members where "homeId"=$1',[home]);await db.query('delete from public.homes where id=$1',[home]);
  for(const [table,rows] of Object.entries(data))for(const row of rows)await db.query(`insert into public.${table} select * from jsonb_populate_record(null::public.${table},$1::jsonb)`,[JSON.stringify(row)]);
  const current=await port.readTextSnapshot(scope,signal);assert.equal(current.itemCount,3);assert.equal(current.needsNewSnapshot,true);
 }finally{await db.close();}
});
test('ordinary roles cannot capture or read private plans; cancellation and enrollment changes refuse the current operator',async()=>{
 const {db,scope,capture}=await fixture();try{
  const port=portFor(db),signal=new AbortController().signal;await port.captureTextSnapshot(capture,signal);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){
   await db.exec('set role '+role);await assert.rejects(db.query('select * from maintenance_private.closure_text_snapshot_items'),/permission denied/);await assert.rejects(db.query('select * from maintenance_private.closure_review_text_fields($1,$2,$3)',[scope.reviewRequestID,owner,oe]),/permission denied/);
   if(role!=='ouchi_closure_operator')await assert.rejects(db.query('select maintenance_private.read_closure_text_snapshot($1,$2,$3,$4)',[plan,scope.reviewRequestID,owner,oe]),/permission denied/);
   await db.exec('reset role');
  }
  await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);await assert.rejects(port.readTextSnapshot(scope,signal),/matching enrollment/);
  await db.query('update maintenance_private.app_epochs set enabled=true where user_id=$1',[owner]);await db.exec('set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[owner,os,oe,submission]);await db.exec('reset role');await assert.rejects(port.readTextSnapshot(scope,signal),/matching review/);
 }finally{await db.close();}
});
test('lost commit acknowledgement recovers the original plan without including later edits or silently superseding it',async()=>{
 const {db,scope,capture}=await fixture();try{
  const options={loseCommit:true},port=portFor(db,options),signal=new AbortController().signal;await assert.rejects(port.captureTextSnapshot(capture,signal),/acknowledgement lost/);
  await db.query('update public.products set memo=$1 where id=$2',['Changed after commit',product]);
  assert.equal((await port.captureTextSnapshot(capture,signal)).itemCount,3);assert.equal((await port.readTextSnapshot(scope,signal)).needsNewSnapshot,true);assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_text_snapshots')).rows[0].n,1);
  await db.query('delete from maintenance_private.closure_text_snapshot_items where plan_id=$1',[plan]);
  await db.query('update public.products set memo=null where id=$1',[product]);assert.equal((await port.readTextSnapshot(scope,signal)).needsNewSnapshot,true);
 }finally{await db.close();}
});
test('the shared live-field relation preserves bounded inventory pagination after snapshot capture',async()=>{
 const {db,scope,capture}=await fixture();try{
  for(let i=1;i<=60;i++)await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`,home,'air',`Synthetic snapshot product ${i}`]);
  const port=portFor(db),signal=new AbortController().signal;assert.equal((await port.captureTextSnapshot(capture,signal)).itemCount,63);
  const input={reviewRequestID:scope.reviewRequestID,userID:scope.userID,epochID:scope.epochID,afterKey:null};const first=await port.inventory(input,signal);assert.equal(first.items.length,50);assert.equal(first.hasMore,true);
  const last=await port.inventory({...input,afterKey:first.nextCursor},signal);assert.equal(last.items.length,13);assert.equal(last.hasMore,false);assert.equal(new Set([...first.items,...last.items].map(row=>row.field_key)).size,63);
 }finally{await db.close();}
});
test('snapshot transport rejects false completion, changed identities, malformed counts and invalid superseded observations',async()=>{
 const scope={planID:plan,reviewRequestID:submission,userID:owner,epochID:oe};
 const valid={kind:'closure-text-snapshot/v1',planID:plan,reviewRequestID:submission,epochID:oe,state:'open',itemCount:3,needsNewSnapshot:false,accountErasureConfirmed:false};
 for(const patch of [{accountErasureConfirmed:true},{itemCount:'3'},{itemCount:-1},{planID:next},{state:'superseded'},{needsNewSnapshot:'false'},{kind:'completed-account'}]){
  const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql){return {rows:sql.startsWith('select maintenance_private')?[{receipt:{...valid,...patch}}]:[]};}})});
  await assert.rejects(port.readTextSnapshot(scope,new AbortController().signal),/snapshot unconfirmed/);
 }
 let calls=0;const port=createClosureOperatorReview({connect:async()=>{calls++;throw Error('must not connect');}});
 await assert.rejects(port.captureTextSnapshot({...scope,replacesPlanID:null,confirmation:'YES'},new AbortController().signal),/Explicit text snapshot/);assert.equal(calls,0);
});
