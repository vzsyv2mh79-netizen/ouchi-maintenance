import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileMaintenanceMigrationHistory} from '../lib/maintenance-migration-history.mjs';
import {maintenanceMigrationCatalog,maintenanceMigrationPlan,orderPinnedMaintenanceMigrations} from '../scripts/maintenance-migration-plan.mjs';
const observed=JSON.parse(readFileSync('tests/fixtures/migration-history/recorded-ouchi-baseline.json','utf8'));
test('recorded baseline hashes identify seven applied sources despite different version IDs, without replay or history repair',()=>{
 const foreign={version:'20990101000000',name:'other_application_fixture',source_sha256:'f'.repeat(64)};
 const plan=maintenanceMigrationPlan([...observed,foreign]);
 assert.equal(plan.recorded.length,7);assert.equal(plan.recorded.every(row=>!row.sameVersion),true);assert.deepEqual(plan.conflicts,[]);assert.equal(plan.pending.length,126);
 assert.ok(plan.pending.includes('supabase/migrations/20261014231227_ouchi_closure_actor_context_compatibility.sql'));
 assert.ok(plan.pending.includes('supabase/migrations/20261015003918_ouchi_deletion_prior_delivery_identities.sql'));
 assert.ok(plan.pending.includes('supabase/migrations/20261015010011_ouchi_deletion_notification_quiescence.sql'));
 assert.ok(plan.pending.includes('supabase/migrations/20261015023355_ouchi_attachment_retention_observation.sql'));
 assert.ok(plan.pending.includes('supabase/migrations/20261015041238_ouchi_attachment_cleanup_lease.sql'));
 assert.ok(plan.pending.includes('supabase/migrations/20261015052134_ouchi_deletion_receipt_auth_independence.sql'));
 for(const row of plan.recorded)assert.equal(plan.pending.includes(row.file),false);
 assert.deepEqual(plan.foreignHistory,[{version:foreign.version,name:foreign.name,action:'preserve'}]);
 assert.equal(plan.historyAligned,false);assert.equal(plan.automaticApplyAllowed,false);assert.equal(plan.historyRepairAllowed,false);
 assert.equal(plan.reviewRuntimeMigrations.length,6);assert.ok(plan.reviewRuntimeMigrations.every(row=>plan.pending.includes(row.file)));
 assert.equal(plan.additionalReviewRuntimeCandidates,undefined);
});
test('same names or versions with changed/unknown SQL are conflicts, never proof of applied source',()=>{
 const file=maintenanceMigrationCatalog()[0];
 for(const recorded of [{version:file.version,name:file.name,source_sha256:'0'.repeat(64)},{version:'20990101000000',name:file.name,source_sha256:'0'.repeat(64)},{version:'20990101000000',name:file.name},{version:file.version,name:'other_application_fixture',source_sha256:file.source_sha256}]){
  const plan=reconcileMaintenanceMigrationHistory([file],[recorded]);assert.equal(plan.conflicts.length,1);assert.deepEqual(plan.pending,[]);assert.deepEqual(plan.recorded,[]);assert.equal(plan.automaticApplyAllowed,false);
 }
});
test('ambiguous histories and local catalogs refuse planning rather than selecting arbitrary matches',()=>{
 const file=maintenanceMigrationCatalog()[0],record={version:file.version,name:file.name,source_sha256:file.source_sha256};
 assert.throws(()=>reconcileMaintenanceMigrationHistory([file,file],[]),/Unambiguous local/);
 assert.throws(()=>reconcileMaintenanceMigrationHistory([file],[record,record]),/Unambiguous recorded/);
 const plan=reconcileMaintenanceMigrationHistory([file],[record,{...record,version:'20990101000000'}]);assert.equal(plan.conflicts[0].reason,'ambiguous_recorded_source');
});

test('complete explicit pins refuse missing, duplicate, foreign and modified migration sources',()=>{
 const catalog=maintenanceMigrationCatalog(),manifest=JSON.parse(readFileSync('supabase/maintenance-migration-order.json','utf8'));
 assert.equal(catalog.length,133);
 assert.deepEqual(orderPinnedMaintenanceMigrations(catalog,manifest),catalog);
 for(const changed of [
  {...manifest,files:manifest.files.slice(1)},
  {...manifest,files:[manifest.files[0],...manifest.files.slice(0,-1)]},
  {...manifest,files:manifest.files.map((p,i)=>i? p:{...p,file:'supabase/migrations/20990101000000_foreign_fixture.sql'})},
  {...manifest,files:manifest.files.map((p,i)=>i? p:{...p,source_sha256:'0'.repeat(64)})}
 ])assert.throws(()=>orderPinnedMaintenanceMigrations(catalog,changed),/pinned|Pinned/);
});

test('an already recorded privilege-hardening source is excluded despite a different remote version',()=>{
 const hardening=maintenanceMigrationCatalog().find(row=>row.name==='ouchi_baseline_table_privilege_hardening');
 assert.ok(hardening);
 const plan=maintenanceMigrationPlan([...observed,{version:'20990102000000',name:hardening.name,source_sha256:hardening.source_sha256}]);
 assert.equal(plan.recorded.length,8);
 assert.equal(plan.pending.length,125);
 assert.equal(plan.pending.includes(hardening.file),false);
 assert.deepEqual(plan.conflicts,[]);
 assert.equal(plan.automaticApplyAllowed,false);
 assert.equal(plan.historyRepairAllowed,false);
});
