import test from 'node:test';
import assert from 'node:assert/strict';
import {seedSharedMaintenanceComposition} from './fixtures/shared-maintenance-composition.mjs';
import {metadataRows} from './fixtures/shared-native-metadata.mjs';
import {deviceRows} from './fixtures/shared-native-devices.mjs';
import {owner,recipient} from './fixtures/home-handoff-identifiers.mjs';
import {readFileSync} from 'node:fs';
import {deletionStages} from '../lib/shared-deletion-protocol.mjs';
test('full v2 coordinator starts without prior receipts, runs actual native worker and preserves bystander after synthetic Auth erasure',async()=>{
 const f=await seedSharedMaintenanceComposition();try{
  assert.deepEqual(await f.run(),{state:'complete',notification:'unconfirmed'});
  const row=(await f.db.query('select status,receipts from private.kb_shared_deletion_journal where request_id=$1',[f.scope.requestID])).rows[0];
  assert.equal(row.status,'complete');assert.deepEqual(Object.keys(row.receipts).sort(),deletionStages(f.scope).sort());
  assert.ok(Object.values(await metadataRows(f.db,owner)).every(rows=>rows.length===0));assert.ok(Object.values(await deviceRows(f.db,owner)).every(rows=>rows.length===0));
  assert.deepEqual(await metadataRows(f.db,recipient),f.keptMetadata);assert.deepEqual(await deviceRows(f.db,recipient),f.keptDevices);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id=$1',[owner])).rows[0].n,0);assert.equal((await f.db.query('select count(*)::int n from auth.users where id=$1',[recipient])).rows[0].n,1);
  assert.ok(f.calls.indexOf('native:markComplete')<f.calls.indexOf('auth:erase'));assert.ok(f.calls.indexOf('auth:verify')<f.calls.indexOf('peer:verifyFamilyAfterAuth'));assert.ok(f.calls.includes('native:sessionsAfterAuth'));
 }finally{await f.db.close();}
});
test('committed global app-stage reply loss resumes its original journal without replaying native erasure',async()=>{
 const f=await seedSharedMaintenanceComposition({lostStage:'erase:ouchi-maintenance'});try{
  assert.deepEqual(await f.run(),{state:'pending',stage:'erase:ouchi-maintenance'});
  assert.equal((await f.db.query('select state from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows[0].state,'complete');assert.equal(f.calls.includes('auth:erase'),false);
  f.calls.length=0;assert.deepEqual(await f.run(),{state:'complete',notification:'unconfirmed'});assert.equal(f.calls.some(name=>name.startsWith('native:erase')),false);assert.equal(f.calls.filter(name=>name==='auth:erase').length,1);
 }finally{await f.db.close();}
});
test('unknown native send stops the whole coordinator before records/Auth and preserves all actor metadata',async()=>{
 const f=await seedSharedMaintenanceComposition({unknownSend:true});try{
  const before=await metadataRows(f.db,owner);assert.deepEqual(await f.run(),{state:'pending',stage:'erase:ouchi-maintenance'});
  assert.deepEqual(await metadataRows(f.db,owner),before);assert.equal(f.calls.includes('native:eraseRecords'),false);assert.equal(f.calls.includes('auth:erase'),false);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id=$1',[owner])).rows[0].n,1);
  assert.equal(await f.journal.readReceipt(f.scope,'erase:ouchi-maintenance'),null);
 }finally{await f.db.close();}
});
test('missing post-Auth readback remains pending and recovery does not repeat app/Auth erasure',async()=>{
 const f=await seedSharedMaintenanceComposition({postAuthFailure:true});try{
  assert.deepEqual(await f.run(),{state:'pending',stage:'verify-family-after-auth'});assert.equal(await f.journal.readReceipt(f.scope,'complete'),null);
  f.calls.length=0;f.allowPostAuth();assert.deepEqual(await f.run(),{state:'complete',notification:'unconfirmed'});assert.equal(f.calls.includes('auth:erase'),false);assert.equal(f.calls.some(name=>name.startsWith('native:erase')),false);
 }finally{await f.db.close();}
});

test('the original Auth foreign key blocks completed retirement; reviewed migration resumes the same sealed request without replay',async()=>{
 const f=await seedSharedMaintenanceComposition({receiptIndependent:false});try{
  assert.deepEqual(await f.run(),{state:'pending',stage:'erase-auth'});assert.equal(f.errors.at(-1).code,'23503');assert.match(f.errors.at(-1).message,/account_deletion_requests_user_id_fkey/);
  const snapshot=()=>f.db.query('select id,user_id,app_epoch_id,requested_at,completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID]).then(result=>result.rows);
  const sealed=await snapshot();await f.db.exec(readFileSync('supabase/migrations/20261015052134_ouchi_deletion_receipt_auth_independence.sql','utf8'));
  assert.deepEqual(await snapshot(),sealed);f.calls.length=0;
  assert.deepEqual(await f.run(),{state:'complete',notification:'unconfirmed'});assert.equal(f.calls.some(name=>name.startsWith('native:erase')),false);assert.deepEqual(await snapshot(),sealed);
 }finally{await f.db.close();}
});
