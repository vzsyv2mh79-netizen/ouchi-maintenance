import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,os,rs,oe,re,request} from './fixtures/home-handoff-identifiers.mjs';
const modules=new Map();
function moduleURL(name){
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(dependency.endsWith('.mjs')?import.meta.resolve('../lib/'+dependency):moduleURL(dependency))}`);
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
}
const {createHomeManagementPrivateConnection}=await import(moduleURL('ownerless-home-management-private-connection'));
const {HOME_HANDOFF_SESSION_POLICY_SQL:policy,HOME_HANDOFF_AUTH_USER_PIN_SQL:pin,HOME_HANDOFF_AUTH_STATE_SQL:snapshot}=await import(moduleURL('home-handoff-identity'));
const status='select maintenance_private.read_ownerless_home_status($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt';
const claim='select maintenance_private.claim_ownerless_home($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) as receipt';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();
 await db.exec(`reset role;alter table auth.users add column email text;alter table auth.users add column encrypted_password text;
 alter table auth.sessions add column aal text default 'aal1';alter table auth.sessions add column refreshed_at timestamp;
 create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,secret text);`);
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261014061618_ouchi_closure_review_private_access.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016132410_ouchi_ownerless_management_status.sql','20261016142322_ouchi_home_management_private_access.sql','20261016143928_ouchi_ownerless_closure_review_scope.sql','20261016144216_ouchi_management_claim_erasure.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.query('update auth.users set email=$2,encrypted_password=$3 where id=$1',[recipient,'private@example.invalid','synthetic-password']);
 await db.query('insert into auth.mfa_factors values($1,$2,$3,$4)',[request,recipient,'unverified','synthetic-factor-secret']);
 return db;
}
async function bind(db,user=recipient,session=rs){await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false)",[JSON.stringify({sub:user,session_id:session}),user]);}
async function connection(db){return createHomeManagementPrivateConnection({connect:async()=>({query:(sql,args)=>db.query(sql,args),abort(){},async close(){}})})({signal:new AbortController().signal});}
test('management executor has no table, policy, retirement or closure-review access',async()=>{
 const db=await fixture();try{
  await bind(db);await db.exec('set role ouchi_home_management_executor');
  for(const sql of ['select * from auth.users','select * from auth.sessions','select * from public.products','update public.homes set owner_id=null','select * from maintenance_private.ownerless_home_claims','update maintenance_private.ownerless_home_policy set enabled=true','select * from maintenance_private.closure_review_auth_state(null)','select maintenance_private.claim_ownerless_home(null,null,null,null,null,null)'])await assert.rejects(db.query(sql),/permission denied/);
  const role=(await db.query('select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname=current_user')).rows[0];assert.ok(Object.values(role).every(value=>value===false));
  assert.equal((await db.query('select * from maintenance_private.home_management_session($1,$2,null,null)',[rs,recipient])).rows[0].epoch_id,re);
  await assert.rejects(db.query('select * from maintenance_private.home_management_session($1,$2,null,null)',[os,owner]),/Verified current management actor/);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from maintenance_private.home_management_auth_snapshot($1,$2)',[recipient,rs]),/permission denied/);}
 }finally{await db.close();}
});
test('snapshot contains only digests and detects credential and factor changes',async()=>{
 const db=await fixture();try{
  await bind(db);await db.exec('set role ouchi_home_management_executor');
  const read=async()=>(await db.query('select * from maintenance_private.home_management_auth_snapshot($1,$2)',[recipient,rs])).rows[0].auth_state;
  const before=await read();assert.deepEqual(Object.keys(before).sort(),['factorDigests','sessionDigest','userDigest']);
  for(const digest of [before.userDigest,before.sessionDigest,...before.factorDigests])assert.match(digest,/^[0-9a-f]{64}$/);
  assert.equal(/synthetic-|private@example/.test(JSON.stringify(before)),false);
  await db.exec('reset role');await db.query('update auth.users set encrypted_password=$2 where id=$1',[recipient,'changed-password']);await db.query('update auth.mfa_factors set secret=$2 where id=$1',[request,'changed-factor']);await db.exec('set role ouchi_home_management_executor');
  const after=await read();assert.notEqual(before.userDigest,after.userDigest);assert.notDeepEqual(before.factorDigests,after.factorDigests);assert.equal(before.sessionDigest,after.sessionDigest);
 }finally{await db.close();}
});
test('transport initializes only from verified session and refuses SQL and scope reuse',async()=>{
 const calls=[];const connect=createHomeManagementPrivateConnection({connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{epoch_id:re}]};},abort(){},async close(){}})});
 const c=await connect({signal:new AbortController().signal});await c.query('BEGIN');
 await assert.rejects(c.query(pin,[recipient]),/must initialize/);await assert.rejects(c.query('select * from auth.users',[]),/Unsupported/);
 await c.query(policy,[rs,recipient,null,null]);await c.query(pin,[recipient]);
 await assert.rejects(c.query(pin,[owner]),/Bound management actor/);
 await assert.rejects(c.query(policy,[os,recipient,null,null]),/Bound management actor/);
 await assert.rejects(c.query(status,[home,recipient,rs,oe]),/Bound management enrollment/);
 assert.equal(calls.filter(([sql])=>sql.includes('set_config')).length,1);
 assert.equal(calls.some(([sql])=>sql===pin||sql===policy),false);
 await c.query('COMMIT');await assert.rejects(c.query(pin,[recipient]),/Current management transaction/);
});
test('restricted SQL claims atomically, revokes old invites, preserves new invites on exact retry and restores legacy actor',async()=>{
 const db=await fixture();try{
  await db.exec("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$");
  await bind(db,owner,os);await db.query('update public.homes set owner_id=null where id=$1',[home]);await db.exec('update maintenance_private.ownerless_home_policy set enabled=true');
  await db.query('insert into public.home_invites("homeId",token_hash) values($1,$2)',[home,new Uint8Array([1])]);
  const family=(await db.query('select to_jsonb(m) value from public.home_members m')).rows;
  const c=await connection(db);await c.query('BEGIN');await c.query(policy,[rs,recipient,null,null]);
  assert.equal((await c.query(status,[home,recipient,rs,re])).rows[0].receipt.canClaim,true);
  const generation=(await c.query(status,[home,recipient,rs,re])).rows[0].receipt.generation;
  const args=[request,home,generation,recipient,rs,re];assert.equal((await c.query(claim,args)).rows[0].receipt.state,'claimed');await c.query('COMMIT');
  assert.equal((await db.query('select auth.uid() id')).rows[0].id,owner);
  assert.equal((await db.query('select revoked from public.home_invites')).rows[0].revoked,true);
  assert.deepEqual((await db.query('select to_jsonb(m) value from public.home_members m')).rows,family);
  await db.query('insert into public.home_invites("homeId",token_hash) values($1,$2)',[home,new Uint8Array([2])]);
  const retry=await connection(db);await retry.query('BEGIN');await retry.query(policy,[rs,recipient,null,null]);assert.equal((await retry.query(claim,args)).rows[0].receipt.state,'claimed');await retry.query('COMMIT');
  assert.equal((await db.query('select count(*)::int n from public.home_invites where not revoked')).rows[0].n,1);
  const s=await connection(db);await s.query('BEGIN');await s.query(policy,[rs,recipient,null,null]);assert.match((await s.query(snapshot,[recipient,rs])).rows[0].auth_state.userDigest,/^[0-9a-f]{64}$/);await s.query('ROLLBACK');
 }finally{await db.close();}
});

test('HTTP composition uses exact-bearer verifier and private SQL, and rolls back a claim when final Auth verification fails',async()=>{
 const db=await fixture();try{
  const {createHomeHandoffIdentityVerifier,createHomeHandoffInventoryIdentityVerifier}=await import(moduleURL('home-handoff-identity'));
  const {createOwnerlessHomeManagement}=await import('../lib/ownerless-home-management.mjs');
  const {ownerlessHomeManagementResponse}=await import('../lib/ownerless-home-management-handler.mjs');
  const projectID='abcdefghijklmnopqrst',currentPolicy={projectID,singleSession:false,timeboxSeconds:null,inactivitySeconds:null,totpVerify:true,phoneVerify:false,webAuthnVerify:false};
  const policyReader=Object.assign(async()=>currentPolicy,{isCurrent:p=>p===currentPolicy});
  const token=amr=>'e30.'+Buffer.from(JSON.stringify({sub:recipient,session_id:rs,exp:Math.floor(Date.now()/1000)+3600,aal:'aal1',amr})).toString('base64url')+'.c2ln';
  const bearer=token([{method:'password',timestamp:Math.floor(Date.now()/1000)}]);
  let authCalls=0,failAt=Infinity;
  // Synthetic Auth port only: this test verifies composition, not signatures or GoTrue.
  const options={projectID,policyReader,getUser:async exact=>{assert.equal(exact,bearer);authCalls++;return authCalls===failAt?{data:{user:null},error:new Error('synthetic revoked token')}:{data:{user:{id:recipient}},error:null};}};
  const connect=createHomeManagementPrivateConnection({connect:async()=>({query:(sql,args)=>db.query(sql,args),abort(){},async close(){}})});
  const management=createOwnerlessHomeManagement({connect,verifyCurrent:createHomeHandoffIdentityVerifier(options),verifyIdentity:createHomeHandoffInventoryIdentityVerifier(options)});
  await db.query('update public.homes set owner_id=null where id=$1',[home]);await db.exec('update maintenance_private.ownerless_home_policy set enabled=true');
  const origin='https://ouchi-maintenance.vercel.app',url=origin+'/api/family/management/'+home;
  const headers={authorization:'Bearer '+bearer,'x-ouchi-app-epoch':re,'content-type':'application/json'};
  const send=(method='GET',payload)=>ownerlessHomeManagementResponse(new Request(url,{method,headers,...(payload?{body:JSON.stringify(payload)}:{})}),{origin,management});
  const response=await send();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const {generation}=await response.json(),payload={requestID:request,generation,confirmation:'CLAIM_HOME_MANAGEMENT'};
  failAt=authCalls+4;
  assert.equal((await send('POST',payload)).status,403);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,null);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,0);
  failAt=Infinity;assert.equal((await send('POST',payload)).status,200);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  assert.equal((await send('POST',payload)).status,200);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,1);
 }finally{await db.close();}
});
