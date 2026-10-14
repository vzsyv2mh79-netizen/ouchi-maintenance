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
 const line=readFileSync(resolve(root,'.github/workflows/family-storage-integration.yml'),'utf8').split('\n').find(value=>value.trim().startsWith('for file in '));
 const ordered=line?.match(/supabase\/migrations\/[a-z0-9_]+\.sql/g)??[];
 if(ordered.length!==catalog.size||new Set(ordered).size!==catalog.size||ordered.some(file=>!catalog.has(file)))throw Error('Complete tested migration order required');
 return ordered.map(file=>catalog.get(file));
}
export function maintenanceMigrationPlan(history){
 const result=reconcileMaintenanceMigrationHistory(maintenanceMigrationCatalog(),history);
 const additionalReviewRuntimeCandidates=['account-closure-review','closure-review-private-access','closure-reauth-markers','closure-reauth-lifecycle'].map(name=>{
  const file='tests/fixtures/'+name+'.sql';
  return {file,source_sha256:createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'),status:'fixture_only_not_canonical_do_not_apply'};
 });
 return {...result,additionalReviewRuntimeCandidates,scope:result.scope+'; pending list covers canonical migrations only, not fixture SQL or production readiness'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node scripts/maintenance-migration-plan.mjs <read-only-history.json>');
 const history=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
 process.stdout.write(JSON.stringify(maintenanceMigrationPlan(history),null,2)+'\n');
}
