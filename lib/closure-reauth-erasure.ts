import type {SupabaseClient} from '@supabase/supabase-js';
import type {DeletionDependencies,DeletionScope} from './account-deletion-worker';
/** Prepared composition only. The matching SQL lifecycle candidate must be
 * installed and its scheduler/retention policy approved before deployment.
 * Current lease + retired enrollment are enforced independently by SQL.
 * Both record erasure and resumed completion must acknowledge marker and review cleanup.
 * This does not schedule work, approve retention or delete shared Auth globally.
 */
export function withClosureReauthenticationErasure(deps:DeletionDependencies,db:SupabaseClient,signal?:AbortSignal):DeletionDependencies{
 if(typeof deps?.eraseRecords!=='function'||typeof deps?.markComplete!=='function'||typeof db?.rpc!=='function')throw Error('Complete scoped erasure adapters required');
 const erase=async(scope:DeletionScope)=>{
  if(signal?.aborted)return false;
  const result=await db.rpc('erase_maintenance_deletion_closure_metadata',{target_request:scope.requestID,target_user:scope.userID,target_epoch:scope.epochID,target_lease:scope.leaseToken});
  if(result.error||typeof result.data!=='boolean')throw Error('Closure metadata erasure unavailable');
  return result.data===true&&!signal?.aborted;
 };
 return {...deps,eraseRecords:async scope=>await erase(scope)&&await deps.eraseRecords(scope)===true,
  markComplete:async scope=>await erase(scope)&&await deps.markComplete(scope)===true};
}
