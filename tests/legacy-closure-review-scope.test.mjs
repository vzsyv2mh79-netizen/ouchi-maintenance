import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,other,rs,re,home,product} from './fixtures/home-handoff-identifiers.mjs';
const event='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',submission='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.query('delete from public.home_members where user_id=$1',[recipient]);
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const receipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,submission])).rows[0].receipt;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true);set role ouchi_closure_operator');return {db,receipt};
}
const scope=r=>[r.reviewRequestID,recipient,re,'products',product,'name'];
const field=(db,r)=>db.query('select maintenance_private.read_closure_redaction_field($1,$2,$3,$4,$5,$6) snapshot',scope(r));
const context=(db,r,action='confirmed',id=event,targetHome=home)=>db.query('select maintenance_private.record_closure_legacy_home_context($1,$2,$3,$4,$5,$6,$7) event',[id,r.reviewRequestID,recipient,re,targetHome,action,'a'.repeat(64)]);
test('former member may request/read review with no home access; private context does not grant household access or imply erasure',async()=>{
 const {db,receipt}=await fixture();try{
  assert.equal(receipt.state,'review_required');await assert.rejects(field(db,receipt),/Scoped record unavailable/);
  await context(db,receipt);assert.equal((await field(db,receipt)).rows[0].snapshot.value,'Synthetic product');
  await db.exec('reset role;set role service_role');const recovered=(await db.query('select public.read_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,submission])).rows[0].receipt;assert.deepEqual(recovered,receipt);
  await assert.rejects(db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[recipient,rs,re]),/Family review required/);
  await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:recipient})]);
  assert.equal((await db.query('select count(*)::int n from public.products')).rows[0].n,0);
  await assert.rejects(field(db,receipt),/permission denied/);await assert.rejects(context(db,receipt),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.home_members where user_id=$1',[recipient])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
test('revocation is current and replaying an old confirmation does not restore access',async()=>{
 const {db,receipt}=await fixture();try{
  await context(db,receipt);await context(db,receipt,'revoked','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  await assert.rejects(field(db,receipt),/Scoped record unavailable/);
  await context(db,receipt);await assert.rejects(field(db,receipt),/Scoped record unavailable/);
  await assert.rejects(context(db,receipt,'revoked',event),/event conflict/);
 }finally{await db.close();}
});
test('deleting and recreating a home and product with reused UUIDs never revives the old investigation scope',async()=>{
 const {db,receipt}=await fixture();try{
  await context(db,receipt);await db.exec('reset role');
  const old=(await db.query('select instance_id from maintenance_private.closure_home_instances where home_id=$1',[home])).rows[0].instance_id;
  await db.query('delete from public.homes where id=$1',[home]);await db.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','New unrelated product']);
  const fresh=(await db.query('select instance_id from maintenance_private.closure_home_instances where home_id=$1',[home])).rows[0].instance_id;assert.notEqual(fresh,old);
  await db.exec('set role ouchi_closure_operator');await assert.rejects(field(db,receipt),/Scoped record unavailable/);
  await context(db,receipt);await assert.rejects(field(db,receipt),/Scoped record unavailable/);
 }finally{await db.close();}
});
test('context is exact to the review, epoch and home; disabled operators and ordinary service connections cannot bind it',async()=>{
 const {db,receipt}=await fixture();try{
  await context(db,receipt);await db.exec('reset role');const otherHome='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';const otherProduct='ffffffff-ffff-4fff-8fff-ffffffffffff';
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[otherHome,other]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[otherProduct,otherHome,'air','Other home product']);await db.exec('set role ouchi_closure_operator');
  const values=scope(receipt);values[4]=otherProduct;await assert.rejects(db.query('select maintenance_private.read_closure_redaction_field($1,$2,$3,$4,$5,$6)',values),/Scoped record unavailable/);
  await db.exec('reset role;update maintenance_private.closure_operator_principals set enabled=false;set role ouchi_closure_operator');await assert.rejects(context(db,receipt),/Authorized operator/);
  for(const role of ['anon','authenticated','service_role']){await db.exec('reset role;set role '+role);await assert.rejects(context(db,receipt),/permission denied/);await assert.rejects(db.query('select * from maintenance_private.closure_home_instances'),/permission denied/);}
  await db.exec('reset role;update maintenance_private.closure_operator_principals set enabled=true');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[recipient]);await db.exec('set role ouchi_closure_operator');await assert.rejects(context(db,receipt),/matching enrollment/);await assert.rejects(field(db,receipt),/matching enrollment/);
 }finally{await db.close();}
});
test('review cancellation prevents new context and field access, even after an operator confirmed the context',async()=>{
 const {db,receipt}=await fixture();try{
  await context(db,receipt);await db.exec('reset role;set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[recipient,rs,re,submission]);await db.exec('reset role;set role ouchi_closure_operator');
  await assert.rejects(context(db,receipt),/matching review/);await assert.rejects(field(db,receipt),/matching review/);
 }finally{await db.close();}
});
test('private port requires explicit reviewed context and retries a committed event without reactivating a revoked context',async()=>{
 const {createClosureOperatorReview}=await import('../lib/closure-operator-review.mjs');const {db,receipt}=await fixture();try{
  await db.exec('reset role');let lost=false,connections=0;
  const port=createClosureOperatorReview({connect:async()=>{connections++;return {abort(){},async close(){},async query(sql,values){const result=await db.query(sql,values);if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');if(sql==='COMMIT'&&lost){lost=false;throw Error('commit acknowledgement lost');}return result;}};}});
  const input={eventID:event,reviewRequestID:receipt.reviewRequestID,userID:recipient,epochID:re,homeID:home,action:'confirmed',evidenceDigest:'a'.repeat(64),confirmation:'CONFIRM_REVIEWED_LEGACY_CONTEXT'},signal=new AbortController().signal;
  await assert.rejects(port.recordLegacyContext({...input,confirmation:'YES'},signal),/Explicit reviewed/);assert.equal(connections,0);
  lost=true;await assert.rejects(port.recordLegacyContext(input,signal),/acknowledgement lost/);assert.equal(connections,1);
  await port.recordLegacyContext({...input,eventID:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',action:'revoked',confirmation:'REVOKE_LEGACY_CONTEXT'},signal);
  assert.deepEqual(await port.recordLegacyContext(input,signal),{eventID:event,state:'legacy_context_recorded',accountErasureConfirmed:false});
  await db.exec('set role ouchi_closure_operator');await assert.rejects(field(db,receipt),/Scoped record unavailable/);
 }finally{await db.close();}
});
test('home instance tracking preserves ordinary authenticated home creation and deletion without exposing private metadata',async()=>{
 const {db}=await fixture();try{
  await db.exec('reset role');const epoch='dddddddd-dddd-4ddd-8ddd-dddddddddddd',newHome='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',session='10101010-1010-4010-8010-101010101010';
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[other,epoch]);await db.query('insert into maintenance_private.account_access values($1,true)',[other]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,other]);await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[session,other,epoch]);
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:other,session_id:session})]);
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[newHome,other]);
  await assert.rejects(db.query('select * from maintenance_private.closure_home_instances'),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_home_instances where home_id=$1',[newHome])).rows[0].n,1);
  await db.exec('set role authenticated');await db.query('delete from public.homes where id=$1',[newHome]);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_home_instances where home_id=$1',[newHome])).rows[0].n,0);
 }finally{await db.close();}
});
