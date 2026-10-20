import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';

export const PRELOGOUT_FRAME_SQL='select * from maintenance_private.ouchi_prelogout_frame($1::jsonb,$2::uuid,$3::boolean)';
export const PRELOGOUT_CAPTURE_SQL='select maintenance_private.ouchi_capture_prelogout_custody($1::jsonb,$2::uuid) as captured';
const transactions=new WeakMap();
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';

/** Separate, non-deleting app boundary BEFORE global logout. Not an erasure,
 * identity, device, completion or post-Auth capability. Fixed private SQL only;
 * no caller work/stage/SQL, nested transaction, RPC or connection factory.
 * verifyCurrentGates must independently check complete current family, writer
 * and session authority on this SAME checked tx, including final COMMIT.
 * The owner must roll back any rejection. No roles/grants/runtime provisioned.
 */
export function createSharedMaintenancePrelogoutCustody({verifyCurrentGates}){
 if(typeof verifyCurrentGates!=='function')throw Error('Independent current prelogout gates required');
 const provider=verifyCurrentGates;
 function mapping(value,native){
  const scope=normalizeSharedDeletionScope(value),app=scope.apps.find(a=>a.app==='ouchi-maintenance');
  if(!app||!native||Object.keys(native).sort().join(',')!=='epochID,leaseToken,requestID,userID'||!Object.values(native).every(uuid)
   ||native.userID!==scope.userID||native.requestID!==app.requestID||native.epochID!==app.scopeID||native.leaseToken===scope.leaseToken)throw Error('Exact prelogout shared/native mapping required');
  const fixedNative=Object.freeze({...native});return {scope,native:fixedNative,key:JSON.stringify([scope,fixedNative]),args:[JSON.stringify(scope),fixedNative.leaseToken]};
 }
 function checked(tx){
  if(!tx||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal))throw Error('Checked owning prelogout transaction required');
  tx.signal.throwIfAborted();
 }
 async function frame(tx,fixed,required){
  checked(tx);const rows=(await tx.query(PRELOGOUT_FRAME_SQL,[...fixed.args,required])).rows;tx.signal.throwIfAborted();
  if(rows.length!==1)throw Error('Current prelogout frame refused');const r=rows[0];
  if(Object.keys(r).sort().join(',')!=='backend_pid,captured,session_digest,transaction_id'||!Number.isSafeInteger(r.backend_pid)||r.backend_pid<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id)||typeof r.session_digest!=='string'||!/^[a-f0-9]{64}$/.test(r.session_digest)||typeof r.captured!=='boolean'||(required&&!r.captured))throw Error('Unknown prelogout frame');
  return Object.freeze({...r});
 }
 const same=(a,b)=>a.backend_pid===b.backend_pid&&a.transaction_id===b.transaction_id&&a.session_digest===b.session_digest;
 async function current(tx,fixed,original,required){
  // Always root first, before independently supplied current readbacks can
  // acquire any participant/native/Storage metadata locks.
  const first=await frame(tx,fixed,required);if(!same(first,original))throw Error('Prelogout connection or exact session set changed');
  if(await provider(tx,fixed.scope,fixed.native,tx.signal)!==true)throw Error('Current prelogout family/session/writer gates refused');
  tx.signal.throwIfAborted();const last=await frame(tx,fixed,required);
  if(!same(last,original))throw Error('Prelogout frame changed after readback');return last;
 }
 async function verify(tx,value,native){
  try{checked(tx);const fixed=mapping(value,native),state=transactions.get(tx);
   if(!state||state.failed||state.key!==fixed.key||state.provider!==provider||!state.captured)return false;
   await current(tx,fixed,state.original,true);return !state.failed;
  }catch{const state=tx&&transactions.get(tx);if(state)state.failed=true;return false;}
 }
 return Object.freeze({verify,async capture(tx,value,native){
  let state=tx&&transactions.get(tx);
  try{
   checked(tx);const fixed=mapping(value,native);
   if(state&&(state.failed||state.key!==fixed.key||state.provider!==provider))throw Error('Prelogout scope/provider replacement refused');
   if(!state){const original=await frame(tx,fixed,false);state={key:fixed.key,provider,original,captured:false,failed:false};transactions.set(tx,state);
    const owned=state;tx.beforeCommit('ouchi-prelogout:'+fixed.scope.requestID,async()=>{
     if(owned.failed||!owned.captured)return false;
     try{await current(tx,fixed,owned.original,true);return !owned.failed;}catch{owned.failed=true;return false;}
    });
   }
   await current(tx,fixed,state.original,state.captured);
   if(!state.captured){const r=(await tx.query(PRELOGOUT_CAPTURE_SQL,fixed.args)).rows;tx.signal.throwIfAborted();
    if(r.length!==1||Object.keys(r[0]).join(',')!=='captured'||r[0].captured!==true)throw Error('Dedicated non-deleting capture unconfirmed');state.captured=true;
   }
   await current(tx,fixed,state.original,true);return true;
  }catch(error){if(state)state.failed=true;throw error;}
 }});
}
