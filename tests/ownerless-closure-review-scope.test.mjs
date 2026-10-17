import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,product,rs,re} from './fixtures/home-handoff-identifiers.mjs';
const event='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',submission='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016143928_ouchi_ownerless_closure_review_scope.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.query('update public.homes set owner_id=null where id=$1',[home]);
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const receipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[recipient,rs,re,submission])).rows[0].receipt;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true);set role ouchi_closure_operator');
 return {db,receipt};
}
const scope=r=>[r.reviewRequestID,recipient,re,'products',product,'name'];
const read=(db,r)=>db.query('select maintenance_private.read_closure_redaction_field($1,$2,$3,$4,$5,$6) snapshot',scope(r));
const context=(db,r,action='confirmed',id=event)=>db.query('select maintenance_private.record_closure_legacy_home_context($1,$2,$3,$4,$5,$6,$7)',[id,r.reviewRequestID,recipient,re,home,action,'a'.repeat(64)]);
test('current member in an ownerless home remains reviewable; leaving revokes access without deleting family records',async()=>{
 const {db,receipt}=await fixture();try{
  assert.equal((await read(db,receipt)).rows[0].snapshot.value,'Synthetic product');
  await db.exec('reset role');await db.query('delete from public.home_members where user_id=$1',[recipient]);await db.exec('set role ouchi_closure_operator');
  await assert.rejects(read(db,receipt),/Scoped record unavailable/);
  await db.exec('reset role');assert.equal((await db.query('select name from public.products where id=$1',[product])).rows[0].name,'Synthetic product');
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
 }finally{await db.close();}
});
test('former member requires current reviewed context even when owner is NULL; revoked context cannot authorize read or redaction',async()=>{
 const {db,receipt}=await fixture();try{
  await db.exec('reset role');await db.query('delete from public.home_members where user_id=$1',[recipient]);await db.exec('set role ouchi_closure_operator');
  await assert.rejects(read(db,receipt),/Scoped record unavailable/);
  await context(db,receipt);const field=(await read(db,receipt)).rows[0].snapshot;
  await context(db,receipt,'revoked','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  await assert.rejects(read(db,receipt),/Scoped record unavailable/);
  await assert.rejects(db.query('select maintenance_private.redact_closure_reviewed_field($1,$2,$3,$4,$5,$6,$7,$8,$9)',[submission,...scope(receipt),field.digest,'Reviewed replacement']),/Scoped record unavailable/);
  await context(db,receipt);await assert.rejects(read(db,receipt),/Scoped record unavailable/);
  await db.exec('reset role');assert.equal((await db.query('select name from public.products where id=$1',[product])).rows[0].name,'Synthetic product');
 }finally{await db.close();}
});
test('home UUID reuse cannot revive the old ownerless review context',async()=>{
 const {db,receipt}=await fixture();try{
  await context(db,receipt);await db.exec('reset role');await db.query('delete from public.home_members where user_id=$1',[recipient]);await db.query('delete from public.homes where id=$1',[home]);
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner]);await db.query('update public.homes set owner_id=null where id=$1',[home]);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Unrelated replacement']);await db.exec('set role ouchi_closure_operator');
  await assert.rejects(read(db,receipt),/Scoped record unavailable/);await context(db,receipt);await assert.rejects(read(db,receipt),/Scoped record unavailable/);
 }finally{await db.close();}
});
