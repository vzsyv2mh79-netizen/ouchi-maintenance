/** Deletion orchestration only. No production adapter or scheduler is enabled. */
export type DeletionScope={requestID:string;userID:string;epochID:string;leaseToken:string};
export type DeletionDependencies={
 leaseCurrent:(scope:DeletionScope)=>Promise<boolean>;
 revokeAndCaptureInventory:(scope:DeletionScope)=>Promise<boolean>;
 eraseRecords:(scope:DeletionScope)=>Promise<boolean>;
 eraseAttachments:(scope:DeletionScope)=>Promise<boolean>;
 eraseDeviceRegistrations:(scope:DeletionScope)=>Promise<boolean>;
 finalizeIdentityAndRetention:(scope:DeletionScope)=>Promise<boolean>;
 markComplete:(scope:DeletionScope)=>Promise<boolean>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Every adapter must independently enforce the immutable request epoch and lease.
 * A successful call means durable acknowledgement, including confirmed object absence.
 * These callbacks must be idempotent; a timeout or failed acknowledgement does not
 * prove that a remote write was rolled back. Never delete shared Auth globally here.
 */
export async function runAccountDeletion(scope:DeletionScope,deps:DeletionDependencies,signal?:AbortSignal){
 if(!scope||Object.keys(scope).sort().join(',')!=='epochID,leaseToken,requestID,userID'||Object.values(scope).some(v=>typeof v!=='string'||!uuid.test(v)||v==='00000000-0000-0000-0000-000000000000'))throw new Error('Invalid deletion scope');
 const fixed=Object.freeze({...scope});
 const steps=[deps.revokeAndCaptureInventory,deps.eraseDeviceRegistrations,deps.eraseAttachments,deps.eraseRecords,deps.finalizeIdentityAndRetention,deps.markComplete];
 for(const step of steps){
  if(signal?.aborted)return {state:'pending' as const};
  try{
   if(await deps.leaseCurrent(fixed)!==true||signal?.aborted)return {state:'pending' as const};
   if(await step(fixed)!==true||signal?.aborted)return {state:'pending' as const};
  }catch{return {state:'pending' as const};}
 }
 return {state:'complete' as const};
}
