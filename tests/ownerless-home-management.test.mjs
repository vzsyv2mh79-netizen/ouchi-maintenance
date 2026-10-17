import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,other,home,product,request,os,rs,oe,re} from './fixtures/home-handoff-identifiers.mjs';
import {createOwnerlessHomeManagement} from '../lib/ownerless-home-management.mjs';
const claimID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',nextID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const thirdSession='dddddddd-dddd-4ddd-8ddd-dddddddddddd',thirdEpoch='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const additions=['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016131437_ouchi_ownerless_home_management.sql'];
async function fixture(detach=true){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of additions)await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[thirdSession,other]);
 await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[other,thirdEpoch]);
 await db.query('insert into maintenance_private.account_access values($1,true)',[other]);
 await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[thirdSession,other,thirdEpoch]);
 if(detach)await db.query('update public.homes set owner_id=null where id=$1',[home]);
 const generation=(await db.query('select generation from maintenance_private.ownerless_home_generations where home_id=$1',[home])).rows[0]?.generation;
 return {db,generation};
}
async function enabled(db){await db.exec('reset role;update maintenance_private.ownerless_home_policy set enabled=true;set role service_role');}
const claim=(db,generation,id=claimID,user=recipient,session=rs,epoch=re)=>db.query('select maintenance_private.claim_ownerless_home($1,$2,$3,$4,$5,$6) receipt',[id,home,generation,user,session,epoch]);
async function authenticated(db,user=recipient,session=rs){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session,role:'authenticated'})]);await db.exec('set role authenticated');}
test('migration starts disabled and does not detach, delete or transfer an existing home',async()=>{
 const {db}=await fixture(false);try{
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_generations')).rows[0].n,0);
  assert.equal((await db.query('select enabled from maintenance_private.ownerless_home_policy')).rows[0].enabled,false);
  await db.exec('set role service_role');await assert.rejects(claim(db,nextID),/claim unavailable/);
 }finally{await db.close();}
});
test('remaining member keeps records and completion after old owner closes; strangers, new invitations and shared home deletion remain refused',async()=>{
 const {db}=await fixture();try{
  await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
  await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
  await authenticated(db);
  assert.equal((await db.query('select count(*)::int n from public.products')).rows[0].n,1);
  await db.query('update public.products set memo=$1 where id=$2',['Family edit after retirement',product]);
  await db.query('select public.complete_maintenance($1)',[request]);
  assert.equal((await db.query('select count(*)::int n from public.maintenance_history')).rows[0].n,1);
  await assert.rejects(db.query('select public.create_home_invite($1)',[home]),/Home unavailable/);
  await db.exec('reset role');await assert.rejects(db.query('delete from public.homes where id=$1',[home]),/Family handoff required/);
  assert.equal((await db.query('select maintenance_private.participates_in_other_home($1) yes',[recipient])).rows[0].yes,true);
  await authenticated(db,other,thirdSession);assert.equal((await db.query('select count(*)::int n from public.products')).rows[0].n,0);
  assert.equal((await db.query('update public.homes set owner_id=$1 where id=$2 returning id',[other,home])).rows.length,0);
  await authenticated(db,owner,os);assert.equal((await db.query('select count(*)::int n from public.products')).rows[0].n,0);
 }finally{await db.close();}
});
test('only existing family can claim; exact retry preserves later edits and does not transfer purchase rights',async()=>{
 const {db,generation}=await fixture();try{
  await enabled(db);await assert.rejects(claim(db,generation,nextID,other,thirdSession,thirdEpoch),/Existing family membership required/);
  const receipt=(await claim(db,generation)).rows[0].receipt;assert.equal(receipt.state,'claimed');
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  await authenticated(db);await db.query('update public.products set memo=$1 where id=$2',['Later family edit',product]);await db.exec('reset role;set role service_role');
  assert.deepEqual((await claim(db,generation)).rows[0].receipt,receipt);
  assert.equal((await db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'Later family edit');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.transaction_ownership')).rows[0].n,0);
  await assert.rejects(claim(db,generation,nextID),/Management state changed/);
  await authenticated(db);assert.ok((await db.query('select public.create_home_invite($1) token',[home])).rows[0].token);
 }finally{await db.close();}
});
test('stale generation and reused receipt cannot reclaim a later retirement period even for the same member',async()=>{
 const {db,generation}=await fixture();try{
  await enabled(db);await claim(db,generation);
  await db.query('update public.homes set owner_id=null where id=$1',[home]);
  const current=(await db.query('select generation from maintenance_private.ownerless_home_generations where home_id=$1',[home])).rows[0].generation;
  assert.notEqual(current,generation);assert.equal((await claim(db,generation)).rows[0].receipt.state,'superseded');
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
  await assert.rejects(claim(db,current),/event conflict/);
  await assert.rejects(claim(db,generation,nextID),/Management state changed/);
  await claim(db,current,nextID);assert.equal((await claim(db,generation)).rows[0].receipt.state,'superseded');
 }finally{await db.close();}
});
test('withdrawn membership, expired session, wrong epoch and closure review deny claims without changing ownership',async()=>{
 const {db,generation}=await fixture();try{
  await enabled(db);await assert.rejects(claim(db,generation,claimID,recipient,rs,oe),/matching app session/);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[rs]);await db.exec('set role service_role');
  await assert.rejects(claim(db,generation),/matching app session/);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=null where id=$1',[rs]);await db.query('delete from public.home_members where user_id=$1',[recipient]);await db.exec('set role service_role');await assert.rejects(claim(db,generation),/Existing family membership required/);
  await db.exec('reset role');await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[recipient,re,nextID]);await db.exec('set role service_role');await assert.rejects(claim(db,generation),/retirement pending/);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
 }finally{await db.close();}
});
test('ordinary clients cannot read private claims, enable policy or call backend-only mutation',async()=>{
 const {db,generation}=await fixture();try{
  for(const role of ['anon','authenticated','ouchi_closure_operator']){
   await db.exec('set role '+role);await assert.rejects(claim(db,generation),/permission denied/);
   await assert.rejects(db.query('select * from maintenance_private.ownerless_home_claims'),/permission denied/);
   await assert.rejects(db.query('update maintenance_private.ownerless_home_policy set enabled=true'),/permission denied/);await db.exec('reset role');
  }
  await db.exec('set role service_role');await assert.rejects(db.query('update maintenance_private.ownerless_home_policy set enabled=true'),/permission denied/);
 }finally{await db.close();}
});
test('legacy shared-controller routes refuse explicitly; home UUID reuse cannot recover an old claim receipt',async()=>{
 const {db,generation}=await fixture();try{
  await enabled(db);await db.exec('reset role;create table maintenance_private.household_write_routes(id uuid);set role service_role');
  await assert.rejects(claim(db,generation),/Shared retirement integration unavailable/);
  await db.exec('reset role;drop table maintenance_private.household_write_routes;set role service_role');await claim(db,generation);
  await db.exec('reset role');await db.query('delete from public.home_members where "homeId"=$1',[home]);await db.query('delete from public.homes where id=$1',[home]);
  await db.query('insert into public.homes(id,owner_id) values($1,null)',[home]);await db.exec('set role service_role');
  await assert.rejects(claim(db,generation),/event conflict/);
 }finally{await db.close();}
});
function identity(){const now=Date.now();return {userID:recipient,sessionID:rs,epochID:re,aal:'aal1',authenticatedAt:now-1000,checkedAt:now,authStateDigest:'a'.repeat(64)};}
function port(db,verifyIdentity,options={}){return createOwnerlessHomeManagement({verifyIdentity,connect:async()=>({abort(){},async close(){},async query(sql,args){const result=await db.query(sql,args);if(sql==='COMMIT'&&options.loseCommit){options.loseCommit=false;throw Error('commit acknowledgement lost');}return result;}})});}
const input=generation=>({requestID:claimID,homeID:home,generation,epochID:re,confirmation:'CLAIM_HOME_MANAGEMENT'});
test('same-transaction adapter rolls ownership and receipt back when final identity changes',async()=>{
 const {db,generation}=await fixture();try{
  await enabled(db);let calls=0;const initial=identity();
  const runtime=port(db,async()=>++calls===1?initial:{...initial,authStateDigest:'b'.repeat(64)});
  await assert.rejects(runtime.claim(input(generation),'synthetic-bearer',new AbortController().signal),/identity changed/);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,0);
 }finally{await db.close();}
});
test('lost commit acknowledgement recovers exact claim without overwriting family edits',async()=>{
 const {db,generation}=await fixture();try{
  await enabled(db);const initial=identity(),options={loseCommit:true},runtime=port(db,async()=>initial,options),signal=new AbortController().signal;
  await assert.rejects(runtime.claim(input(generation),'synthetic-bearer',signal),/acknowledgement lost/);
  await authenticated(db);await db.query('update public.products set memo=$1 where id=$2',['After committed claim',product]);await db.exec('reset role;set role service_role');
  assert.equal((await runtime.claim(input(generation),'synthetic-bearer',signal)).state,'claimed');
  assert.equal((await db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'After committed claim');
 }finally{await db.close();}
});
test('adapter rejects invented identity fields, stale authentication and unconfirmed mutation receipts',async()=>{
 let connects=0;const runtime=createOwnerlessHomeManagement({connect:async()=>{connects++;throw Error('must not connect');},verifyIdentity:async()=>identity()});
 await assert.rejects(runtime.claim({...input(nextID),userID:owner},'synthetic-bearer',new AbortController().signal),/Explicit management/);assert.equal(connects,0);
 for(const changed of [{authenticatedAt:1},{aal:'admin'},{authStateDigest:'client-flag'}]){
  const {db,generation}=await fixture();try{await enabled(db);await assert.rejects(port(db,async()=>({...identity(),...changed})).claim(input(generation),'synthetic-bearer',new AbortController().signal),/Recent verified/);}finally{await db.close();}
 }
 const initial=identity(),valid={kind:'ownerless-home-claim/v1',requestID:claimID,homeID:home,generation:nextID,epochID:re,state:'claimed'};
 for(const patch of [{epochID:oe},{state:'purchased'},{homeID:product},{extra:'unconfirmed'}]){
  const sql=[];const candidate=createOwnerlessHomeManagement({verifyIdentity:async()=>initial,connect:async()=>({abort(){},async close(){},async query(query){sql.push(query);return {rows:query.startsWith('select maintenance_private')?[{receipt:{...valid,...patch}}]:[]};}})});
  await assert.rejects(candidate.claim(input(nextID),'synthetic-bearer',new AbortController().signal),/result unconfirmed/);
  assert.equal(sql.includes('ROLLBACK'),true);assert.equal(sql.includes('COMMIT'),false);
 }
});
