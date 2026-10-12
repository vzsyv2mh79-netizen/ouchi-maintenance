import type {AppStoreServerAPIClient,SignedDataVerifier} from '@apple/app-store-server-library';
import {normalizeAppleTransaction} from './billing';
import {assertRestoreTransferJob} from './billing-restore-transfer-worker';
import type {RestoreTransferJob,RestoreReadback} from './billing-restore-transfer-worker';

/** Trusted server must construct both SDK instances for Sandbox, with the
 * expected bundle and Apple's roots/online certificate checks. No client JWS or
 * request-created job belongs here. No route/flag/credential is enabled here. */
export function createSandboxRestoreAppleAdapter(options:{
 client:Pick<AppStoreServerAPIClient,'getAllSubscriptionStatuses'|'setAppAccountToken'>;
 verifier:Pick<SignedDataVerifier,'verifyAndDecodeTransaction'>;
 bundleID:string;signal?:AbortSignal;timeoutMs?:number;
}){
 const timeout=options.timeoutMs??15000;
 if(!/^[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(options.bundleID)||!Number.isSafeInteger(timeout)||timeout<1||timeout>30000)throw Error('Invalid Sandbox restore adapter');
 const scope=(job:RestoreTransferJob)=>{assertRestoreTransferJob(job);if(job.bundleID!==options.bundleID)throw Error('Invalid Sandbox restore scope');};
 // SDK requests cannot be cancelled through this interface. A timeout/abort is
 // UNKNOWN for PUT, not rollback. The worker retains its durable reservation and
 // reads current signed status on restart; never retry PUT in this helper.
 const bounded=async<T>(operation:()=>Promise<T>):Promise<T>=>{
  if(options.signal?.aborted)throw Error('Restore cancelled');
  let timer:ReturnType<typeof setTimeout>|undefined;
  let abort:()=>void=()=>{};
  try{
   const guard=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Restore Apple request unavailable')),timeout);
    abort=()=>reject(Error('Restore cancelled'));
    options.signal?.addEventListener('abort',abort,{once:true});
   });
   const result=await Promise.race([operation(),guard]);
   if(options.signal?.aborted)throw Error('Restore cancelled');
   return result;
  }finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 };
 return {
  readCurrent:async(job:RestoreTransferJob):Promise<RestoreReadback>=>{
   scope(job);
   const response=await bounded(()=>options.client.getAllSubscriptionStatuses(job.originalTransactionID));
   if(response.environment!=='Sandbox'||response.bundleId!==job.bundleID||!Array.isArray(response.data)||response.data.length>100)throw Error('Invalid Apple status scope');
   const candidates=[];
   let entries=0;
   for(const group of response.data){
    if(!group||!Array.isArray(group.lastTransactions))throw Error('Invalid Apple status group');
    entries+=group.lastTransactions.length;if(entries>1000)throw Error('Apple status response too large');
    for(const item of group.lastTransactions){if(!item||typeof item!=='object')throw Error('Invalid Apple status item');if(item.originalTransactionId===job.originalTransactionID)candidates.push(item);}
   }
   if(candidates.length!==1)throw Error('Current original purchase unavailable');
   const item=candidates[0],signed=item.signedTransactionInfo;
   if(item.status!==1||typeof signed!=='string'||!signed||Buffer.byteLength(signed)>131072)throw Error('Current active purchase unavailable');
   const decoded=await bounded(()=>options.verifier.verifyAndDecodeTransaction(signed));
   if(decoded.inAppOwnershipType!=='PURCHASED'||decoded.appTransactionId!==job.appTransactionID)throw Error('Invalid Apple account ownership');
   const transaction=normalizeAppleTransaction(decoded as unknown as Record<string,unknown>,job.bundleID,'Sandbox');
   if(transaction.originalTransactionId!==job.originalTransactionID||!['ouchi.premium.monthly','ouchi.premium.annual'].includes(transaction.productId)||transaction.revokedAt!==undefined||transaction.isUpgraded)throw Error('Invalid current purchase');
   // Freshness, prior/new target token and active expiry are checked again by
   // the worker and atomic SQL; this helper never grants a premium entitlement.
   return {signedTransaction:signed,transaction,appTransactionID:job.appTransactionID};
  },
  setToken:async(job:RestoreTransferJob)=>{
   scope(job);if(job.phase!=='update_started')throw Error('Durable mutation marker required');
   await bounded(()=>options.client.setAppAccountToken(job.originalTransactionID,{appAccountToken:job.epochID}));
  }
 };
}
