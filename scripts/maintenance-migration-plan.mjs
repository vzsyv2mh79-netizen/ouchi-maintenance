import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileMaintenanceMigrationHistory} from '../lib/maintenance-migration-history.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function maintenanceMigrationCatalog(){
 const directory=resolve(root,'supabase/migrations');
 const files=readdirSync(directory).filter(name=>name.endsWith('.sql'));
 const catalog=new Map(files.map(name=>{
  const match=/^(\d{14})_([a-z0-9_]+)\.sql$/.exec(name),path=resolve(directory,name);
  if(!match||!lstatSync(path).isFile())throw Error('Canonical regular migration file required');
  return ['supabase/migrations/'+name,{file:'supabase/migrations/'+name,version:match[1],name:match[2],source_sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}];
 }));
 const manifest=JSON.parse(readFileSync(resolve(root,'supabase/maintenance-migration-order.json'),'utf8'));
 return orderPinnedMaintenanceMigrations([...catalog.values()],manifest);
}
/** Explicit source pins are independent of partial integration fixture setup.
 * The regular Node test suite applies this complete order in a disposable DB.
 * A new/missing/changed source refuses planning until its pin is reviewed.
 */
export function orderPinnedMaintenanceMigrations(catalog,manifest){
 if(!Array.isArray(catalog)||!manifest||Object.keys(manifest).sort().join(',')!=='files,format'
  ||manifest.format!=='ouchi-pinned-migration-order/v1'||!Array.isArray(manifest.files))throw Error('Pinned canonical migration order required');
 const local=new Map(catalog.map(row=>[row.file,row]));
 if(local.size!==catalog.length||manifest.files.length!==catalog.length)throw Error('Complete pinned migration order required');
 const seen=new Set();
 return manifest.files.map(pin=>{
  if(!pin||Object.keys(pin).sort().join(',')!=='file,source_sha256'||typeof pin.file!=='string'
   ||!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(pin.file)||seen.has(pin.file)
   ||typeof pin.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(pin.source_sha256))throw Error('Unambiguous pinned migration source required');
  const row=local.get(pin.file);
  if(!row||row.source_sha256!==pin.source_sha256)throw Error('Pinned migration source mismatch');
  seen.add(pin.file);return Object.freeze({...row});
 });
}
/** Deliberately narrow proof: only this single REVOKE grammar permits omission
 * of whole-line comments and whitespace. Never normalize arbitrary SQL, quoted
 * values, privileges or role/table sets. Actual recorded hashes remain visible.
 */
export function reviewedRevokeRecordings(catalog,manifest,readSource){
 if(!manifest||Object.keys(manifest).sort().join(',')!=='format,sources'||manifest.format!=='ouchi-reviewed-recorded-revoke/v1'||!Array.isArray(manifest.sources)||typeof readSource!=='function')throw Error('Explicit reviewed REVOKE recordings required');
 const normalize=text=>{
  if(typeof text!=='string'||Buffer.byteLength(text)>65536)throw Error('Bounded REVOKE source required');
  const normalized=text.replace(/^\s*--[^\n]*$/gm,'').replace(/\s+/g,' ').trim();
  if(!/^revoke truncate, references, trigger on table public\.[a-z_][a-z0-9_]*(?:, public\.[a-z_][a-z0-9_]*)* from public, anon, authenticated;$/.test(normalized))throw Error('Only reviewed narrow REVOKE grammar supported');
  return normalized;
 };
 const seen=new Set();return manifest.sources.map(source=>{
  if(!source||Object.keys(source).sort().join(',')!=='file,recorded_name,recorded_sha256,recorded_sql,recorded_version,source_sha256'||seen.has(source.file))throw Error('Exact reviewed REVOKE source required');
  const file=catalog.find(row=>row.file===source.file&&row.name===source.recorded_name&&row.source_sha256===source.source_sha256);
  if(!file||typeof source.recorded_version!=='string'||!/^\d{14}$/.test(source.recorded_version)
   ||typeof source.recorded_sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.recorded_sha256))throw Error('Pinned REVOKE source required');
  const original=readSource(file.file),sha=text=>createHash('sha256').update(text).digest('hex');
  if(sha(original)!==file.source_sha256||typeof source.recorded_sql!=='string'||sha(source.recorded_sql)!==source.recorded_sha256||normalize(original)!==normalize(source.recorded_sql))throw Error('Recorded REVOKE source does not match pinned SQL');
  seen.add(source.file);const {recorded_sql,...alias}=source;void recorded_sql;return Object.freeze(alias);
 });
}
export function maintenanceMigrationPlan(history,recordingManifest){
 const catalog=maintenanceMigrationCatalog();
 const recordings=recordingManifest===undefined?[]:reviewedRevokeRecordings(catalog,recordingManifest,file=>readFileSync(resolve(root,file),'utf8'));
 const result=reconcileMaintenanceMigrationHistory(catalog,history,recordings);
 const reviewNames=new Set(['ouchi_account_closure_review','ouchi_closure_review_private_access','ouchi_closure_reauth_markers','ouchi_closure_reauth_lifecycle','ouchi_closure_review_erasure','ouchi_closure_actor_context_compatibility']);
 const reviewRuntimeMigrations=maintenanceMigrationCatalog().filter(row=>reviewNames.has(row.name));
 if(reviewRuntimeMigrations.length!==reviewNames.size)throw Error('Complete canonical review runtime required');
 return {...result,reviewRuntimeMigrations,...(recordings.length?{reviewedRecordings:recordings}:{}),scope:result.scope+'; explicit reviewed REVOKE recordings may prove comment/whitespace-only equivalence; reconciliation does not prove production readiness or authorize application'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!(process.argv.length===3||(process.argv.length===5&&process.argv[3]==='--reviewed-recording')))throw Error('Usage: node scripts/maintenance-migration-plan.mjs <read-only-history.json> [--reviewed-recording <reviewed-revoke-json>]');
 const history=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
 const recordingManifest=process.argv.length===5?JSON.parse(readFileSync(resolve(process.argv[4]),'utf8')):undefined;
 process.stdout.write(JSON.stringify(maintenanceMigrationPlan(history,recordingManifest),null,2)+'\n');
}
