import {createSharedMaintenanceAdapter, type SharedMaintenancePorts} from './shared-maintenance-adapter';
import {normalizeSharedDeletionScope, type SharedDeletionScope} from './shared-deletion-protocol.mjs';

export type SharedMaintenanceTransaction = {
 query: (sql: string, values?: unknown[]) => Promise<{rows: Record<string, unknown>[]} >;
 beforeCommit: (name: string, check: () => Promise<boolean>) => void;
 signal: AbortSignal;
};
type Check = (scope: SharedDeletionScope, tx: SharedMaintenanceTransaction, signal: AbortSignal) => Promise<boolean>;
export type SharedPeerDeletionPorts = {
 handoffFamily: Check; verifyFamily: Check; verifySessions: Check;
 verifyFamilyAfterAuth: Check; verifySessionsAfterAuth: Check;
 erase: Check; verify: Check;
};
export type SharedPeerDeletionReadbacks = Pick<SharedPeerDeletionPorts,
 'verifyFamily' | 'verifySessions' | 'verifyFamilyAfterAuth' | 'verifySessionsAfterAuth' | 'verify'>;
type NativePorts = (scope: SharedDeletionScope, tx: SharedMaintenanceTransaction, signal: AbortSignal) => SharedMaintenancePorts;
type Outcome = {confirmed: boolean; verify: () => Promise<boolean>};
type Operation = (scope: SharedDeletionScope, tx: SharedMaintenanceTransaction) => Promise<Outcome>;

/** Application-owned composition for the existing shared journal. Every handler
 * receives its owner's already checked, pinned transaction. The port factory
 * must reuse that exact tx; SQL mutation ports use the canonical metadata
 * boundary, never a nested transaction or an independent RPC. Remote effects
 * still require their own fixed outbox and definitive result readback.
 *
 * Stage ports may register their own COMMIT hooks. Separate readbacks MUST NOT
 * register hooks or mutate state: registration is closed when these run. They
 * retain the same current scope, prerequisites, fences, coverage, content,
 * sessions and Auth absence checks. Prior receipts are not current readbacks.
 * Both applications supply independent READ-ONLY family/session/app readbacks,
 * including immediately before the owning COMMIT. The owner still supplies
 * prepare, coverage, Auth, completion and retention gates. No defaults, journal,
 * connection, role, route, scheduler or production Auth deletion are created.
 */
export function composeSharedMaintenanceHandlers(makePorts: NativePorts,
 peer: SharedPeerDeletionPorts, signal: AbortSignal, readbacks: SharedPeerDeletionReadbacks) {
 const fixed = Object.freeze({...peer});
 const reads = Object.freeze({...readbacks});
 if (typeof makePorts !== 'function' || !(signal instanceof AbortSignal)
  || ['handoffFamily','verifyFamily','verifySessions','verifyFamilyAfterAuth','verifySessionsAfterAuth','erase','verify']
   .some(name => typeof fixed[name as keyof SharedPeerDeletionPorts] !== 'function')
  || ['verifyFamily','verifySessions','verifyFamilyAfterAuth','verifySessionsAfterAuth','verify']
   .some(name => typeof reads[name as keyof SharedPeerDeletionReadbacks] !== 'function')) throw Error('Complete shared composition providers required');
 const transactions = new WeakMap<SharedMaintenanceTransaction, {key: string; failed: boolean; verifiers: Map<Operation, () => Promise<boolean>>}>();
 const handler = (operation: Operation) => async (value: unknown, tx: SharedMaintenanceTransaction) => {
  let state = tx && transactions.get(tx);
  try {
   if (!tx || typeof tx.query !== 'function' || typeof tx.beforeCommit !== 'function'
    || !(tx.signal instanceof AbortSignal)) throw Error('Checked shared transaction required');
   signal.throwIfAborted(); tx.signal.throwIfAborted();
   const scope = normalizeSharedDeletionScope(value);
   if (!scope.apps.some(app => app.app === 'ouchi-maintenance')) throw Error('Maintenance missing from fixed inventory');
   const key = JSON.stringify(scope);
   if (state && (state.failed || state.key !== key)) throw Error('Composition transaction changed or failed');
   if (!state) {
    state = {key, failed: false, verifiers: new Map()}; transactions.set(tx, state);
    const original = state;
    tx.beforeCommit('shared-maintenance-composition:' + scope.requestID, async () => {
     try {
      if (original.failed || signal.aborted || tx.signal.aborted) return false;
      for (const verify of original.verifiers.values()) {
       if (await verify() !== true || signal.aborted || tx.signal.aborted) {
        original.failed = true; return false;
       }
      }
      return !original.failed;
     } catch { original.failed = true; return false; }
    });
   }
   const result = await operation(scope, tx);
   if (result.confirmed !== true || typeof result.verify !== 'function') throw Error('Shared application stage unconfirmed');
   signal.throwIfAborted(); tx.signal.throwIfAborted();
   // Repetition cannot replace the first same-transaction verifier with an
   // easier one. All fixed operation identities are owned by this factory.
   if (!state.verifiers.has(operation)) state.verifiers.set(operation, result.verify);
   return true;
  } catch (error) {
   if (state) state.failed = true;
   throw error;
  }
 };
 const adapter = (s: SharedDeletionScope, tx: SharedMaintenanceTransaction) =>
  createSharedMaintenanceAdapter(makePorts(s, tx, signal), signal);
 const family = handler(async (s, tx) => {
  const native = adapter(s, tx);
  const verify = async () => await reads.verifyFamily(s, tx, signal) === true && await native.verifyFamily(s) === true;
  return {confirmed: await fixed.verifyFamily(s, tx, signal) === true && await native.verifyFamily(s) === true, verify};
 });
 const sessions = handler(async (s, tx) => {
  const native = adapter(s, tx);
  const verify = async () => await reads.verifySessions(s, tx, signal) === true && await native.verifySessions(s) === true;
  return {confirmed: await fixed.verifySessions(s, tx, signal) === true && await native.verifySessions(s) === true, verify};
 });
 return Object.freeze({
  'handoff-family': handler(async (s, tx) => {
   const native = adapter(s, tx);
   return {confirmed: await fixed.handoffFamily(s, tx, signal) === true && await native.handoff(s) === true,
    verify: async () => await reads.verifyFamily(s, tx, signal) === true && await native.verifyFamily(s) === true};
  }),
  'verify-family-before': family, 'verify-family': family,
  'verify-sessions-before': sessions, 'verify-sessions': sessions,
  'verify-family-after-auth': handler(async (s, tx) => {
   const native = adapter(s, tx);
   const verify = async () => await reads.verifyFamilyAfterAuth(s, tx, signal) === true && await native.verifyFamilyAfterAuth(s) === true;
   return {confirmed: await fixed.verifyFamilyAfterAuth(s, tx, signal) === true && await native.verifyFamilyAfterAuth(s) === true, verify};
  }),
  'verify-sessions-after-auth': handler(async (s, tx) => {
   const native = adapter(s, tx);
   const verify = async () => await reads.verifySessionsAfterAuth(s, tx, signal) === true && await native.verifySessionsAfterAuth(s) === true;
   return {confirmed: await fixed.verifySessionsAfterAuth(s, tx, signal) === true && await native.verifySessionsAfterAuth(s) === true, verify};
  }),
  'erase:kakei': handler(async (s, tx) => ({confirmed: await fixed.erase(s, tx, signal) === true,
   verify: () => reads.verify(s, tx, signal)})),
  'verify:kakei': handler(async (s, tx) => ({confirmed: await fixed.verify(s, tx, signal) === true,
   verify: () => reads.verify(s, tx, signal)})),
  'erase:ouchi-maintenance': handler(async (s, tx) => {
   const native = adapter(s, tx);return {confirmed: await native.erase(s), verify: () => native.verify(s)};
  }),
  'verify:ouchi-maintenance': handler(async (s, tx) => {
   const native = adapter(s, tx);return {confirmed: await native.verify(s), verify: () => native.verify(s)};
  }),
 });
}
