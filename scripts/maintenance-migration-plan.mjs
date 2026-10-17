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
export function maintenanceMigrationPlan(history){
 const result=reconcileMaintenanceMigrationHistory(maintenanceMigrationCatalog(),history);
 const reviewNames=new Set(['ouchi_account_closure_review','ouchi_closure_review_private_access','ouchi_closure_reauth_markers','ouchi_closure_reauth_lifecycle','ouchi_closure_review_erasure','ouchi_closure_actor_context_compatibility']);
 const reviewRuntimeMigrations=maintenanceMigrationCatalog().filter(row=>reviewNames.has(row.name));
 if(reviewRuntimeMigrations.length!==reviewNames.size)throw Error('Complete canonical review runtime required');
 return {...result,reviewRuntimeMigrations,scope:result.scope+'; canonical source reconciliation does not prove production readiness or authorize application'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node scripts/maintenance-migration-plan.mjs <read-only-history.json>');
 const history=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
 process.stdout.write(JSON.stringify(maintenanceMigrationPlan(history),null,2)+'\n');
}
