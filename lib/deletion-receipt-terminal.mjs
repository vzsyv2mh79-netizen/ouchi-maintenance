import {normalizeSharedDeletionScope,deletionStages} from './shared-deletion-protocol.mjs';
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
/** Server-only readback. authorize must verify the caller's scoped deletion
 * receipt credential (not a client boolean). No endpoint or grant supplied.
 * Historical completion does not assert current family content is unchanged.
 */
export function createTerminalDeletionReader({authorize}) {
 if(typeof authorize!=='function')throw Error('Scoped read authorization required');
 return async(value,tx)=>{
  const s=normalizeSharedDeletionScope(value);const fixed={...s};delete fixed.leaseToken;
  if(await authorize(s,tx)!==true)throw Error('Deletion read unauthorized');
  const r=(await tx.query('select user_id,scope,status,lease_token,lease_until,receipts from private.kb_shared_deletion_journal where request_id=$1',[s.requestID])).rows[0];
  if(!r||r.user_id!==s.userID||canonical(r.scope)!==canonical(fixed))return {state:'unconfirmed'};
  if(r.status!=='complete'||r.lease_token!==null||r.lease_until!==null)return {state:'unconfirmed'};
  for(const stage of deletionStages(s)){
   const proof=r.receipts?.[stage];if(proof?.durable!==true||proof.stage!==stage)return {state:'unconfirmed'};
   const saved={...proof};delete saved.durable;delete saved.stage;if(canonical(saved)!==canonical(fixed))return {state:'unconfirmed'};
  }
  // Deliberately does not read mutable households or deleted historical plans.
  // Scope/receipt identifiers are still personal data with pending finite purge.
  return Object.freeze({state:'complete',notification:'unconfirmed'});
 };
}
