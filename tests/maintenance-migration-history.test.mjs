import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileMaintenanceMigrationHistory} from '../lib/maintenance-migration-history.mjs';
import {maintenanceMigrationCatalog,maintenanceMigrationPlan,orderPinnedMaintenanceMigrations,reviewedRevokeRecordings} from '../scripts/maintenance-migration-plan.mjs';
const observed=JSON.parse(readFileSync('tests/fixtures/migration-history/recorded-ouchi-baseline.json','utf8'));
function recordingFixture(){
 const catalog=maintenanceMigrationCatalog(),file=catalog.find(row=>row.name==='ouchi_baseline_table_privilege_hardening');
 const original=readFileSync(file.file,'utf8'),compact=original.replace(/^\s*--[^\n]*$/gm,'').replace(/\s+/g,' ').trim();
 const sha=text=>createHash('sha256').update(text).digest('hex');
 const source={file:file.file,source_sha256:file.source_sha256,recorded_version:'20990101000001',recorded_name:file.name,recorded_sql:compact,recorded_sha256:sha(compact)};
 return {catalog,file,source,sha,manifest:{format:'ouchi-reviewed-recorded-revoke/v1',sources:[source]}};
}
test('an explicit source-pinned compact REVOKE recording excludes replay while retaining both actual hashes and all other history',()=>{
 const {file,source,manifest}=recordingFixture();
 const row={version:source.recorded_version,name:file.name,source_sha256:source.recorded_sha256},foreign={version:'20990101000002',name:'other_application_fixture',source_sha256:'f'.repeat(64)};
 const history=[...observed,row,foreign],before=JSON.stringify(history);
 assert.equal(maintenanceMigrationPlan(history).conflicts.length,1);
 const result=maintenanceMigrationPlan(history,manifest);assert.deepEqual(result.conflicts,[]);assert.equal(result.recorded.length,8);assert.equal(result.pending.length,126);assert.equal(result.pending.includes(file.file),false);
 const recorded=result.recorded.find(x=>x.file===file.file);assert.equal(recorded.source_sha256,file.source_sha256);assert.equal(recorded.recorded_source_sha256,row.source_sha256);assert.equal(recorded.reviewed_source_recording,true);
 assert.equal(JSON.stringify(history),before);assert.equal(result.automaticApplyAllowed,false);assert.equal(result.historyRepairAllowed,false);assert.equal(result.historyAligned,false);assert.deepEqual(result.foreignHistory,[{version:foreign.version,name:foreign.name,action:'preserve'}]);
 assert.equal(maintenanceMigrationPlan([...observed,{...row,source_sha256:'0'.repeat(64)}],manifest).conflicts.length,1);
 assert.equal(maintenanceMigrationPlan([...observed,{...row,version:'20990101000003'}],manifest).conflicts.length,1);
});
test('reviewed recordings cannot normalize extra SQL, changed privileges, table/role sets, unpinned files or ambiguous evidence',()=>{
 const {catalog,source,sha,manifest}=recordingFixture(),read=file=>readFileSync(file,'utf8');
 const verify=sources=>reviewedRevokeRecordings(catalog,{...manifest,sources},read);
 for(const sql of [source.recorded_sql+' select 1;',source.recorded_sql.replace('truncate','select'),source.recorded_sql.replace('public.homes','public.other_app'),source.recorded_sql.replace('from public, anon, authenticated','from public, anon, service_role'),source.recorded_sql.replace(';','; -- unreviewed inline comment'),"select 'revoke truncate';"]){
  assert.throws(()=>verify([{...source,recorded_sql:sql,recorded_sha256:sha(sql)}]));
 }
 for(const change of [{source_sha256:'0'.repeat(64)},{recorded_sha256:'0'.repeat(64)},{recorded_version:20990101000001},{recorded_name:'other_application_fixture'},{file:'supabase/migrations/not-a-pin.sql'},{extra:true}])assert.throws(()=>verify([{...source,...change}]));
 assert.throws(()=>verify([source,source]));assert.throws(()=>reviewedRevokeRecordings(catalog,{...manifest,format:'unreviewed'},read));
 assert.throws(()=>reviewedRevokeRecordings(catalog,manifest,()=>read(source.file)+'select 1;'));
});
test('recorded baseline hashes identify seven applied sources despite different version IDs, without replay or history repair',()=>{
 const foreign={version:'20990101000000',name:'other_application_fixture',source_sha256:'f'.repeat(64)};
 const plan=maintenanceMigrationPlan([...observed,foreign]);
 assert.equal(plan.recorded.length,7);assert.equal(plan.recorded.every(row=>!row.sameVersion),true);assert.deepEqual(plan.conflicts,[]);assert.equal(plan.pending.length,127);
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
 assert.equal(catalog.length,134);
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
 assert.equal(plan.pending.length,126);
 assert.equal(plan.pending.includes(hardening.file),false);
 assert.deepEqual(plan.conflicts,[]);
 assert.equal(plan.automaticApplyAllowed,false);
 assert.equal(plan.historyRepairAllowed,false);
});
