import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionDependencies, DeletionScope } from './account-deletion-worker';
import { eraseAccountDeletionObjects } from './account-deletion-objects';
/** These stages remain mandatory; Web push cleanup alone does not prove them. */
export type DeletionFinalization = Pick<DeletionDependencies, 'finalizeIdentityAndRetention' | 'markComplete'> & {
 eraseNativeDevices: (scope: DeletionScope) => Promise<boolean>;
};
/** Disabled server adapter. Supply a bounded service transport and cancellation.
 * Tail adapters must enforce the same lease independently and acknowledge durable
 * native cleanup/retention/completion. No scheduler or shared Auth deletion here.
 */
export function storedDeletionDependencies(db: SupabaseClient, tail: DeletionFinalization, signal?: AbortSignal): DeletionDependencies {
 const rpc = async (name: string, scope: DeletionScope) => {
  if (signal?.aborted) return false;
  const result = await db.rpc(name, {target_request: scope.requestID, target_user: scope.userID, target_epoch: scope.epochID, target_lease: scope.leaseToken});
  if (result.error) throw new Error('Deletion stage unavailable');
  return result.data === true && !signal?.aborted;
 };
 return {
  leaseCurrent: scope => rpc('maintenance_deletion_lease_is_current', scope),
  revokeAndCaptureInventory: scope => rpc('capture_maintenance_deletion_objects', scope),
  eraseDeviceRegistrations: async scope => {
   if (!await rpc('erase_maintenance_deletion_web_push', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_native_push', scope)) return false;
   return await tail.eraseNativeDevices(scope) === true && !signal?.aborted;
  },
  eraseAttachments: async scope => (await eraseAccountDeletionObjects(db, scope, signal)).allObjectsConfirmed === true && !signal?.aborted,
  eraseRecords: scope => rpc('erase_maintenance_deletion_records', scope),
  finalizeIdentityAndRetention: tail.finalizeIdentityAndRetention,
  markComplete: tail.markComplete,
 };
}
