import {StorageApiError,type SupabaseClient} from '@supabase/supabase-js';
import type {DeletionScope} from './account-deletion-worker';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** Disabled orchestration component: caller must use a bounded service client,
 * an active lease, and only disposable tests until the deletion rollout is approved.
 * This does not mark an account deletion complete.
 */
export async function eraseAccountDeletionObjects(db:SupabaseClient,scope:DeletionScope,signal?:AbortSignal){
 if(!scope||![scope.requestID,scope.userID,scope.epochID,scope.leaseToken].every(uuid))throw Error('Invalid deletion scope');
 const args=Object.freeze({target_request:scope.requestID,target_user:scope.userID,target_epoch:scope.epochID,target_lease:scope.leaseToken});
 const guard=async()=>{if(signal?.aborted)throw Error('Deletion cancelled');const r=await db.rpc('maintenance_deletion_lease_is_current',args);if(r.error||r.data!==true||signal?.aborted)throw Error('Deletion lease unavailable');};
 await guard();const result=await db.rpc('read_maintenance_deletion_objects',args);
 if(result.error||!Array.isArray(result.data)||result.data.length>25)throw Error('Deletion inventory unavailable');
 const items=result.data.map((value:unknown)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid deletion object');
  const row=value as Record<string,unknown>;
  if(![row.id,row.uploaderID,row.uploaderEpoch].every(uuid)||row.bucket!=='ouchi-product-attachments'||typeof row.path!=='string'||!['png','jpg','pdf'].some(ext=>row.path===`${row.uploaderID}/${row.uploaderEpoch}/${row.id}.${ext}`))throw Error('Invalid deletion path');
  return Object.freeze({id:row.id as string,path:row.path as string});
 });
 if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('Duplicate deletion inventory');
 let completed=0;
 for(const item of items){
  await guard();
  // A lost response can follow a committed Storage removal. Its error is
  // neither completion nor proof of presence. Reconcile the SAME frozen path
  // under the current lease, then require definitive absence and durable SQL
  // acknowledgement; AccessDenied, a timeout or a remaining object still stop.
  try{await db.storage.from('ouchi-product-attachments').remove([item.path]);}catch{/* Outcome reconciled below. */}
  await guard();const missing=await db.storage.from('ouchi-product-attachments').download(item.path);
  // The SDK error code alone is not definitive absence: authorization/server
  // failures must not become durable deletion acknowledgements. Storage 1.74
  // also returns semantic NoSuchKey/404 inside an HTTP 400 download response.
  const absent=missing.error instanceof StorageApiError&&missing.error.code==='NoSuchKey'
   &&((missing.error.status===404&&(missing.error.statusCode===undefined||missing.error.statusCode==='404'))
    ||(missing.error.status===400&&missing.error.statusCode==='404'));
  if(missing.data||!absent)throw Error('Object absence not confirmed');
  await guard();const saved=await db.rpc('confirm_maintenance_deletion_object_absence',{...args,target_attachment:item.id});if(saved.error||saved.data!==true)throw Error('Object acknowledgement unavailable');
  completed++;
 }
 await guard();const remaining=await db.rpc('read_maintenance_deletion_objects',args);if(remaining.error||!Array.isArray(remaining.data))throw Error('Deletion remainder unavailable');
 return {completed,allObjectsConfirmed:remaining.data.length===0};
}
