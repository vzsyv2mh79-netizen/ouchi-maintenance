import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileMaintenanceMigrationHistory} from '../lib/maintenance-migration-history.mjs';
import {maintenanceMigrationCatalog,maintenanceMigrationPlan} from '../scripts/maintenance-migration-plan.mjs';
const observed=JSON.parse(readFileSync('tests/fixtures/migration-history/recorded-ouchi-baseline.json','utf8'));
test('recorded baseline hashes identify seven applied sources despite different version IDs, without replay or history repair',()=>{
 const foreign={version:'20990101000000',name:'other_application_fixture',source_sha256:'f'.repeat(64)};
 const plan=maintenanceMigrationPlan([...observed,foreign]);
 assert.equal(plan.recorded.length,7);assert.equal(plan.recorded.every(row=>!row.sameVersion),true);assert.deepEqual(plan.conflicts,[]);assert.equal(plan.pending.length,92);
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
