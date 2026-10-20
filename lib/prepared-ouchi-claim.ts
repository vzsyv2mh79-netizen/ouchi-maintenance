import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {createPreparedScopedSharedConsent} from './prepared-scoped-shared-consent';

type ConsentOptions=Parameters<typeof createPreparedScopedSharedConsent>[0];
type Transaction=Parameters<ReturnType<typeof createPreparedScopedSharedConsent>['readClaimSnapshot']>[1];
type Options=Omit<ConsentOptions,'requestID'|'homeID'|'rootLease'>&{scope:unknown;homes:{homeID:string;successorID:string}[]};
export const PREPARED_CLAIM_FRAME_SQL='select * from maintenance_private.prepared_consent_claim_frame($1::uuid,$2::uuid,$3::jsonb,$4::jsonb)';
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** App-owned opaque original capability for the trusted root requested/adopted
 * contract. Server supplies the complete frozen family-home roster, never a
 * client list. SQL refuses omissions/extra homes and uncovered shared homes.
 * Zero-family intake needs a separate reviewed owner-consent path; it is denied
 * here rather than granting approval without any independently signed original.
 */
export function createPreparedOuchiClaimPort({scope,homes,...input}:Options){
 const expected=normalizeSharedDeletionScope(scope),scopeText=JSON.stringify(expected);
 if(!Array.isArray(homes)||homes.length<1||homes.length>100||homes.some(h=>!h||Object.keys(h).sort().join(',')!=='homeID,successorID'||!uuid(h.homeID)||!uuid(h.successorID)||h.successorID===expected.userID)||new Set(homes.map(h=>h.homeID)).size!==homes.length)throw Error('Complete frozen Ouchi family roster required');
 const fixedHomes=homes.map(h=>Object.freeze({...h})).sort((a,b)=>a.homeID.localeCompare(b.homeID)),roster=JSON.stringify(fixedHomes);
 const ports=fixedHomes.map(h=>({home:h,port:createPreparedScopedSharedConsent({...input,requestID:expected.requestID,homeID:h.homeID,rootLease:expected.leaseToken})}));
 const capabilities=new WeakMap<object,{tx:Transaction;fingerprint:string;pid:number;xid:string}>();
 const matches=(value:unknown)=>{try{return JSON.stringify(normalizeSharedDeletionScope(value))===scopeText;}catch{return false;}};
 async function frame(tx:Transaction,phase:'requested'|'processing'){
  if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')return null;
  tx.signal.throwIfAborted();const rows=(await tx.query(PREPARED_CLAIM_FRAME_SQL,[expected.requestID,expected.leaseToken,scopeText,roster])).rows;tx.signal.throwIfAborted();
  if(rows.length!==1)return null;const r=rows[0];
  if(Object.keys(r).sort().join(',')!=='backend_pid,status,transaction_id'||r.status!==phase||!Number.isSafeInteger(r.backend_pid)||Number(r.backend_pid)<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id))return null;
  return {pid:Number(r.backend_pid),xid:r.transaction_id};
 }
 async function fingerprint(tx:Transaction){
  const values=[];
  for(const {home,port} of ports)for(const actor of [expected.userID,home.successorID]){
   const proof=await port.readClaimSnapshot(actor,tx);if(!proof)return null;
   values.push([home.homeID,actor,proof.signature,proof.payload]);
  }
  return JSON.stringify(values);
 }
 return Object.freeze({async requested(value:unknown,tx:Transaction){
  if(!matches(value))return null;
  const pin=await frame(tx,'requested');if(!pin)return null;
  const original=await fingerprint(tx);if(original===null)return null;
  const final=await frame(tx,'requested');if(!final||final.pid!==pin.pid||final.xid!==pin.xid)return null;
  // No original DTO is shared with the root or another app. Only this closure
  // can recognize the object, on this exact physical transaction and signal.
  const capability=Object.freeze({kind:'ouchi-prepared-original-capability' as const});
  capabilities.set(capability,{tx,fingerprint:original,...pin});return capability;
 },async adopted(value:unknown,capability:unknown,tx:Transaction){
  if(!matches(value)||!capability||typeof capability!=='object')return false;
  const original=capabilities.get(capability);if(!original||original.tx!==tx)return false;
  const pin=await frame(tx,'processing');if(!pin||pin.pid!==original.pid||pin.xid!==original.xid)return false;
  if(await fingerprint(tx)!==original.fingerprint)return false;
  const final=await frame(tx,'processing');return !!final&&final.pid===original.pid&&final.xid===original.xid;
 }});
}
