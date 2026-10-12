import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createHouseholdHandoffPort,snapshotDigest} from './fixtures/handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest} from './fixtures/handoff-controller-compatibility/handoff-consent.mjs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,other,home,product,request,os,rs,oe,re} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();
 try{
  await db.exec('reset role');
  const base='tests/fixtures/handoff-controller-compatibility/';
  for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.exec(readFileSync(base+name,'utf8'));
  await db.exec('set role service_role');return db;
 }catch(error){await db.close();throw error;}
}
async function snapshot(db){
 await db.exec('reset role');const value={};
 for(const name of ['public.homes','public.home_members','public.products','public.maintenance_tasks','public.maintenance_history','maintenance_private.product_attachments','maintenance_private.household_write_routes'])value[name]=(await db.query('select * from '+name)).rows;
 await db.exec('set role service_role');return value;
}
const prepare=db=>db.query('select public.request_maintenance_home_handoff($1,$2,$3,$4,$5,$6)',[request,home,owner,os,oe,recipient]);
const accept=db=>db.query('select public.decide_maintenance_home_handoff($1,$2,$3,$4,true)',[request,recipient,rs,re]);

// These are incomplete-composition refusal checks, NOT release success gates.
test('existing shared-controller fence refuses standalone acceptance without a same-transaction verified context',async()=>{
 const db=await fixture();try{
  const before=await snapshot(db);await prepare(db);await assert.rejects(accept(db),/Verified handoff required/);
  assert.deepEqual(await snapshot(db),before);
  assert.equal((await db.query('select state from maintenance_private.home_handoffs')).rows[0].state,'pending');
 }finally{await db.close();}
});

test('service role cannot forge the private context or bypass the guard with an arbitrary context locator',async()=>{
 const db=await fixture();try{
  const before=await snapshot(db);await prepare(db);
  await assert.rejects(db.exec('select * from maintenance_private.household_handoff_contexts'),/permission denied/);
  await db.query("select set_config('maintenance.handoff_context',$1,false)",[other]);
  await assert.rejects(accept(db),/Verified handoff required/);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('unresolved attachments still stop before ownership mutation when the shared-controller fences are composed',async()=>{
 const db=await fixture();try{
  await db.exec('reset role');
  await db.query('insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values($1,$2,$3,$4,8,$5)',[other,recipient,re,product,'image/png']);
  await db.exec('set role service_role');const before=await snapshot(db);await prepare(db);
  await assert.rejects(accept(db),/Attachment handoff required/);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

async function signedFixture(db) {
 await db.exec('reset role');
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:oe}]};
 const nativeLease=randomUUID();
 await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,scope,nativeLease]);
 await db.query('select maintenance_private.freeze_household_scope($1,$2)',[scope,nativeLease]);
 const saved=(await db.query('select maintenance_private.household_family_snapshot($1) as value',[home])).rows[0].value;
 const plan={protocolVersion:2,requestID:scope.requestID,userID:owner,inventoryDigest:scope.inventoryDigest,appRequestID:scope.apps[0].requestID,appScopeID:oe,householdID:home,successorID:recipient,memberIDs:[owner,recipient],familyRecordIDs:[product],familySnapshotDigest:snapshotDigest(saved)};
 await db.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[home,owner,recipient,scope,plan,handoffPlanDigest(scope,plan),saved]);
 await db.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[home,owner,scope]);
 const port=tx=>({query:async(sql,args)=>{const result=await tx.query(sql,args);return {...result,rowCount:result.rowCount??result.affectedRows};}});
 const store={transaction:callback=>db.transaction(tx=>callback(port(tx))),target:async(tx,requestID,householdID,actor)=>requestID===scope.requestID&&householdID===home&&[owner,recipient].includes(actor)?{scope,plan}:null,existing:async(tx,s,p,actor)=>{
  const row=(await tx.query('select * from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2 for update',[home,actor])).rows[0];return row?{actorID:row.actor_id,token:row.token,revokedAt:row.revoked_at}:null;
 },record:(tx,s,p,actor,token)=>tx.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[home,actor,token])};
 const key=randomBytes(32),transfer=createHouseholdHandoffPort(key);
 // Synthetic verified-identity fixture only. This is not real Auth/MFA proof.
 const issue=createHandoffConsentIssuer({key,store,verifyIdentity:async actor=>({userID:actor,authVerifiedAt:Date.now()})});
 return {scope,nativeLease,saved,issue,transfer:()=>db.transaction(tx=>transfer(scope,nativeLease,home,port(tx)))};
}

test('signed dual consent composes with guards and changes owner/write route atomically while preserving exact family snapshot',async()=>{
 const db=await fixture();try {
  const f=await signedFixture(db);
  const accept=actor=>f.issue({requestID:f.scope.requestID,householdID:home,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'});
  await assert.rejects(f.transfer(),/Signed dual consent/);
  assert.equal((await accept(owner)).status,'accepted');
  await assert.rejects(f.transfer(),/Signed dual consent/);
  assert.equal((await accept(recipient)).status,'accepted');
  await assert.rejects(db.query('insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values($1,$2,$3,$4,8,$5)',[other,recipient,re,product,'image/png']),/Household principal stopped/);
  const done=await f.transfer();assert.equal(done.retained,true);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  assert.equal((await db.query("select owner_id from maintenance_private.household_write_routes where home_id=$1 and kind='homes'",[home])).rows[0].owner_id,recipient);
  assert.deepEqual((await db.query('select maintenance_private.household_family_snapshot($1) as value',[home])).rows[0].value,f.saved);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.household_handoff_receipts')).rows[0].n,1);
  assert.deepEqual(await f.transfer(),done);
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,3);
 } finally {await db.close();}
});

test('revoked signed consent prevents the composed ownership change without losing any family rows',async()=>{
 const db=await fixture();try {
  const f=await signedFixture(db);
  for(const actor of [owner,recipient])assert.equal((await f.issue({requestID:f.scope.requestID,householdID:home,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
  await db.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where actor_id=$1',[recipient]);
  const before=await snapshot(db);await db.exec('reset role');
  await assert.rejects(f.transfer(),/Signed dual consent/);
  assert.deepEqual(await snapshot(db),before);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.household_handoff_receipts')).rows[0].n,0);
 } finally {await db.close();}
});

test('signed consent cannot bypass unresolved attachment custody in the shared-controller path',async()=>{
 const db=await fixture();try {
  await db.exec('reset role');
  await db.query('insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values($1,$2,$3,$4,8,$5)',[other,owner,oe,product,'image/png']);
  const f=await signedFixture(db);
  for(const actor of [owner,recipient])assert.equal((await f.issue({requestID:f.scope.requestID,householdID:home,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
  const before=await snapshot(db);await db.exec('reset role');
  await assert.rejects(f.transfer(),/Attachment handoff required/);
  assert.deepEqual(await snapshot(db),before);
 } finally {await db.close();}
});
