import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {runAccountDeletion, type DeletionScope} from './account-deletion-worker';
import {storedDeletionDependencies} from './account-deletion-worker-store';
import {storedDeletionFinalization} from './account-deletion-finalization-store';

type Options = {
  clientForRun: (signal: AbortSignal) => SupabaseClient;
  prepareReviewedAttachments: (scope: DeletionScope, signal: AbortSignal) => Promise<boolean>;
};
type Result = {state: 'idle' | 'busy' | 'unavailable' | 'pending' | 'complete'};
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
function claimedScope(value: unknown): Readonly<DeletionScope> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Deletion claim unconfirmed');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'epochID,leaseToken,leaseUntil,requestID,userID'
    || ![row.requestID,row.userID,row.epochID,row.leaseToken].every(uuid)
    || typeof row.leaseUntil !== 'string' || !Number.isFinite(Date.parse(row.leaseUntil))
    || Date.parse(row.leaseUntil) <= Date.now()) throw Error('Deletion claim unconfirmed');
  // Server lease predicates authorize every stage. A local timestamp never
  // substitutes for them and is never used to infer a completed deletion.
  return Object.freeze({requestID:row.requestID as string,userID:row.userID as string,
    epochID:row.epochID as string,leaseToken:row.leaseToken as string});
}

/** Dormant one-job dispatcher. No route, timer, environment lookup, credentials,
 * policy approval or shared Auth deletion. The caller must supply a bounded
 * service client and the actual private reviewed-file prelude. Sealed retention
 * evidence is only read by the stored tail; this component cannot create it.
 */
export function createAccountDeletionDispatcher(options: Options) {
  if (typeof options?.clientForRun !== 'function' || typeof options.prepareReviewedAttachments !== 'function') {
    throw Error('Complete explicit deletion dispatcher configuration required');
  }
  const clientForRun = options.clientForRun, prepare = options.prepareReviewedAttachments;
  let running = false;
  return Object.freeze({async runNext(callerSignal: AbortSignal): Promise<Result> {
    if (!(callerSignal instanceof AbortSignal)) throw Error('Bounded dispatcher signal required');
    if (running) return {state:'busy'};
    if (callerSignal.aborted) return {state:'unavailable'};
    running = true;
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(90000)]);
    try {
      const db = clientForRun(signal);
      if (typeof db?.rpc !== 'function' || typeof db.storage?.from !== 'function') return {state:'unavailable'};
      const deps = storedDeletionDependencies(db, storedDeletionFinalization(db,signal,
        scope => prepare(scope,signal)),signal);
      const claim = await db.rpc('claim_maintenance_account_deletion');
      if (signal.aborted || claim.error) return {state:'unavailable'};
      if (claim.data === null) return {state:'idle'};
      const scope = claimedScope(claim.data);
      const result = await runAccountDeletion(scope,deps,signal);
      if (result.state === 'complete') return {state:'complete'};
      if (signal.aborted) return {state:'pending'};
      // A lost completion reply can follow COMMIT, which clears the lease.
      // Re-read the exact canonical receipt before deferring the SAME job.
      try {
        if (await deps.completionAlreadyConfirmed!(scope) === true && !signal.aborted) return {state:'complete'};
      } catch { return {state:'pending'}; }
      if (signal.aborted) return {state:'pending'};
      try {
        await db.rpc('defer_maintenance_account_deletion', {
          target_request:scope.requestID,target_user:scope.userID,
          target_epoch:scope.epochID,target_lease:scope.leaseToken,
        });
      } catch { return {state:'pending'}; }
      // Defer failure/lost reply stays pending. Never spin, fabricate a new
      // request, force a lease, or report completion from a defer response.
      return {state:'pending'};
    } catch { return {state:'unavailable'}; }
    finally { running = false; }
  }});
}
