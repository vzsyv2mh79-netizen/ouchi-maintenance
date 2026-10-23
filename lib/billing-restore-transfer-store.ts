import {createHash} from 'node:crypto';
import type {RestoreTransferJob,RestoreTransferStore} from './billing-restore-transfer-worker';

/** Inject only a trusted service-role RPC client after verified Auth. No client
 * key, request JSON, route, scheduler or enabled billing configuration here. */
export type RestoreTransferRPC = (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
export function createRestoreTransferStore(rpc:RestoreTransferRPC):RestoreTransferStore{
 const scope=(j:RestoreTransferJob)=>({target_request:j.id,target_lease:j.lease,target_user:j.userID,verified_session:j.sessionID,target_epoch:j.epochID});
 const call=async(name:string,args:Record<string,unknown>)=>{const result=await rpc(name,args);if(result.error)throw Error('Restore persistence unavailable');return result.data;};
 const bool=async(name:string,args:Record<string,unknown>)=>{const result=await call(name,args);if(typeof result!=='boolean')throw Error('Invalid restore persistence result');return result;};
 return {
  completionIsCurrent:j=>bool('maintenance_restore_completion_is_current',{...scope(j),original_tx:j.originalTransactionID,store_app_tx:j.appTransactionID,verified_bundle:j.bundleID}),
  leaseIsCurrent:j=>bool('maintenance_restore_transfer_lease_is_current',{...scope(j),expected_phase:j.phase}),
  markUpdateStarted:async j=>{
   const result=await call('mark_maintenance_restore_transfer_update',scope(j));
   if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Restore mutation not authorized');
   // The worker validates all returned immutable scope and marker fields before
   // any external mutation. Null/failed CAS never becomes a synthesized marker.
   return result as RestoreTransferJob;
  },
  complete:async(j,readback)=>{
   if(typeof readback.signedTransaction!=='string'||!readback.signedTransaction||Buffer.byteLength(readback.signedTransaction)>131072)throw Error('Invalid verified proof');
   const proof=createHash('sha256').update(readback.signedTransaction,'utf8').digest('hex');
   return bool('complete_maintenance_restore_transfer',{...scope(j),store_app_tx:readback.appTransactionID,verified_bundle:j.bundleID,payload:readback.transaction,proof_sha256:proof});
  }
 };
}
