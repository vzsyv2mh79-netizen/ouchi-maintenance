import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedClosureReauthenticationDatabase} from './fixtures/closure-reauth-database.mjs';
import {owner,recipient,os,oe} from './fixtures/home-handoff-identifiers.mjs';
import {withSharedMaintenanceClosureMetadata as boundary} from '../lib/shared-maintenance-closure-metadata.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
const metadataCount=async db=>(await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[owner])).rows[0].n;
async function fixture(){
 const db=await seedClosureReauthenticationDatabase();await db.exec('reset role;delete from public.home_members;delete from public.homes');
 const native={requestID:randomUUID(),userID:owner,epochID:oe,leaseToken:randomUUID()};
 const shared={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:oe},{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()}]};
 const inventory={...shared};delete inventory.leaseToken;
 await db.exec(`create schema private;create table private.kb_shared_deletion_journal(request_id uuid primary key,user_id uuid,scope jsonb,status text,lease_token uuid,lease_until timestamptz,receipts jsonb);
  create table maintenance_private.household_stop_bindings(user_id uuid primary key,scope jsonb,native_lease uuid,lease_until timestamptz,state text);
  create table maintenance_private.household_principal_fences(user_id uuid primary key,stopped boolean);`);
 const receipts=Object.fromEntries(['prepare','handoff-family','verify-family-before','verify-sessions-before'].map(stage=>[stage,{durable:true,stage,...inventory}]));
 await db.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'processing',$4,clock_timestamp()+interval '5 minutes',$5)",[shared.requestID,owner,inventory,shared.leaseToken,receipts]);
 await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','processing')",[owner,shared,native.leaseToken]);
 await db.query('insert into maintenance_private.household_principal_fences values($1,true)',[owner]);
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes',true)",[native.requestID,owner,oe,native.leaseToken]);
 for(const [user,epoch] of [[owner,oe],[owner,randomUUID()],[recipient,randomUUID()]])await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[user,epoch,randomUUID()]);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
 const args=[native.requestID,owner,oe,native.leaseToken];
 const work=async(tx,scope)=>{assert.deepEqual(scope,native);return (await tx.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) as value',args)).rows[0].value;};
 const transaction=async callback=>{
  await db.exec('begin');try{const result=await runWithTransactionCommitChecks(db,AbortSignal.timeout(10000),callback);await db.exec('commit');return result;}
  catch(error){await db.exec('rollback');throw error;}
 };
 const gates=async tx=>(await tx.query('select not exists(select 1 from public.homes where owner_id=$1) and not exists(select 1 from public.home_members where user_id=$1) as allowed',[owner])).rows[0].allowed;
 return {db,native,shared,args,work,transaction,gates};
}
test('shared/native pinned transaction erases own historical metadata and core records while retaining other actor and original Auth',async()=>{
 const f=await fixture();try{
  const foreign=(await f.db.query('select to_jsonb(r) row from maintenance_private.account_closure_reviews r where user_id=$1',[recipient])).rows;
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),true);
  assert.equal(await metadataCount(f.db),0);
  assert.deepEqual((await f.db.query('select to_jsonb(r) row from maintenance_private.account_closure_reviews r where user_id=$1',[recipient])).rows,foreign);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id=$1',[os])).rows[0].n,1);
 }finally{await f.db.close();}
});
test('missing/changed shared receipt, either lease, frozen binding, or fixed inventory refuses before metadata erasure',async()=>{
 const faults=[
  "update private.kb_shared_deletion_journal set receipts=receipts-'verify-sessions-before'",
  "update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second'",
  "update private.kb_shared_deletion_journal set scope=jsonb_set(scope,'{inventoryDigest}',to_jsonb(repeat('b',64)))",
  "update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second'",
  `update maintenance_private.account_deletion_requests set lease_token='${randomUUID()}'`,
  `update private.kb_shared_deletion_journal set lease_token='${randomUUID()}'`,
  `update maintenance_private.household_stop_bindings set native_lease='${randomUUID()}'`,
  "update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second'",
  'update maintenance_private.household_principal_fences set stopped=false'
 ];
 for(const fault of faults){const f=await fixture();try{
  await f.db.exec(fault);await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),/Current/);
  assert.equal(await metadataCount(f.db),2);
 }finally{await f.db.close();}}
});
test('final shared/native/binding expiry or replaced inventory rolls back acknowledged erasure at the owning COMMIT boundary',async()=>{
 for(const fault of ["update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second'","update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second'","update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second'","update private.kb_shared_deletion_journal set scope=jsonb_set(scope,'{inventoryDigest}',to_jsonb(repeat('b',64)))",'update maintenance_private.account_deletion_requests set records_erased=false']){
  const f=await fixture();try{
   await assert.rejects(f.transaction(async tx=>{await boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates);assert.equal(await metadataCount(f.db),0);await tx.query(fault);}),/Current/);
   assert.equal(await metadataCount(f.db),2);assert.equal((await f.db.query('select records_erased from maintenance_private.account_deletion_requests')).rows[0].records_erased,false);
  }finally{await f.db.close();}
 }
});
test('a swallowed false stage acknowledgement poisons COMMIT rather than committing partial metadata cleanup',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.transaction(async tx=>{await assert.rejects(boundary(tx,f.shared,f.native,'eraseRecords',async()=>false,f.gates),/stage unconfirmed/);}),/before COMMIT/);
  assert.equal(await metadataCount(f.db),2);
 }finally{await f.db.close();}
});
test('current gate provider has no default approval and a final lost approval rolls back the stage',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work)),/current gates/);
  for(const result of [false,null,'true'])await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,async()=>result)),/Current family/);
  let allowed=true;const gates=async()=>allowed;
  await assert.rejects(f.transaction(async tx=>{await boundary(tx,f.shared,f.native,'eraseRecords',f.work,gates);allowed=false;}),/Current family/);
  assert.equal(await metadataCount(f.db),2);
 }finally{await f.db.close();}
});
test('replacing the frozen scope or gate provider after erasure cannot commit a previously acknowledged stage',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.transaction(async tx=>{
   await boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates);
   await assert.rejects(boundary(tx,f.shared,f.native,'eraseRecords',f.work,async()=>true),/provider replacement/);
  }),/before COMMIT/);
  assert.equal(await metadataCount(f.db),2);
 }finally{await f.db.close();}
});
test('autocommit and incomplete/mismatched mappings cannot become a shared deletion transport',async()=>{
 const f=await fixture();try{
  await assert.rejects(runWithTransactionCommitChecks(f.db,AbortSignal.timeout(10000),tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),/Same pinned transaction/);
  await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,{...f.native,epochID:randomUUID()},'eraseRecords',f.work,f.gates)),/Fixed shared\/native/);
  await assert.rejects(f.transaction(tx=>boundary(tx,{...f.shared,leaseToken:f.native.leaseToken},f.native,'eraseRecords',f.work,f.gates)),/Fixed shared\/native/);
  await assert.rejects(boundary({query:f.db.query},f.shared,f.native,'markComplete',f.work,f.gates),/Checked shared transaction/);
  assert.equal(await metadataCount(f.db),2);
 }finally{await f.db.close();}
});
test('resumed native completion cleans review metadata in the same boundary, needs real sealed evidence and reconciles an exact completed receipt',async()=>{
 const f=await fixture();try{
  await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates));
  assert.equal((await f.db.query('select public.capture_maintenance_deletion_receipt_sessions($1,$2,$3,$4) value',f.args)).rows[0].value,true);
  assert.equal((await f.db.query('select public.erase_maintenance_deletion_identity($1,$2,$3,$4) value',f.args)).rows[0].value,true);
  await f.db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[owner,randomUUID(),randomUUID()]);
  const complete=async tx=>(await tx.query('select public.complete_maintenance_account_deletion($1,$2,$3,$4) value',f.args)).rows[0].value;
  await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'markComplete',complete,f.gates)),/stage unconfirmed/);
  assert.equal(await metadataCount(f.db),1,'unapproved completion cannot commit even the metadata cleanup');
  await f.db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-test-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[f.native.requestID]);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'markComplete',complete,f.gates)),true);
  const receipt=(await f.db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests')).rows;
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'markComplete',async()=>{throw Error('must only read completed receipt');},f.gates)),true);
  assert.deepEqual((await f.db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests')).rows,receipt);
  assert.equal(await metadataCount(f.db),0);
 }finally{await f.db.close();}
});

test('a full checkpoint schema refuses naked or fabricated family receipts before any native erasure',async()=>{
 const f=await fixture();try{
  await f.db.exec('create table maintenance_private.shared_family_stage_contexts(request_id uuid primary key,scope jsonb,coverage_digest text,receipt jsonb);alter table maintenance_private.shared_family_stage_contexts enable row level security;revoke all on maintenance_private.shared_family_stage_contexts from public,anon,authenticated,service_role');
  await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),/Current verified family checkpoint/);
  const fixed={...f.shared};delete fixed.leaseToken;
  const proof={durable:true,stage:'handoff-family',...fixed,familyCoverageDigest:'a'.repeat(64)};
  await f.db.query("update private.kb_shared_deletion_journal set receipts=jsonb_set(receipts,'{handoff-family}',$1::jsonb)",[JSON.stringify(proof)]);
  await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),/Current verified family checkpoint/);
  await f.db.query('insert into maintenance_private.shared_family_stage_contexts values($1,$2,$3,$4)',[f.shared.requestID,f.shared,'b'.repeat(64),proof]);
  await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),/Current verified family checkpoint/);
  assert.equal(await metadataCount(f.db),2);
 }finally{await f.db.close();}
});
test('exact family coverage is checked again at native COMMIT; enriched proof is accepted only with its matching private record',async()=>{
 const f=await fixture();try{
  await f.db.exec('create table maintenance_private.shared_family_stage_contexts(request_id uuid primary key,scope jsonb,coverage_digest text,receipt jsonb)');
  const fixed={...f.shared};delete fixed.leaseToken;
  const proof={durable:true,stage:'handoff-family',...fixed,familyCoverageDigest:'a'.repeat(64)};
  await f.db.query("update private.kb_shared_deletion_journal set receipts=jsonb_set(receipts,'{handoff-family}',$1::jsonb)",[JSON.stringify(proof)]);
  await f.db.query('insert into maintenance_private.shared_family_stage_contexts values($1,$2,$3,$4)',[f.shared.requestID,f.shared,proof.familyCoverageDigest,proof]);
  // Privileged fault in a minimal matching fixture, not a client write or a
  // bypass of the real checkpoint's immutable/deferred-commit triggers.
  await assert.rejects(f.transaction(async tx=>{await boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates);await tx.query('update maintenance_private.shared_family_stage_contexts set coverage_digest=$1',['b'.repeat(64)]);}),/Current verified family checkpoint/);
  assert.equal(await metadataCount(f.db),2);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',f.work,f.gates)),true);assert.equal(await metadataCount(f.db),0);
 }finally{await f.db.close();}
});
