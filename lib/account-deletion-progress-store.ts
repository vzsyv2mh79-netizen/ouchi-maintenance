import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionProgressDependencies } from './account-deletion-progress';
import { sessionAfterAuthVerification } from './verified-app-session';
/** Caller supplies a bounded server client and an already verified identity.
 * No production route or global client is initialized here.
 */
export function deletionProgressReader(db: SupabaseClient) {
 return async (scope: Readonly<{requestID: string | null; userID: string}>, verifiedBearer: string): Promise<unknown> => {
  const fixed = Object.freeze({...scope});
  // This exact bearer must already have passed verify() in the request handler.
  const session = sessionAfterAuthVerification(verifiedBearer, fixed.userID);
  if (!session) throw Error('Deletion progress session unavailable');
  const result = await db.rpc(fixed.requestID === null ? 'read_maintenance_session_deletion_lookup' : 'read_maintenance_session_deletion_progress', {
   target_user: fixed.userID, verified_session: session.sessionID, target_request: fixed.requestID,
  });
  if (result.error) throw new Error('Deletion progress unavailable');
  return result.data;
 };
}
export function deletionProgressDependencies(db: SupabaseClient): DeletionProgressDependencies {
 return {
  verify: async bearer => {
   const result = await db.auth.getUser(bearer);
   if (result.error || !result.data.user) return null;
   const session = sessionAfterAuthVerification(bearer, result.data.user.id);
   if (!session) return null;
   const current = await db.rpc('maintenance_auth_session_is_current', {
    target_user: session.userID, verified_session: session.sessionID,
   });
   if (current.error) throw Error('Deletion session check unavailable');
   return current.data === true ? session.userID : null;
  },
  read: deletionProgressReader(db),
 };
}
