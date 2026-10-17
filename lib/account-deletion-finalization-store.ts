import type {SupabaseClient} from '@supabase/supabase-js';
import type {DeletionScope} from './account-deletion-worker';
import {storedDeletionCompletion,type DeletionFinalization} from './account-deletion-worker-store';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** Dormant server tail. Supply a bounded service transport explicitly. Native
 * acknowledgement means server registration absence after canonical unknown-send
 * reconciliation, never a remote device/Keychain wipe. Client cleanup stays
 * independent. Retention is READ from sealed checker evidence, never invented.
 * No environment discovery, checker approval, scheduler or shared Auth deletion.
 */
export function storedDeletionFinalization(db:SupabaseClient,signal:AbortSignal,prepareReviewedAttachments?:DeletionFinalization['prepareReviewedAttachments']):DeletionFinalization{
 if(typeof db?.rpc!=='function'||!(signal instanceof AbortSignal)||(prepareReviewedAttachments!==undefined&&typeof prepareReviewedAttachments!=='function'))throw Error('Explicit bounded deletion finalization required');
 const rpc=async(name:string,scope:DeletionScope)=>{
  if(!scope||Object.keys(scope).sort().join(',')!=='epochID,leaseToken,requestID,userID'||!Object.values(scope).every(uuid))throw Error('Exact deletion finalization scope required');
  if(signal.aborted)return false;
  const result=await db.rpc(name,{target_request:scope.requestID,target_user:scope.userID,target_epoch:scope.epochID,target_lease:scope.leaseToken});
  if(result.error||typeof result.data!=='boolean')throw Error('Deletion finalization acknowledgement unavailable');return result.data===true&&!signal.aborted;
 };
 return Object.freeze({
  prepareReviewedAttachments,
  eraseNativeDevices:(scope:DeletionScope)=>rpc('maintenance_deletion_registrations_are_erased',scope),
  finalizeIdentityAndRetention:async(scope:DeletionScope)=>await rpc('erase_maintenance_deletion_identity',scope)&&await rpc('maintenance_deletion_retention_is_confirmed',scope),
  markComplete:storedDeletionCompletion(db,signal),
 });
}
