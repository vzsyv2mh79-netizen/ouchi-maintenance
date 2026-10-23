import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionDependencies, DeletionScope } from './account-deletion-worker';
import { eraseAccountDeletionObjects } from './account-deletion-objects';
import { withClosureReauthenticationErasure } from './closure-reauth-erasure';
/** Dormant service-only completion adapter. SQL independently requires a sealed,
 * fresh retention check and confirmed identity erasure. No approval is created.
 */
export function storedDeletionCompletion(db: SupabaseClient, signal?: AbortSignal) {
 return async (scope: DeletionScope) => {
  if (signal?.aborted) return false;
  const result = await db.rpc('complete_maintenance_account_deletion', {
   target_request: scope.requestID, target_user: scope.userID,
   target_epoch: scope.epochID, target_lease: scope.leaseToken,
  });
  if (result.error || typeof result.data !== 'boolean') throw new Error('Deletion completion unavailable');
  return result.data === true && !signal?.aborted;
 };
}
/** These stages remain mandatory; Web push cleanup alone does not prove them. */
export type DeletionFinalization = Pick<DeletionDependencies, 'finalizeIdentityAndRetention' | 'markComplete'> & {
 eraseNativeDevices: (scope: DeletionScope) => Promise<boolean>;
 prepareReviewedAttachments?: (scope: DeletionScope) => Promise<boolean>;
};
/** Disabled server adapter. Supply a bounded service transport and cancellation.
 * Tail adapters must enforce the same lease independently and acknowledge durable
 * native cleanup/retention/completion. No scheduler or shared Auth deletion here.
 */
export function storedDeletionDependencies(db: SupabaseClient, tail: DeletionFinalization, signal?: AbortSignal): DeletionDependencies {
 if (!tail || (tail.prepareReviewedAttachments!==undefined&&typeof tail.prepareReviewedAttachments!=='function') || ['eraseNativeDevices', 'finalizeIdentityAndRetention', 'markComplete'].some(name =>
   typeof tail[name as keyof DeletionFinalization] !== 'function')) {
  throw new Error('Deletion finalization is not configured');
 }
 const rpc = async (name: string, scope: DeletionScope, requireBoolean = false) => {
  if (signal?.aborted) return false;
  const result = await db.rpc(name, {target_request: scope.requestID, target_user: scope.userID, target_epoch: scope.epochID, target_lease: scope.leaseToken});
  if (result.error) throw new Error('Deletion stage unavailable');
  if (requireBoolean && typeof result.data !== 'boolean') throw new Error('Deletion checkpoint unavailable');
  return result.data === true && !signal?.aborted;
 };
 const base=withClosureReauthenticationErasure({
  prepareReviewedAttachments: tail.prepareReviewedAttachments,
  completionAlreadyConfirmed: scope => rpc('maintenance_deletion_completion_is_confirmed', scope, true),
  identityAlreadyErased: scope => rpc('maintenance_deletion_identity_is_erased', scope, true),
  leaseCurrent: scope => rpc('maintenance_deletion_lease_is_current', scope),
  revokeAndCaptureInventory: scope => rpc('capture_maintenance_deletion_objects', scope),
  eraseDeviceRegistrations: async scope => {
   if (!await rpc('erase_maintenance_deletion_web_push', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_native_push', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_native_delivery_identities', scope)) return false;
   return await tail.eraseNativeDevices(scope) === true && !signal?.aborted;
  },
  eraseAttachments: async scope => (await eraseAccountDeletionObjects(db, scope, signal)).allObjectsConfirmed === true && !signal?.aborted,
  eraseRecords: async scope => {
   if (!await rpc('erase_maintenance_deletion_records', scope)) return false;
   if (!await rpc('erase_reviewed_retirement_metadata', scope, true)) return false;
   if (!await rpc('erase_maintenance_deletion_reconciliation', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_reminder_schedule', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_notifications', scope)) return false;
   if (!await rpc('capture_maintenance_deletion_receipt_sessions', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_enrollment_consents', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_prior_preferences', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_restore_jobs', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_restore_proofs', scope)) return false;
   if (!await rpc('minimize_maintenance_deletion_object_inventory', scope)) return false;
   if (!await rpc('erase_maintenance_deletion_management_claims', scope, true)) return false;
   return rpc('erase_maintenance_deletion_purchase_ledger', scope);
  },
  finalizeIdentityAndRetention: tail.finalizeIdentityAndRetention,
  markComplete: async scope => await rpc('erase_maintenance_deletion_management_claims', scope, true) && await tail.markComplete(scope) === true,
 }, db, signal);
 // A resumed completion also clears reviewed references before the closure
 // wrapper can remove their parent review. The SQL check remains mandatory.
 return {...base,markComplete:async scope=>await rpc('erase_reviewed_retirement_metadata',scope,true)&&await base.markComplete(scope)===true};
}
