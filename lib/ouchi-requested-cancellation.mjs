import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
export const OUCHI_REQUESTED_CANCELLATION_SQL='select * from maintenance_private.ouchi_requested_cancellation_state($1::uuid,$2::jsonb)';

/** Separate unprepared-request cancellation guard. No account/native mutation,
 * flag restoration, original deletion or new retention policy. A root-owned
 * after-cancel transaction supplies global receipt/dispatch/unknown-writer
 * coverage through COMMIT; no default success. Existing Ouchi owner intake may
 * already have native running/captured/stopped state while root is requested:
 * that case deliberately refuses, since reversal provenance is not stored.
 */
export function createOuchiRequestedCancellation({verifyCoverage,signal}){
 if(typeof verifyCoverage!=='function'||!(signal instanceof AbortSignal))throw Error('Independent bounded cancellation coverage required');
 const states=new WeakMap();
 async function verify(value,tx){
  const scope=normalizeSharedDeletionScope(value),text=JSON.stringify(scope);
  if(!scope.apps.some(a=>a.app==='ouchi-maintenance')||typeof tx?.query!=='function')return false;
  const active=tx.signal??signal;if(!(active instanceof AbortSignal))return false;
  const check=()=>{signal.throwIfAborted();active.throwIfAborted();};
  check();let state=states.get(tx);
  if(state&&(state.scope!==text||!state.valid)){if(state)state.valid=false;return false;}
  const read=async()=>{
   check();const rows=(await tx.query(OUCHI_REQUESTED_CANCELLATION_SQL,[scope.requestID,text])).rows;check();const r=rows[0];
   if(rows.length!==1||Object.keys(r).sort().join(',')!=='backend_pid,ok,transaction_id'||r.ok!==true||!Number.isSafeInteger(r.backend_pid)||r.backend_pid<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id))return null;
   return {pid:r.backend_pid,xid:r.transaction_id};
  };
  if(!state){state={scope:text,valid:false,pin:null};states.set(tx,state);
   if(typeof tx.beforeCommit==='function'){
    const fixed=state;
    tx.beforeCommit('ouchi-requested-cancellation:'+scope.requestID,async()=>{
     if(!fixed.valid)return false;
     try{const r=await read();return !!r&&r.pid===fixed.pin.pid&&r.xid===fixed.pin.xid&&await verifyCoverage(scope,tx,active)===true;}catch{return false;}
    });
   }
  }
  state.valid=false;
  try{
   const first=await read();if(!first||(state.pin&&(state.pin.pid!==first.pid||state.pin.xid!==first.xid)))return false;
   state.pin??=first;
   if(await verifyCoverage(scope,tx,active)!==true)return false;check();
   const last=await read();state.valid=!!last&&last.pid===state.pin.pid&&last.xid===state.pin.xid;
   return state.valid;
  }catch(e){state.valid=false;throw e;}
  finally{if(!state.pin)state.valid=false;}
 }
 return Object.freeze({cancelRequested:verify,verifyCancelled:verify});
}
