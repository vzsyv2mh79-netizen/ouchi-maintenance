import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
export const OUCHI_REQUESTED_PREPARE_SAVE_SQL='select maintenance_private.save_ouchi_requested_preparation($1::uuid,$2::jsonb,$3::uuid) as saved';
export const OUCHI_REQUESTED_PREPARE_SQL='select maintenance_private.prepare_ouchi_requested($1::uuid,$2::jsonb,$3::uuid) as prepared';
export const OUCHI_REQUESTED_PREPARATION_STATE_SQL='select * from maintenance_private.ouchi_requested_preparation_state($1::uuid,$2::jsonb,$3::uuid,$4::text)';
export const OUCHI_REQUESTED_PREPARATION_CANCEL_SQL='select maintenance_private.cancel_ouchi_requested_preparation($1::uuid,$2::jsonb,$3::uuid) as cancelled';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000';

/** New owner-zero/empty-file protocol only. SAVE precedes real canonical
 * preparation in the SAME checked transaction. No retrofitting legacy rows,
 * client before-state, default coverage, extra retention or activation. The
 * independent provider must cover all app/Storage/dispatch/writer admission.
 */
export function createOuchiRequestedPreparation({scope,nativeLease,verifyCoverage}){
 const s=normalizeSharedDeletionScope(scope),text=JSON.stringify(s);
 if(!s.apps.some(x=>x.app==='ouchi-maintenance')||!uuid(nativeLease)||nativeLease===s.leaseToken||typeof verifyCoverage!=='function')throw Error('Exact provenance scope and independent coverage required');
 const args=[s.requestID,text,nativeLease],states=new WeakMap();
 const checked=tx=>{if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked provenance transaction required');tx.signal.throwIfAborted();};
 const pin=async(tx,expected)=>{
  const rows=(await tx.query(OUCHI_REQUESTED_PREPARATION_STATE_SQL,[...args,expected])).rows;tx.signal.throwIfAborted();const r=rows[0];
  if(rows.length!==1||Object.keys(r).sort().join(',')!=='backend_pid,ok,transaction_id'||r.ok!==true||!Number.isSafeInteger(r.backend_pid)||r.backend_pid<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id))return null;
  return {pid:r.backend_pid,xid:r.transaction_id};
 };
 const same=(a,b)=>!!a&&!!b&&a.pid===b.pid&&a.xid===b.xid;
 async function operation(value,tx,kind){
  checked(tx);if(JSON.stringify(normalizeSharedDeletionScope(value))!==text)throw Error('Foreign provenance scope');
  if(states.has(tx)){states.get(tx).valid=false;throw Error('Provenance operation already used');}
  const state={valid:false,pin:null};states.set(tx,state);const expected=kind==='prepare'?'prepared':'cancelled';
  tx.beforeCommit('ouchi-requested-provenance:'+s.requestID,async()=>{
   if(!state.valid)return false;
   try{return same(state.pin,await pin(tx,expected))&&await verifyCoverage(s,tx,tx.signal)===true&&same(state.pin,await pin(tx,expected));}catch{return false;}
  });
  if(await verifyCoverage(s,tx,tx.signal)!==true)throw Error('Current provenance coverage required');
  if(kind==='prepare'){
   const saved=(await tx.query(OUCHI_REQUESTED_PREPARE_SAVE_SQL,args)).rows;
   if(saved.length!==1||saved[0].saved!==true)throw Error('Original preparation state unavailable');
  }
  const result=(await tx.query(kind==='prepare'?OUCHI_REQUESTED_PREPARE_SQL:OUCHI_REQUESTED_PREPARATION_CANCEL_SQL,args)).rows;
  const key=kind==='prepare'?'prepared':'cancelled';if(result.length!==1||result[0][key]!==true)throw Error('Requested provenance operation unconfirmed');
  state.pin=await pin(tx,expected);
  if(!state.pin||await verifyCoverage(s,tx,tx.signal)!==true||!same(state.pin,await pin(tx,expected)))throw Error('Requested provenance state changed');
  state.valid=true;return true;
 }
 return Object.freeze({prepare:(value,tx)=>operation(value,tx,'prepare'),cancelRequested:(value,tx)=>operation(value,tx,'cancel'),
  verifyCancelled:async(value,tx)=>{checked(tx);if(JSON.stringify(normalizeSharedDeletionScope(value))!==text)return false;return !!await pin(tx,'cancelled')&&await verifyCoverage(s,tx,tx.signal)===true;}});
}
