import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,other,os,rs,oe,re,home,product} from './fixtures/home-handoff-identifiers.mjs';
import {createClosureOperatorReview} from '../lib/closure-operator-review.mjs';
const submission='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(member=false){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const user=member?recipient:owner,session=member?rs:os,epoch=member?re:oe;
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const receipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[user,session,epoch,submission])).rows[0].receipt;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true)');
 const input={reviewRequestID:receipt.reviewRequestID,userID:user,epochID:epoch,afterKey:null};
 const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql,args){const result=await db.query(sql,args);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');return result;}})});
 return {db,input,port};
}
const inventory=(db,input)=>db.query('select * from maintenance_private.closure_review_field_inventory($1,$2,$3,$4)',[input.reviewRequestID,input.userID,input.epochID,input.afterKey]);
test('inventory scopes text fields to the reviewed home, caps previews and matches the full-field redaction fingerprint',async()=>{
 const {db,input,port}=await fixture();try{
  await db.query('update public.products set memo=$1 where id=$2',['日本語😀'.repeat(200),product]);
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',['cccccccc-cccc-4ccc-8ccc-cccccccccccc',other]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',['dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc','air','Unrelated private product']);
  const result=await port.inventory(input,new AbortController().signal);assert.equal(result.items.length,4);assert.equal(result.hasMore,false);assert.equal(result.nextCursor,null);assert.equal(result.consistentSnapshot,false);assert.equal(result.accountErasureConfirmed,false);
  assert.ok(result.items.every(row=>row.home_id===home));assert.equal(JSON.stringify(result).includes('Unrelated private product'),false);
  const memo=result.items.find(row=>row.field_name==='memo');assert.equal(memo.truncated,true);assert.equal(Array.from(memo.preview).length,512);
  const full=await port.readField({reviewRequestID:input.reviewRequestID,userID:input.userID,epochID:input.epochID,relation:memo.relation_name,recordID:memo.record_id,field:memo.field_name},new AbortController().signal);assert.equal(memo.content_digest,full.digest);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.items)&&Object.isFrozen(memo));
 }finally{await db.close();}
});
test('keyset pagination returns at most 50 items without duplicates and never changes completion state',async()=>{
 const {db,input,port}=await fixture();try{
  for(let i=1;i<=60;i++)await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`,home,'air',`Synthetic product ${i}`]);
  const signal=new AbortController().signal,first=await port.inventory(input,signal);assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.equal(first.nextCursor,first.items.at(-1).field_key);
  const last=await port.inventory({...input,afterKey:first.nextCursor},signal);assert.equal(last.items.length,13);assert.equal(last.hasMore,false);assert.equal(last.accountErasureConfirmed,false);
  const keys=[...first.items,...last.items].map(row=>row.field_key);assert.equal(new Set(keys).size,63);assert.deepEqual([...keys].sort(),keys);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);assert.equal((await db.query('select state from maintenance_private.account_closure_reviews')).rows[0].state,'review_required');
 }finally{await db.close();}
});
test('former members contribute no scope until operator confirmation, and revocation removes it from the next inventory read',async()=>{
 const {db,input,port}=await fixture(true);try{
  await db.query('delete from public.home_members where user_id=$1',[recipient]);const signal=new AbortController().signal;assert.equal((await port.inventory(input,signal)).items.length,0);
  const context={eventID:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',reviewRequestID:input.reviewRequestID,userID:recipient,epochID:re,homeID:home,action:'confirmed',evidenceDigest:'a'.repeat(64),confirmation:'CONFIRM_REVIEWED_LEGACY_CONTEXT'};
  await port.recordLegacyContext(context,signal);assert.equal((await port.inventory(input,signal)).items.length,3);
  await port.recordLegacyContext({...context,eventID:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',action:'revoked',confirmation:'REVOKE_LEGACY_CONTEXT'},signal);const last=await port.inventory(input,signal);assert.equal(last.items.length,0);assert.equal(last.accountErasureConfirmed,false);
 }finally{await db.close();}
});
test('wrong scope, revoked operators, cancelled requests, invalid cursors and ordinary browser or service roles are refused',async()=>{
 const {db,input}=await fixture();try{
  await db.exec('set role ouchi_closure_operator');await assert.rejects(inventory(db,{...input,userID:recipient}),/matching review/);await assert.rejects(inventory(db,{...input,afterKey:'invalid; drop table homes'}),/inventory cursor/);
  for(const role of ['anon','authenticated','service_role']){await db.exec('reset role;set role '+role);await assert.rejects(inventory(db,input),/permission denied/);}
  await db.exec('reset role;update maintenance_private.closure_operator_principals set enabled=false;set role ouchi_closure_operator');await assert.rejects(inventory(db,input),/Authorized operator/);
  await db.exec('reset role;update maintenance_private.closure_operator_principals set enabled=true;set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[owner,os,oe,submission]);await db.exec('reset role;set role ouchi_closure_operator');await assert.rejects(inventory(db,input),/matching review/);
 }finally{await db.close();}
});
test('the private inventory port rejects malformed, overlong, unordered or oversized responses before acknowledging a page',async()=>{
 const row={home_id:home,relation_name:'products',record_id:product,field_name:'name',field_key:`products:${product}:name`,preview:'Synthetic',content_digest:'a'.repeat(64),truncated:false};
 for(const rows of [[...Array(52)].map(()=>row),[row,row],[{...row,preview:'あ'.repeat(513)}],[{...row,field_name:'owner_id'}],[{...row,truncated:'false'}],[{...row,content_digest:'client-approved'}],[{...row,secret:'unexpected'}]]){
  const port=createClosureOperatorReview({connect:async()=>({abort(){},async close(){},async query(sql){return {rows:sql.startsWith('select *')?rows:[]};}})});
  await assert.rejects(port.inventory({reviewRequestID:submission,userID:owner,epochID:oe,afterKey:null},new AbortController().signal),/inventory unconfirmed/);
 }
 let connections=0;const port=createClosureOperatorReview({connect:async()=>{connections++;throw Error('must not connect');}});
 await assert.rejects(port.inventory({reviewRequestID:submission,userID:owner,epochID:oe,afterKey:'invalid'},new AbortController().signal),/inventory cursor/);assert.equal(connections,0);
 const stop=new AbortController();stop.abort();await assert.rejects(port.inventory({reviewRequestID:submission,userID:owner,epochID:oe,afterKey:null},stop.signal));assert.equal(connections,0);
});
