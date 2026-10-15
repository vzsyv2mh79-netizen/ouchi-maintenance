import {runAccountDeletion, type DeletionScope} from './account-deletion-worker';
import {normalizeSharedDeletionScope, type SharedDeletionScope} from './shared-deletion-protocol.mjs';

export type MaintenanceMapping = Readonly<{
 shared: SharedDeletionScope;
 app: SharedDeletionScope['apps'][number];
}>;
export type MaintenanceWorkerStage = 'completionAlreadyConfirmed' | 'leaseCurrent'
 | 'revokeAndCaptureInventory' | 'eraseDeviceRegistrations' | 'eraseAttachments'
 | 'eraseRecords' | 'finalizeIdentityAndRetention' | 'markComplete';
type Check = (mapping: MaintenanceMapping, signal: AbortSignal) => Promise<boolean>;
export type SharedMaintenancePorts = {
 resolve: (mapping: MaintenanceMapping, signal: AbortSignal) => Promise<unknown>;
 atomic: (mapping: MaintenanceMapping, native: Readonly<DeletionScope>, stage: MaintenanceWorkerStage, signal: AbortSignal) => Promise<boolean>;
 verify: (mapping: MaintenanceMapping, native: Readonly<DeletionScope>, signal: AbortSignal) => Promise<boolean>;
 handoff: Check; family: Check; sessions: Check; familyAfterAuth: Check; sessionsAfterAuth: Check;
};
const uuid = (value: unknown): value is string => typeof value === 'string'
 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
 && value !== '00000000-0000-0000-0000-000000000000';
function mapping(value: unknown): MaintenanceMapping {
 const shared = normalizeSharedDeletionScope(value);
 const app = shared.apps.find(item => item.app === 'ouchi-maintenance');
 if (!app) throw Error('Maintenance missing from fixed inventory');
 return Object.freeze({shared, app});
}
function nativeScope(value: unknown, fixed: MaintenanceMapping): Readonly<DeletionScope> {
 if (!value || typeof value !== 'object' || Array.isArray(value)
  || Object.keys(value).sort().join(',') !== 'epochID,leaseToken,requestID,userID'
  || !Object.values(value).every(uuid)) throw Error('Fixed native binding required');
 const native = value as DeletionScope;
 if (native.requestID !== fixed.app.requestID || native.userID !== fixed.shared.userID
  || native.epochID !== fixed.app.scopeID
  || native.leaseToken.toLowerCase() === fixed.shared.leaseToken.toLowerCase()) throw Error('Independent matching native lease required');
 return Object.freeze({...native});
}
/** Dormant application-owned bridge to the actual worker. This is NOT a
 * transaction provider: atomic must enforce the shared/native leases, complete
 * inventory and current family/session/writer gates in the same durable boundary
 * as each mutation. SQL metadata stages use the coordinator's pinned transaction
 * and withSharedMaintenanceClosureMetadata; never an independent RPC connection.
 * Remote effects need their own frozen outbox and definitive absence readback.
 * No defaults, Auth-delete port, credentials, schema or scheduler are created.
 */
export function createSharedMaintenanceAdapter(ports: SharedMaintenancePorts, signal: AbortSignal) {
 if (!(signal instanceof AbortSignal) || !ports
  || ['resolve','atomic','verify','handoff','family','sessions','familyAfterAuth','sessionsAfterAuth']
   .some(key => typeof ports[key as keyof SharedMaintenancePorts] !== 'function')) throw Error('Complete maintenance ports and cancellation required');
 // Freeze provider identities as well as scope; a pending callback cannot swap
 // the verifier or durable boundary halfway through a worker run.
 const fixedPorts = Object.freeze({...ports});
 const check = (name: 'handoff' | 'family' | 'sessions' | 'familyAfterAuth' | 'sessionsAfterAuth') => async (value: unknown) => {
  try {
   signal.throwIfAborted();
   const result = await fixedPorts[name](mapping(value), signal);
   signal.throwIfAborted(); return result === true;
  } catch { return false; }
 };
 async function resolve(value: unknown) {
  signal.throwIfAborted(); const fixed = mapping(value);
  const raw = await fixedPorts.resolve(fixed, signal);
  signal.throwIfAborted(); return {fixed, native: nativeScope(raw, fixed)};
 }
 async function verify(fixed: MaintenanceMapping, native: Readonly<DeletionScope>) {
  signal.throwIfAborted(); const result = await fixedPorts.verify(fixed, native, signal);
  signal.throwIfAborted(); return result === true;
 }
 return Object.freeze({
  handoff: check('handoff'), verifyFamily: check('family'), verifySessions: check('sessions'),
  verifyFamilyAfterAuth: check('familyAfterAuth'), verifySessionsAfterAuth: check('sessionsAfterAuth'),
  async erase(value: unknown) {
   try {
    const {fixed, native} = await resolve(value);
    const stage = (name: MaintenanceWorkerStage) => async () => {
     signal.throwIfAborted();
     const result = await fixedPorts.atomic(fixed, native, name, signal);
     signal.throwIfAborted();
     if (typeof result !== 'boolean') throw Error('Durable native result unconfirmed');
     return result;
    };
    const result = await runAccountDeletion(native, {
     completionAlreadyConfirmed: stage('completionAlreadyConfirmed'), leaseCurrent: stage('leaseCurrent'),
     revokeAndCaptureInventory: stage('revokeAndCaptureInventory'), eraseDeviceRegistrations: stage('eraseDeviceRegistrations'),
     eraseAttachments: stage('eraseAttachments'), eraseRecords: stage('eraseRecords'),
     finalizeIdentityAndRetention: stage('finalizeIdentityAndRetention'), markComplete: stage('markComplete'),
    }, signal);
    return result.state === 'complete' && await verify(fixed, native);
   } catch { return false; }
  },
  async verify(value: unknown) {
   try { const {fixed, native} = await resolve(value); return await verify(fixed, native); }
   catch { return false; }
  },
 });
}
