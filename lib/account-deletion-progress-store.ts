import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionProgressDependencies } from './account-deletion-progress';
/** Caller supplies a bounded server client and an already verified identity.
 * No production route or global client is initialized here.
 */
export function deletionProgressReader(db: SupabaseClient) {
 return async (scope: Readonly<{requestID: string | null; userID: string}>): Promise<unknown> => {
  const fixed = Object.freeze({...scope});
  const result = fixed.requestID === null
   ? await db.rpc('read_maintenance_current_deletion_progress', {target_user: fixed.userID})
   : await db.rpc('read_maintenance_deletion_progress', {target_request: fixed.requestID, target_user: fixed.userID});
  if (result.error) throw new Error('Deletion progress unavailable');
  return result.data;
 };
}
export function deletionProgressDependencies(db: SupabaseClient): DeletionProgressDependencies {
 return {
  verify: async bearer => {
   const result = await db.auth.getUser(bearer);
   return result.error ? null : result.data.user?.id ?? null;
  },
  read: deletionProgressReader(db),
 };
}
