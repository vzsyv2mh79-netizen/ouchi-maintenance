import type {VerifiedTransaction} from './billing';

/** Service-owned job from an atomic proof-consumption/enqueue transaction.
 * Never construct from request JSON or a client acknowledgement. */
export type RestoreTransferJob = Readonly<{
 id:string;lease:string;userID:string;sessionID:string;epochID:string;
 originalTransactionID:string;appTransactionID:string;previousAccountToken:string;
 environment:'Sandbox';bundleID:string;authorizedAt:number;
 phase:'authorized'|'update_started';mutationStartedAt?:number;
}>;
export type RestoreReadback = Readonly<{
 signedTransaction:string;transaction:VerifiedTransaction;appTransactionID:string;
}>;
export type RestoreTransferStore = {
 /** Durable job completion under the same live scope. This is process status,
  * not premium rights; later ledger refund/expiry must remain untouched. */
 completionIsCurrent:(job:RestoreTransferJob)=>Promise<boolean>;
 /** Rechecks live Auth session/enrollment, exclusive original-purchase reservation,
  * exact job/lease and absence of conflicting active ownership in the database. */
 leaseIsCurrent:(job:RestoreTransferJob)=>Promise<boolean>;
 /** Atomically records unknown mutation outcome BEFORE Apple is contacted.
  * Must retain the original-purchase reservation across lease expiry/restarts. */
 markUpdateStarted:(job:RestoreTransferJob)=>Promise<RestoreTransferJob>;
 /** One database transaction rechecks the live binding/reservation, persists the
  * exact verified readback and moves ownership/completion together. False means
  * no success; never release a still-uncertain reservation as a side effect. */
 complete:(job:RestoreTransferJob,readback:RestoreReadback)=>Promise<boolean>;
};
export type RestoreTransferDependencies = {
 store:RestoreTransferStore;
 /** Must fetch current Apple subscription status, verify Apple signatures,
  * bundle/environment/ownership, and select current purchased transaction.
  * Historical client JWS, cached state or plain decoded JSON is not readback. */
 readCurrent:(job:RestoreTransferJob)=>Promise<RestoreReadback>;
 /** Explicit Sandbox-only Set App Account Token call for this original ID.
  * Its HTTP acknowledgement alone cannot complete the job or grant rights. */
 setToken:(job:RestoreTransferJob)=>Promise<void>;
 now?:()=>number;
};
export type RestoreTransferResult = {state:'complete'}|{state:'pending';reason:'cancelled'|'scope'|'unavailable'|'readback'|'commit'};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const appleID=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,127}$/.test(v);
export function assertRestoreTransferJob(job:RestoreTransferJob){
 if(!job||!uuid(job.id)||!uuid(job.lease)||!uuid(job.userID)||!uuid(job.sessionID)||!uuid(job.epochID)||job.userID===job.epochID||
    job.environment!=='Sandbox'||!uuid(job.previousAccountToken)||job.previousAccountToken===job.epochID||!appleID(job.originalTransactionID)||!appleID(job.appTransactionID)||
    typeof job.bundleID!=='string'||!/^[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(job.bundleID)||
    !Number.isSafeInteger(job.authorizedAt)||job.authorizedAt<=0||!['authorized','update_started'].includes(job.phase)||
    (job.phase==='authorized'?job.mutationStartedAt!==undefined:!Number.isSafeInteger(job.mutationStartedAt)||job.mutationStartedAt!<job.authorizedAt))throw Error('Invalid service restore job');
}
function sameJob(a:RestoreTransferJob,b:RestoreTransferJob){
 return ['id','lease','userID','sessionID','epochID','originalTransactionID','appTransactionID','previousAccountToken','environment','bundleID','authorizedAt'].every(key=>a[key as keyof RestoreTransferJob]===b[key as keyof RestoreTransferJob]);
}
function matchingReadback(job:RestoreTransferJob,readback:RestoreReadback,now:number){
 const t=readback?.transaction;
 return typeof readback?.signedTransaction==='string'&&readback.signedTransaction.length>0&&Buffer.byteLength(readback.signedTransaction)<=131072&&
  readback.appTransactionID===job.appTransactionID&&t?.environment===job.environment&&t.originalTransactionId===job.originalTransactionID&&
  appleID(t.transactionId)&&t.accountToken===job.epochID&&['ouchi.premium.monthly','ouchi.premium.annual'].includes(t.productId)&&
  Number.isSafeInteger(t.signedAt)&&t.signedAt>=job.authorizedAt&&t.signedAt<=now+60000&&
  Number.isSafeInteger(t.purchasedAt)&&t.purchasedAt>0&&t.purchasedAt<=now&&
  Number.isSafeInteger(t.expiresAt)&&t.expiresAt!>now&&t.expiresAt!>t.purchasedAt&&t.revokedAt===undefined&&!t.isUpgraded;
}
/** Prepared worker only; no route, scheduler, database or Apple client is enabled.
 * A durable unknown outcome remains reserved. Retry reads first, so a completed
 * Apple update is reconciled without sending a second mutation. No local flag
 * or Apple HTTP200 creates premium access. Production is deliberately refused. */
export async function runRestoreTransfer(job:RestoreTransferJob,deps:RestoreTransferDependencies,signal?:AbortSignal):Promise<RestoreTransferResult>{
 assertRestoreTransferJob(job);
 const now=()=>{const value=(deps.now??Date.now)();if(!Number.isSafeInteger(value)||value<=0)throw Error('Invalid clock');return value;};
 const pending=(reason:Extract<RestoreTransferResult,{state:'pending'}>['reason']):RestoreTransferResult=>({state:'pending',reason});
 const current=async(value:RestoreTransferJob)=>!signal?.aborted&&await deps.store.leaseIsCurrent(value);
 const commit=async(value:RestoreTransferJob,readback:RestoreReadback):Promise<RestoreTransferResult>=>{
  if(!matchingReadback(value,readback,now()))return pending('readback');
  if(!await current(value))return pending(signal?.aborted?'cancelled':'scope');
  return await deps.store.complete(value,readback)?{state:'complete'}:pending('commit');
 };
 try{
  if(signal?.aborted)return pending('cancelled');
  if(await deps.store.completionIsCurrent(job))return signal?.aborted?pending('cancelled'):{state:'complete'};
  if(!await current(job))return pending(signal?.aborted?'cancelled':'scope');
  const before=await deps.readCurrent(job);
  if(!await current(job))return pending(signal?.aborted?'cancelled':'scope');
  if(matchingReadback(job,before,now()))return await commit(job,before);
  // Do not mutate another subscription, expired/refunded purchases or a
  // mismatched Apple account even if an adapter returned verified data.
  const t=before.transaction;
  if(typeof before.signedTransaction!=='string'||!before.signedTransaction||Buffer.byteLength(before.signedTransaction)>131072||before.appTransactionID!==job.appTransactionID||t.environment!==job.environment||t.originalTransactionId!==job.originalTransactionID||
     !appleID(t.transactionId)||t.accountToken!==job.previousAccountToken||!['ouchi.premium.monthly','ouchi.premium.annual'].includes(t.productId)||
     !Number.isSafeInteger(t.signedAt)||t.signedAt<job.authorizedAt||t.signedAt>now()+60000||
     !Number.isSafeInteger(t.purchasedAt)||t.purchasedAt<=0||t.purchasedAt>now()||
     !Number.isSafeInteger(t.expiresAt)||t.expiresAt!<=now()||t.expiresAt!<=t.purchasedAt||t.revokedAt!==undefined||t.isUpgraded)return pending('readback');
  // An uncertain earlier PUT never triggers another PUT automatically. Preserve
  // reservation and keep reading; escalation/retry policy is a separate gate.
  if(job.phase==='update_started')return pending('readback');
  const started=await deps.store.markUpdateStarted(job);
  assertRestoreTransferJob(started);
  if(!sameJob(job,started)||started.phase!=='update_started')return pending('scope');
  if(!await current(started))return pending(signal?.aborted?'cancelled':'scope');
  await deps.setToken(started);
  if(!await current(started))return pending(signal?.aborted?'cancelled':'scope');
  return await commit(started,await deps.readCurrent(started));
 }catch{return pending(signal?.aborted?'cancelled':'unavailable');}
}
