const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const version=value=>typeof value==='string'&&/^\d{14}$/.test(value);
/** Read-only reconciliation. Name/version alone never proves applied SQL.
 * Preserve other applications' history; never emit repair or execution commands.
 * Byte equality proves recorded source only, not current effective schema/RLS.
 */
export function reconcileMaintenanceMigrationHistory(catalog,history){
 if(!Array.isArray(catalog)||!Array.isArray(history))throw Error('Explicit migration inventories required');
 const names=new Set(),versions=new Set();
 for(const row of catalog){
  if(!version(row.version)||typeof row.name!=='string'||!row.name||!digest(row.source_sha256)||row.file!==`supabase/migrations/${row.version}_${row.name}.sql`||!/^[a-z0-9_]+$/.test(row.name)||names.has(row.name)||versions.has(row.version))throw Error('Unambiguous local migration catalog required');
  names.add(row.name);versions.add(row.version);
 }
 const remoteVersions=new Set();
 for(const row of history){
  if(!version(row.version)||typeof row.name!=='string'||!row.name||row.name.length>200||remoteVersions.has(row.version)||(row.source_sha256!==undefined&&!digest(row.source_sha256)))throw Error('Unambiguous recorded migration history required');
  remoteVersions.add(row.version);
 }
 const recorded=[],pending=[],conflicts=[],used=new Set();
 for(const file of catalog){
  const sameVersion=history.find(row=>row.version===file.version);
  if(sameVersion&&(sameVersion.name!==file.name||sameVersion.source_sha256!==file.source_sha256)){
   conflicts.push({file:file.file,reason:'version_or_source_conflict'});continue;
  }
  const sameName=history.filter(row=>row.name===file.name),exact=sameName.filter(row=>row.source_sha256===file.source_sha256);
  if(sameName.length>1){conflicts.push({file:file.file,reason:'ambiguous_recorded_source'});}
  else if(exact.length===1){const match=exact[0];used.add(match.version);recorded.push({file:file.file,localVersion:file.version,recordedVersion:match.version,source_sha256:file.source_sha256,sameVersion:match.version===file.version});}
  else if(sameName.length){conflicts.push({file:file.file,reason:exact.length>1?'ambiguous_recorded_source':'recorded_source_not_equal'});}
  else pending.push(file.file);
 }
 const foreignHistory=history.filter(row=>!names.has(row.name)&&!used.has(row.version)).map(row=>({version:row.version,name:row.name,action:'preserve'}));
 return Object.freeze({recorded,pending,conflicts,foreignHistory,
  historyAligned:conflicts.length===0&&foreignHistory.length===0&&recorded.every(row=>row.sameVersion),
  automaticApplyAllowed:false,historyRepairAllowed:false,
  scope:'recorded-source-comparison-only; effective schema, privileges and rollout require separate review'});
}
