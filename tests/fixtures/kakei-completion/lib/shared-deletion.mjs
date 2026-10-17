// Shared-account coordinator. No production adapter, scheduler or credentials.
// Adapters must enforce the same immutable inventory and lease atomically with
// their writes. Checking a lease here alone does not fence concurrent app writes.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=x=>typeof x==='string'&&uuid.test(x)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(x);
// v2 requires independent family/session readbacks AFTER Auth removal. Never
// reinterpret a v1 completion receipt as evidence for these new prerequisites.
export const SHARED_DELETION_PROTOCOL=2;
export function deletionStages(scope) {
  return ['prepare','handoff-family','verify-family-before','verify-sessions-before',
    ...scope.apps.flatMap(a=>[`erase:${a.app}`,`verify:${a.app}`]),
    'verify-family','verify-sessions','erase-auth','verify-auth',
    'verify-family-after-auth','verify-sessions-after-auth','complete'];
}
export function normalizeSharedDeletionScope(value) {
  if(!value||value.protocolVersion!==SHARED_DELETION_PROTOCOL||value.kind!=='shared-account'||!id(value.requestID)||!id(value.userID)||!id(value.leaseToken)||
    !/^[a-f0-9]{64}$/.test(value.inventoryDigest)||!Array.isArray(value.apps)||!value.apps.length||
    value.apps.some(a=>!a||!/^[-a-z0-9]{1,40}$/.test(a.app)||!id(a.requestID)||!id(a.scopeID))||
    new Set(value.apps.map(a=>a.app)).size!==value.apps.length) throw Error('Invalid shared deletion scope');
  return Object.freeze({protocolVersion:value.protocolVersion,kind:value.kind,requestID:value.requestID,userID:value.userID,
    leaseToken:value.leaseToken,inventoryDigest:value.inventoryDigest,
    apps:Object.freeze(value.apps.map(a=>Object.freeze({app:a.app,requestID:a.requestID,scopeID:a.scopeID})))});
}
function receiptMatches(receipt,scope,stage) {
  return receipt?.durable===true&&receipt.protocolVersion===scope.protocolVersion&&receipt.stage===stage&&receipt.requestID===scope.requestID&&
    receipt.userID===scope.userID&&receipt.inventoryDigest===scope.inventoryDigest&&
    Array.isArray(receipt.apps)&&receipt.apps.length===scope.apps.length&&
    scope.apps.every((a,i)=>['app','requestID','scopeID'].every(k=>receipt.apps[i]?.[k]===a[k]));
}
/** readReceipt returns null only when absence is verified. Unknown/timeout is
 * an error. An adapter reconciles remote lost acknowledgements using the fixed
 * request as an idempotency key before repeating a write. Receipts live outside
 * Auth cascades. prepare must persist the contact/outbox and family consent,
 * acquire all app write fences, and capture the full deletion inventory.
 * handoff-family transfers only with the exact successor's verified consent;
 * verify-family-before and verify-sessions-before are mandatory before any app
 * erasure. The later readbacks detect regressions before shared Auth deletion.
 * Each erase/verify stage needs app-specific adapters; none are supplied here.
 * Post-Auth family/session readbacks are mandatory before complete. They must
 * use preserved private bindings rather than rows removed by Auth cascades.
 * complete never implies email delivery.
 */
export async function runSharedDeletion(value, adapters, signal) {
  const scope=normalizeSharedDeletionScope(value),stages=deletionStages(scope);
  if(!adapters||['readReceipt','verifyCoverage','leaseCurrent','perform'].some(k=>typeof adapters[k]!=='function'))
    return {state:'pending',stage:'configuration'};
  let stage='complete';
  try {
    if(signal?.aborted)return {state:'pending',stage};
    const done=await adapters.readReceipt(scope,'complete');
    if(signal?.aborted)return {state:'pending',stage};
    if(done!==null) return receiptMatches(done,scope,'complete')
      ? {state:'complete',notification:'unconfirmed'} : {state:'pending',stage:'receipt-mismatch'};
    stage='coverage';
    if(signal?.aborted||await adapters.verifyCoverage(scope)!==true||signal?.aborted)return {state:'pending',stage};
    for(stage of stages) {
      if(signal?.aborted||await adapters.leaseCurrent(scope)!==true||signal?.aborted)
        return {state:'pending',stage};
      const prior=await adapters.readReceipt(scope,stage);
      if(signal?.aborted)return {state:'pending',stage};
      if(prior!==null) {
        if(!receiptMatches(prior,scope,stage))return {state:'pending',stage:'receipt-mismatch'};
        continue;
      }
      // perform must compare the current lease/inventory and all prerequisites
      // in its own durable boundary. It may not trust client-supplied evidence.
      const result=await adapters.perform(scope,stage);
      if(signal?.aborted||!receiptMatches(result,scope,stage))return {state:'pending',stage};
    }
    return {state:'complete',notification:'unconfirmed'};
  } catch {return {state:'pending',stage};}
}
