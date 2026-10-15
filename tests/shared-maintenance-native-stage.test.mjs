import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {seedClosureReauthenticationDatabase} from './fixtures/closure-reauth-database.mjs';
import {owner,recipient,other,home,product,oe,re} from './fixtures/home-handoff-identifiers.mjs';
import {withSharedMaintenanceClosureMetadata as boundary} from '../lib/shared-maintenance-closure-metadata.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';
import {seedSharedNativeMetadata,metadataTables,metadataRows} from './fixtures/shared-native-metadata.mjs';
import {seedSharedNativeDevices,deviceRows,deviceTables} from './fixtures/shared-native-devices.mjs';
import {createSharedMaintenanceAdapter} from './fixtures/shared-maintenance-adapter-module.mjs';

const seedMetadata=db=>seedSharedNativeMetadata(db,[[owner,oe],[owner,randomUUID()],[recipient,randomUUID()]]);
const seedDevices=db=>seedSharedNativeDevices(db,[[owner,oe],[owner,randomUUID()],[recipient,randomUUID()]]);

// Application-owned adapter + actual worker + existing full-schema canonical
// SQL stages. Preparation/retention/current gates are explicit fixtures; this
// deliberately has no files, global Auth erasure, deployment or real service.
function workerAdapter(f,{loseCompletionReply=false}={}){
 const calls=[],signal=AbortSignal.timeout(30000),args=[f.native.requestID,owner,oe,f.native.leaseToken];
 const inventory={...f.shared};delete inventory.leaseToken;
 const confirmed=async tx=>(await tx.query('select public.maintenance_deletion_completion_is_confirmed($1,$2,$3,$4) value',args)).rows[0].value;
 const current=async tx=>{
  const shared=(await tx.query("select scope=$2::jsonb and status='processing' and lease_token=$3 and lease_until>clock_timestamp() live from private.kb_shared_deletion_journal where request_id=$1",[f.shared.requestID,inventory,f.shared.leaseToken])).rows[0]?.live;
  return shared===true&&await f.gates(tx)===true;
 };
 const ports={
  resolve:async()=>f.native,
  atomic:async(mapping,native,phase)=>{
   assert.deepEqual(mapping.shared,f.shared);assert.deepEqual(native,f.native);calls.push(phase);
   const result=await f.transaction(async tx=>{
    if(!await current(tx))return false;
    if(phase==='completionAlreadyConfirmed')return confirmed(tx);
    if(phase==='leaseCurrent')return (await tx.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) value',args)).rows[0].value;
    if(phase==='revokeAndCaptureInventory')return (await tx.query('select inventory_captured from maintenance_private.account_deletion_requests where id=$1',[native.requestID])).rows[0].inventory_captured===true;
    if(phase==='eraseAttachments')return (await tx.query('select not exists(select 1 from maintenance_private.account_deletion_objects where request_id=$1) as empty',[native.requestID])).rows[0].empty===true;
    const run=name=>boundary(tx,f.shared,native,name,tx=>f.stage(tx,name),f.gates);
    if(phase==='finalizeIdentityAndRetention')return await run('captureReceiptSessions')===true&&await run('eraseIdentity')===true;
    return run(phase);
   });
   if(phase==='markComplete'&&result===true&&loseCompletionReply){loseCompletionReply=false;throw Error('Committed completion reply lost');}
   return result;
  },
  verify:async()=>{calls.push('verify');return f.transaction(async tx=>await current(tx)&&await confirmed(tx));},
  handoff:async()=>false,family:async()=>false,sessions:async()=>false,familyAfterAuth:async()=>false,sessionsAfterAuth:async()=>false,
 };
 return {calls,adapter:createSharedMaintenanceAdapter(ports,signal)};
}

test('application-owned bridge reconciles committed native completion using canonical metadata/device SQL and preserves bystander/Auth',async()=>{
 const f=await fixture(async db=>{await seedMetadata(db);await seedDevices(db);});try{
  const foreignMetadata=await metadataRows(f.db,recipient),foreignDevices=await deviceRows(f.db,recipient);
  const w=workerAdapter(f,{loseCompletionReply:true});
  assert.equal(await w.adapter.erase(f.shared),false);
  assert.equal((await f.db.query('select state from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows[0].state,'complete');
  assert.ok(Object.values(await metadataRows(f.db,owner)).every(rows=>rows.length===0));
  assert.ok(Object.values(await deviceRows(f.db,owner)).every(rows=>rows.length===0));
  assert.deepEqual(await metadataRows(f.db,recipient),foreignMetadata);assert.deepEqual(await deviceRows(f.db,recipient),foreignDevices);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in($1,$2)',[owner,recipient])).rows[0].n,2);
  const receipt=(await f.db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows;
  w.calls.length=0;assert.equal(await w.adapter.erase(f.shared),true);assert.deepEqual(w.calls,['completionAlreadyConfirmed','verify']);
  assert.deepEqual((await f.db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows,receipt);
 }finally{await f.db.close();}
});

test('application bridge stops at unknown notification outcome and rolls back that SQL stage without erasing records',async()=>{
 const f=await fixture(async db=>{await seedMetadata(db);await seedDevices(db);await db.query('update public.maintenance_push_subscriptions set claim_token=$2,claimed_until=clock_timestamp()-interval \'1 second\' where user_id=$1',[owner,randomUUID()]);});try{
  const own=await metadataRows(f.db,owner),devices=await deviceRows(f.db,owner),w=workerAdapter(f);
  assert.equal(await w.adapter.erase(f.shared),false);assert.equal(w.calls.includes('eraseRecords'),false);
  assert.deepEqual(await metadataRows(f.db,owner),own);assert.deepEqual(await deviceRows(f.db,owner),devices);
  assert.equal((await f.db.query('select records_erased,identity_erased,state from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows[0].state,'running');
  assert.equal((await f.db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,1);
 }finally{await f.db.close();}
});

test('record-stage Web deletion permits only its own cascading test-limit cleanup',async()=>{
 const f=await fixture(seedDevices);try{
  const foreign=await deviceRows(f.db,recipient),own=await deviceRows(f.db,owner);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',tx=>f.stage(tx,'eraseRecords'),f.gates)),true);
  const remaining=await deviceRows(f.db,owner);
  assert.deepEqual(remaining['public.maintenance_push_subscriptions'],[]);
  assert.deepEqual(remaining['public.maintenance_push_test_limits'],[]);
  for(const table of deviceTables.filter(t=>t.startsWith('maintenance_private.')))assert.deepEqual(remaining[table],own[table]);
  assert.deepEqual(await deviceRows(f.db,recipient),foreign);
 }finally{await f.db.close();}
});

test('frozen device retirement removes all retained epochs, preserves bystanders and retries harmlessly',async()=>{
 const f=await fixture(seedDevices);try{
  const foreign=await deviceRows(f.db,recipient),own=await deviceRows(f.db,owner);
  assert.ok(Object.values(own).every(rows=>rows.length>0));
  for(let attempt=0;attempt<2;attempt++){
   assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseDeviceRegistrations',tx=>f.stage(tx,'eraseDeviceRegistrations'),f.gates)),true);
   assert.ok(Object.values(await deviceRows(f.db,owner)).every(rows=>rows.length===0));
   assert.deepEqual(await deviceRows(f.db,recipient),foreign);
  }
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in($1,$2)',[owner,recipient])).rows[0].n,2);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.shared_native_stage_contexts')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('ambiguous notification sends including expired leases retain registrations and roll back metadata',async()=>{
 for(const fault of ['web','native','unknown']){
  const f=await fixture(async db=>{
   await seedDevices(db);
   if(fault==='web')await db.query("update public.maintenance_push_subscriptions set claim_token=$1,claimed_until=clock_timestamp()-interval '1 hour' where user_id=$2",[randomUUID(),owner]);
   else await db.query("update maintenance_private.native_notification_jobs set state=$1,lease_id=$2,lease_until=clock_timestamp()-interval '1 hour',send_started_at=clock_timestamp()-interval '2 hours' where device_id in(select id from maintenance_private.native_notification_devices where user_id=$3)",[fault==='native'?'claimed':'unknown',randomUUID(),owner]);
  });try{
   const own=await deviceRows(f.db,owner),foreign=await deviceRows(f.db,recipient);
   for(const phase of ['eraseDeviceRegistrations','eraseRecords'])await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,phase,tx=>f.stage(tx,phase),f.gates)),/Notification delivery outcome unconfirmed/);
   assert.deepEqual(await deviceRows(f.db,owner),own);assert.deepEqual(await deviceRows(f.db,recipient),foreign);
   assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[owner])).rows[0].n,1);
  }finally{await f.db.close();}
 }
});

test('device absence, fresh current gates and final lease checks are required before COMMIT',async()=>{
 for(const fault of ['false-absence','gate','lease']){
  const f=await fixture(seedDevices);try{
   const own=await deviceRows(f.db,owner),foreign=await deviceRows(f.db,recipient);
   let open=true;const gates=async(...args)=>open&&await f.gates(...args);
   await assert.rejects(f.transaction(async tx=>{
    await boundary(tx,f.shared,f.native,'eraseDeviceRegistrations',fault==='false-absence'?async()=>true:tx=>f.stage(tx,'eraseDeviceRegistrations'),gates);
    if(fault==='gate')open=false;
    if(fault==='lease')await tx.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[f.shared.requestID]);
   }),/absence unconfirmed|Current/);
   assert.deepEqual(await deviceRows(f.db,owner),own);assert.deepEqual(await deviceRows(f.db,recipient),foreign);
   assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[owner])).rows[0].n,1);
  }finally{await f.db.close();}
 }
});

test('device stage refuses foreign rows, wrong phases and preference mutations',async()=>{
 const f=await fixture(seedDevices);try{
  const own=await deviceRows(f.db,owner),foreign=await deviceRows(f.db,recipient);
  for(const table of deviceTables)for(const [phase,user] of [['eraseDeviceRegistrations',recipient],['captureReceiptSessions',owner]]){
   await assert.rejects(f.transaction(async tx=>{
    await tx.query("insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),$1,$2,$3,$4,$5,clock_timestamp()+interval '10 seconds')",[f.shared,f.native.requestID,oe,f.native.leaseToken,phase]);
    const rows=await deviceRows(tx,user);
    const key=table.endsWith('.native_delivery_identities')?'destination_hash':table.endsWith('.maintenance_push_test_limits')?'user_id':'id';
    await tx.query(`delete from ${table} where ${key}=$1`,[rows[table][0][key]]);
   }),/Native stage write refused/);
  }
  await assert.rejects(f.transaction(async tx=>{
   await tx.query("insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),$1,$2,$3,$4,'eraseDeviceRegistrations',clock_timestamp()+interval '10 seconds')",[f.shared,f.native.requestID,oe,f.native.leaseToken]);
   await tx.query('update maintenance_private.native_notification_devices set enabled=false where user_id=$1',[owner]);
  }),/Native stage write refused/);
  assert.deepEqual(await deviceRows(f.db,owner),own);assert.deepEqual(await deviceRows(f.db,recipient),foreign);
 }finally{await f.db.close();}
});

async function fixture(beforeFreeze=async()=>{}){
 const db=await seedClosureReauthenticationDatabase();await db.exec('reset role;delete from public.home_members');
 const native={requestID:randomUUID(),userID:owner,epochID:oe,leaseToken:randomUUID()};
 const shared={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner,leaseToken:randomUUID(),inventoryDigest:'d'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:oe}]};
 const inventory={...shared};delete inventory.leaseToken;
 await beforeFreeze(db,native);
 // Legitimate preparation precedes the stop fence. It is not a stopped-writer
 // exception and is not a claim of full production writer/session coverage.
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes',true)",[native.requestID,owner,oe,native.leaseToken]);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
 for(const [user,epoch] of [[owner,oe],[recipient,randomUUID()]])await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[user,epoch,randomUUID()]);
 await db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-native-stage-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[native.requestID]);
 for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.exec(readFileSync('tests/fixtures/handoff-controller-compatibility/'+name,'utf8'));
 await db.exec(readFileSync('tests/fixtures/shared-controller-journal.sql','utf8'));
 await db.exec(readFileSync('tests/fixtures/shared-maintenance-native-stage.sql','utf8'));
 const receipts=Object.fromEntries(['prepare','handoff-family','verify-family-before','verify-sessions-before'].map(stage=>[stage,{durable:true,stage,...inventory}]));
 await db.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'processing',$4,clock_timestamp()+interval '5 minutes',$5)",[shared.requestID,owner,inventory,shared.leaseToken,receipts]);
 await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner,shared,native.leaseToken]);
 await db.query('select maintenance_private.freeze_household_scope($1,$2)',[shared,native.leaseToken]);
 const stage=async(tx,phase)=>(await tx.query('select maintenance_private.run_shared_native_stage($1,$2,$3) value',[shared,native.leaseToken,phase])).rows[0].value;
 const transaction=async work=>{await db.exec('begin');try{const result=await runWithTransactionCommitChecks(db,AbortSignal.timeout(10000),work);await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}};
 // Synthetic fresh gates, not a production registry/provider.
 const gates=async tx=>(await tx.query('select not exists(select 1 from public.home_members where user_id=$1) as allowed',[owner])).rows[0].allowed;
 return {db,native,shared,stage,transaction,gates};
}

test('repeated service-fixture preparation uses globally distinct purchases and keys without changing prior actors',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await db.exec('reset role');
  await seedSharedNativeMetadata(db,[[owner,oe],[recipient,re]]);
  const savedOwner=await metadataRows(db,owner),savedRecipient=await metadataRows(db,recipient),epoch=randomUUID();
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[other,epoch]);
  await db.query('insert into maintenance_private.account_access values($1,true)',[other]);
  await seedSharedNativeMetadata(db,[[other,epoch]]);
  assert.ok(Object.values(await metadataRows(db,other)).every(rows=>rows.length===1));
  assert.deepEqual(await metadataRows(db,owner),savedOwner);assert.deepEqual(await metadataRows(db,recipient),savedRecipient);
  assert.equal((await db.query('select count(distinct original_transaction_id)::int n from maintenance_private.transaction_ownership')).rows[0].n,3);
  assert.equal((await db.query('select count(distinct key_id)::int n from maintenance_private.restore_attested_keys')).rows[0].n,3);
 }finally{await db.close();}
});

test('canonical native SQL stages run with stopped-writer guards, bounded authority and exact sealed completion',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[owner]),/principal stopped/);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseRecords',tx=>f.stage(tx,'eraseRecords'),f.gates)),true);
  assert.equal((await f.db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,0);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'captureReceiptSessions',tx=>f.stage(tx,'captureReceiptSessions'),f.gates)),true);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseIdentity',tx=>f.stage(tx,'eraseIdentity'),f.gates)),true);
  await f.db.query("insert into maintenance_private.deletion_retention_checks values($1,'synthetic-native-stage-only',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[f.native.requestID]).then(()=>assert.fail('ordinary stopped writer cannot insert retention')).catch(error=>assert.match(error.message,/principal stopped/));
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'markComplete',tx=>f.stage(tx,'markComplete'),f.gates)),true);
  const sealed=(await f.db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows;
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'markComplete',async()=>{throw Error('receipt retry must not write');},f.gates)),true);
  assert.deepEqual((await f.db.query('select completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows,sealed);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.shared_native_stage_contexts')).rows[0].n,0);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id=$1',[owner])).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[recipient])).rows[0].n,1);
 }finally{await f.db.close();}
});

test('identity finalization clears all thirteen Ouchi metadata categories across retained epochs and preserves the bystander',async()=>{
 const f=await fixture(seedMetadata);try{
  const foreign=await metadataRows(f.db,recipient),own=await metadataRows(f.db,owner);
  assert.ok(Object.values(own).every(rows=>rows.length===2));
  assert.ok(Object.values(foreign).every(rows=>rows.length===1));
  for(const phase of ['eraseRecords','captureReceiptSessions','eraseIdentity'])assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,phase,tx=>f.stage(tx,phase),f.gates)),true);
  assert.ok(Object.values(await metadataRows(f.db,owner)).every(rows=>rows.length===0));
  assert.deepEqual(await metadataRows(f.db,recipient),foreign);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in($1,$2)',[owner,recipient])).rows[0].n,2);
  assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,'markComplete',tx=>f.stage(tx,'markComplete'),f.gates)),true);
 }finally{await f.db.close();}
});

test('unknown restoration, mismatched ledger and final identity refusal roll back earlier metadata cleanup',async()=>{
 for(const fault of ['restore','ledger','device']){
  const f=await fixture(async(db)=>{
   await seedMetadata(db);
   if(fault==='restore')await db.query("update maintenance_private.restore_transfer_jobs set phase='update_started',mutation_started_at=authorized_at where user_id=$1",[owner]);
   if(fault==='ledger')await db.query('update maintenance_private.verified_notifications set app_epoch_id=$1 where user_id=$2',[randomUUID(),owner]);
   if(fault==='device')await db.query("insert into maintenance_private.native_notification_devices(user_id,app_epoch_id,environment,device_token,topic) values($1,$2,'Sandbox',$3,'jp.ouchi.maintenance')",[owner,oe,'a'.repeat(64)]);
  });try{
   for(const phase of ['eraseRecords','captureReceiptSessions'])assert.equal(await f.transaction(tx=>boundary(tx,f.shared,f.native,phase,tx=>f.stage(tx,phase),f.gates)),true);
   const own=await metadataRows(f.db,owner),foreign=await metadataRows(f.db,recipient);
   await assert.rejects(f.transaction(tx=>boundary(tx,f.shared,f.native,'eraseIdentity',tx=>f.stage(tx,'eraseIdentity'),f.gates)),/Native account metadata stage unconfirmed|Native stage write refused/);
   assert.deepEqual(await metadataRows(f.db,owner),own);
   assert.deepEqual(await metadataRows(f.db,recipient),foreign);
   assert.equal((await f.db.query('select identity_erased from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows[0].identity_erased,false);
   assert.equal((await f.db.query('select count(*)::int n from maintenance_private.shared_native_stage_contexts')).rows[0].n,0);
  }finally{await f.db.close();}
 }
});

test('metadata stage refuses every foreign category, wrong-phase erasure and preference updates',async()=>{
 const f=await fixture(seedMetadata);try{
  const own=await metadataRows(f.db,owner),foreign=await metadataRows(f.db,recipient);
  for(const table of metadataTables)for(const [phase,user] of [['eraseIdentity',recipient],['eraseRecords',owner]]){
   await assert.rejects(f.transaction(async tx=>{
    await tx.query("insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),$1,$2,$3,$4,$5,clock_timestamp()+interval '10 seconds')",[f.shared,f.native.requestID,oe,f.native.leaseToken,phase]);
    await tx.query(`delete from maintenance_private.${table} where user_id=$1`,[user]);
   }),/Native stage write refused/);
  }
  await assert.rejects(f.transaction(async tx=>{
   await tx.query("insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),$1,$2,$3,$4,'eraseIdentity',clock_timestamp()+interval '10 seconds')",[f.shared,f.native.requestID,oe,f.native.leaseToken]);
   await tx.query('update maintenance_private.notification_channels set revision=2 where user_id=$1',[owner]);
  }),/Native stage write refused/);
  assert.deepEqual(await metadataRows(f.db,owner),own);assert.deepEqual(await metadataRows(f.db,recipient),foreign);
 }finally{await f.db.close();}
});

test('ordinary role, guessed GUC, foreign scope, missing prerequisite and expired leases cannot acquire native stage authority',async()=>{
 const f=await fixture();try{
  await f.db.exec('set role service_role');
  await assert.rejects(f.stage(f.db,'eraseRecords'),/permission denied/);
  await assert.rejects(f.db.exec('select * from maintenance_private.shared_native_stage_contexts'),/permission denied/);
  await f.db.query("select set_config('maintenance.native_stage_context',$1,false)",[randomUUID()]);
  await assert.rejects(f.db.query('update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.native.requestID]),/principal stopped/);
  await f.db.exec('reset role');
  for(const scope of [{...f.shared,userID:recipient},{...f.shared,leaseToken:randomUUID()}])await assert.rejects(f.transaction(tx=>tx.query('select maintenance_private.run_shared_native_stage($1,$2,$3)',[scope,f.native.leaseToken,'eraseRecords'])),/authority|constraint/);
  await f.db.exec("update private.kb_shared_deletion_journal set receipts=receipts-'verify-sessions-before'");
  await assert.rejects(f.transaction(tx=>f.stage(tx,'eraseRecords')),/authority/);
  assert.equal((await f.db.query('select count(*)::int n from public.homes where id=$1',[home])).rows[0].n,1);
 }finally{await f.db.close();}
});

test('transaction-local stage predicates refuse wrong phase, row, columns, insert, expired context and shared binding changes',async()=>{
 const f=await fixture();try{
  const context=async(tx,phase='eraseRecords')=>tx.query("insert into maintenance_private.shared_native_stage_contexts values(pg_backend_pid(),txid_current(),$1,$2,$3,$4,$5,clock_timestamp()+interval '10 seconds')",[f.shared,f.native.requestID,oe,f.native.leaseToken,phase]);
  const faults=[
   ['eraseRecords',null,'update maintenance_private.account_deletion_requests set identity_erased=true where id=$1',[f.native.requestID]],
   ['captureReceiptSessions',null,'update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.native.requestID]],
   ['eraseRecords',null,"update maintenance_private.account_deletion_requests set records_erased=true,requested_at=requested_at+interval '1 second' where id=$1",[f.native.requestID]],
   ['eraseIdentity',null,'delete from maintenance_private.account_access where user_id=$1',[recipient]],
   ['eraseIdentity',null,'update maintenance_private.account_access set enabled=true where user_id=$1',[owner]],
   ['eraseRecords',null,'insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,owner,'forged']],
   ['eraseRecords',"update maintenance_private.shared_native_stage_contexts set expires_at=clock_timestamp()-interval '1 second'",'update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.native.requestID]],
   ['eraseRecords',"update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second'",'update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.native.requestID]],
   ['eraseRecords',"update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second'",'update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.native.requestID]]
  ];
  for(const [phase,fault,sql,args] of faults){
   await assert.rejects(f.transaction(async tx=>{
    await context(tx,phase);if(fault)await tx.query(fault);await tx.query(sql,args);
   }),/Native stage write refused/);
  }
  // This is an operator-created synthetic context, never a caller capability.
  // A valid same-transaction control proves refusal cases are not all denied.
  await f.transaction(async tx=>{
   await context(tx);await tx.query('update maintenance_private.account_deletion_requests set records_erased=true where id=$1',[f.native.requestID]);
   await tx.query('delete from maintenance_private.shared_native_stage_contexts');
  });
  await assert.rejects(f.db.query('update maintenance_private.account_deletion_requests set identity_erased=true where id=$1',[f.native.requestID]),/principal stopped/);
  assert.equal((await f.db.query('select enabled from maintenance_private.account_access where user_id=$1',[recipient])).rows[0].enabled,true);
  assert.equal((await f.db.query('select count(*)::int n from public.products where id=$1',[product])).rows[0].n,1);
 }finally{await f.db.close();}
});
