import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
/** Dormant bounded worker. Scheduler, minimum LOGIN grants, retention adoption
 * and credentials are separate deployment requirements. No user IDs returned.
 */
export function createClosureReauthenticationMaintenance({connect,enabled=false}:{connect:Parameters<typeof createReceiptTransactions>[0]['connect'];enabled?:boolean}){
 if(typeof enabled!=='boolean')throw Error('Explicit maintenance configuration required');
 const transaction=createReceiptTransactions({connect});
 return async(signal:AbortSignal,batchSize=100)=>{
  if(!(signal instanceof AbortSignal)||!Number.isInteger(batchSize)||batchSize<1||batchSize>100)throw Error('Bounded cleanup invocation required');
  if(!enabled)return {state:'disabled' as const};
  const counts=await transaction(async tx=>{
   await tx.query('SET LOCAL ROLE ouchi_closure_reauth_worker');
   const result=await tx.query('select maintenance_private.closure_reauth_maintenance($1::integer) as counts',[batchSize]);
   const value=result.rows[0]?.counts;
   if(result.rows.length!==1||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='closed,purged')throw Error('Temporary authentication cleanup unconfirmed');
   const {closed,purged}=value as {closed:unknown;purged:unknown};
   if(!Number.isSafeInteger(closed)||!Number.isSafeInteger(purged)||Number(closed)<0||Number(purged)<0||Number(closed)+Number(purged)>batchSize)throw Error('Temporary authentication cleanup unconfirmed');
   return {closed:Number(closed),purged:Number(purged)};
  },{signal,readOnly:false});
  signal.throwIfAborted();return {state:'processed' as const,...counts};
 };
}
