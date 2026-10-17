import {requireDeletionLease} from './shared-deletion-journal.mjs';
import {normalizeSharedDeletionScope} from './shared-deletion.mjs';
const fixed=s=>({protocolVersion:s.protocolVersion,kind:s.kind,requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,apps:s.apps});
const canonical=s=>JSON.stringify(fixed(normalizeSharedDeletionScope({...s,leaseToken:'00000000-0000-4000-8000-000000000001'})));
/** Local privileged primitive. No production role, endpoint, trigger attachment,
 * automatic reopening/purge or worker bypass is supplied. Every writer needs
 * the reviewed DB gate; a JS-only check is not a fence. prepare belongs inside
 * the journal stage transaction. loadHouseholds must enumerate authoritative
 * membership/ownership after the user's exclusive gate is acquired.
 */
export function createKakeiWriteFence({loadHouseholds}) {
 if(typeof loadHouseholds!=='function')throw Error('Missing authoritative family inventory');
 async function targets(s,tx){
  const houses=await loadHouseholds(s,tx);
  if(!Array.isArray(houses)||houses.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)||id==='00000000-0000-0000-0000-000000000000')||new Set(houses).size!==houses.length)throw Error('Invalid family write inventory');
  return [{kind:'user',id:s.userID},...houses.sort().map(id=>({kind:'household',id}))];
 }
 async function read(s,t,tx,houses){
  const row=(await tx.query('select request_id,scope,household_ids from private.kb_shared_write_fences where target_kind=$1 and target_id=$2',[t.kind,t.id])).rows[0];
  return row?.request_id===s.requestID&&canonical(row.scope)===canonical(s)&&JSON.stringify(row.household_ids)===JSON.stringify(houses);
 }
 async function current(value,tx){
  const s=await requireDeletionLease(tx,value),user={kind:'user',id:s.userID};
  const row=(await tx.query("select household_ids from private.kb_shared_write_fences where target_kind='user' and target_id=$1",[s.userID])).rows[0];
  if(!row||!Array.isArray(row.household_ids))return false;
  const houses=row.household_ids;
  const live=(await targets(s,tx)).filter(t=>t.kind==='household').map(t=>t.id);
  if(live.some(id=>!houses.includes(id)))return false;
  for(const t of [user,...houses.map(id=>({kind:'household',id}))])if(!await read(s,t,tx,houses))return false;return true;
 }
 return {
  async prepare(value,tx){
   const s=await requireDeletionLease(tx,value);if(!s.apps.some(a=>a.app==='kakei'))throw Error('Kakei missing');
   await tx.query('select private.kb_lock_write_targets($1::uuid[],array[]::uuid[],true)',[[s.userID]]);
   const rows=await targets(s,tx);
   const houses=rows.filter(t=>t.kind==='household').map(t=>t.id);
   await tx.query('select private.kb_lock_write_targets(array[]::uuid[],$1::uuid[],true)',[rows.filter(t=>t.kind==='household').map(t=>t.id)]);
   for(const t of rows){
    await tx.query('insert into private.kb_shared_write_fences(target_kind,target_id,request_id,scope,household_ids) values($1,$2,$3,$4,$5) on conflict(target_kind,target_id) do nothing',[t.kind,t.id,s.requestID,fixed(s),houses]);
    if(!await read(s,t,tx,houses))throw Error('Write fence belongs to another inventory');
   }
   await requireDeletionLease(tx,s);return true;
  },
  current,
  async reclaim(value,previousValue,tx){
   const s=normalizeSharedDeletionScope(value),previous=normalizeSharedDeletionScope(previousValue);
   if(s.leaseToken===previous.leaseToken||canonical(s)!==canonical(previous))throw Error('Kakei recovery inventory mismatch');
   // reclaimPrepared validates the actual predecessor in the shared journal.
   // Kakei fences bind immutable inventory, so recovery must not recreate them
   // or enumerate a replacement family list. Read frozen families even after
   // cleanup removed membership. An absent/mismatched stop stays unavailable.
   return current(s,tx);
  },
 };
}
