import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeletionRequestDependencies } from './account-deletion-request';
import { sessionAfterAuthVerification } from './verified-app-session';
/** Supply bounded server/temporary Auth clients. No production route is enabled. */
export function deletionRequestDependencies(admin: SupabaseClient, temporaryAuth: () => SupabaseClient): DeletionRequestDependencies {
 return {
  verify: async bearer => {
   const result = await admin.auth.getUser(bearer);
   if (result.error || !result.data.user?.email) return null;
   const session = sessionAfterAuthVerification(bearer, result.data.user.id);
   if (!session) return null;
   const epoch = await admin.rpc('current_maintenance_purchase_account', {target_user: session.userID, verified_session: session.sessionID});
   if (epoch.error || typeof epoch.data !== 'string') return null;
   return {...session, email: result.data.user.email, epochID: epoch.data};
  },
  reauthenticate: async (email, password) => {
   const auth = temporaryAuth();
   try {
    const result = await auth.auth.signInWithPassword({email, password});
    if (result.error || !result.data.user || !result.data.session) return null;
    return result.data.user.id;
   } finally {
    const cleanup = await auth.auth.signOut({scope: 'local'});
    if (cleanup.error) throw new Error('Temporary authentication cleanup failed');
   }
  },
  enqueue: async identity => {
   const result = await admin.rpc('request_maintenance_account_deletion', {target_user: identity.userID, verified_session: identity.sessionID, target_epoch: identity.epochID});
   if (result.error || typeof result.data !== 'string') throw new Error('Deletion request not acknowledged');
   return result.data;
  },
 };
}
