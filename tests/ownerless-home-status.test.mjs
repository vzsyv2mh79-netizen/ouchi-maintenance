import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,os,rs,oe,re} from './fixtures/home-handoff-identifiers.mjs';
import {createOwnerlessHomeManagement} from '../lib/ownerless-home-management.mjs';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016132410_ouchi_ownerless_management_status.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const identity={userID:recipient,sessionID:rs,epochID:re};
 const port=createOwnerlessHomeManagement({verifyCurrent:async()=>identity,verifyIdentity:async()=>{throw Error('Reads must not require a new authentication event');},connect:async()=>({abort(){},async close(){},query:(sql,args)=>db.query(sql,args)})});
 return {db,port};
}
test('status follows actual ownerless state and policy, without granting a client flag authority',async()=>{
 const {db,port}=await fixture();try{
  await db.exec('set role service_role');const input={homeID:home,epochID:re},signal=new AbortController().signal;
  const managed=await port.readStatus(input,'synthetic',signal);assert.equal(managed.state,'managed');assert.equal(managed.generation,null);assert.equal(managed.canClaim,false);
  await db.query('update public.homes set owner_id=null where id=$1',[home]);
  const disabled=await port.readStatus(input,'synthetic',signal);assert.equal(disabled.state,'awaiting_management');assert.equal(disabled.canClaim,false);
  await db.exec('reset role;update maintenance_private.ownerless_home_policy set enabled=true;set role service_role');
  assert.equal((await port.readStatus(input,'synthetic',signal)).canClaim,true);
  await db.exec('reset role;create table maintenance_private.household_write_routes(id uuid);set role service_role');
  assert.equal((await port.readStatus(input,'synthetic',signal)).canClaim,false);
  await assert.rejects(port.readStatus({...input,userID:owner},'synthetic',signal),/Scoped management read/);
 }finally{await db.close();}
});
test('unknown claim lookup is read only; existing receipt is account/epoch/generation scoped and detects supersession',async()=>{
 const {db,port}=await fixture();try{
  await db.query('update public.homes set owner_id=null where id=$1',[home]);
  const generation=(await db.query('select generation from maintenance_private.ownerless_home_generations where home_id=$1',[home])).rows[0].generation;
  await db.exec('update maintenance_private.ownerless_home_policy set enabled=true;set role service_role');
  const input={homeID:home,epochID:re,generation,requestID:id},signal=new AbortController().signal;
  assert.equal((await port.readClaim(input,'synthetic',signal)).state,'not_recorded');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,0);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
  await db.query('select maintenance_private.claim_ownerless_home($1,$2,$3,$4,$5,$6)',[id,home,generation,recipient,rs,re]);
  assert.equal((await port.readClaim(input,'synthetic',signal)).state,'claimed');
  const wrong=(await db.query('select maintenance_private.read_ownerless_home_claim($1,$2,$3,$4,$5,$6) receipt',[id,home,generation,owner,os,oe])).rows[0].receipt;assert.equal(wrong.state,'not_recorded');
  await db.query('update public.homes set owner_id=null where id=$1',[home]);
  assert.equal((await port.readClaim(input,'synthetic',signal)).state,'superseded');
  await db.exec('reset role;update maintenance_private.ownerless_home_policy set enabled=false;set role service_role');
  assert.equal((await port.readClaim(input,'synthetic',signal)).state,'superseded');
 }finally{await db.close();}
});
test('read paths require live scope and membership; ordinary clients cannot call private functions',async()=>{
 const {db,port}=await fixture();try{
  await db.query('delete from public.home_members where user_id=$1',[recipient]);await db.exec('set role service_role');
  await assert.rejects(port.readStatus({homeID:home,epochID:re},'synthetic',new AbortController().signal),/Existing family membership/);
  await assert.rejects(db.query('select maintenance_private.read_ownerless_home_status($1,$2,$3,$4)',[home,recipient,rs,oe]),/matching app session/);
  for(const role of ['anon','authenticated','ouchi_closure_operator']){
   await db.exec('reset role;set role '+role);await assert.rejects(db.query('select maintenance_private.read_ownerless_home_status($1,$2,$3,$4)',[home,recipient,rs,re]),/permission denied/);
   await assert.rejects(db.query('select maintenance_private.read_ownerless_home_claim($1,$2,$3,$4,$5,$6)',[id,home,id,recipient,rs,re]),/permission denied/);
  }
 }finally{await db.close();}
});
