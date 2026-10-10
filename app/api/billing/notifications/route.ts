import {billingConfiguration,billingDatabase,billingVerifier,verifyBillingTransaction,readBillingBody,persistBillingTransaction,verifyBillingRenewal,persistBillingRenewal} from '@/lib/billing-server';
import type {VerifiedTransaction} from '@/lib/billing';
import type {VerifiedRenewal} from '@/lib/billing-renewal';
import {normalizedVerifiedNotification,persistVerifiedNotification} from '@/lib/billing-notification-inbox';
export const runtime='nodejs';
export async function POST(request:Request){
 const config=billingConfiguration(),headers={'Cache-Control':'no-store'};
 if(!config||config.storage!=='verified-ledger')return Response.json({error:'Billing disabled'},{status:503,headers});
 let transaction:VerifiedTransaction|undefined;
 let signedTransaction:string|undefined;
 let signedRenewal:string|undefined;
 let renewal:VerifiedRenewal|undefined;
 let signedPayload:string;
 let notification:Record<string,unknown>;
 try{
  const body=await readBillingBody(request);
  if(typeof body.signedPayload!=='string')throw new Error('Missing signed payload');
  signedPayload=body.signedPayload;
  notification=await billingVerifier(config).verifyAndDecodeNotification(signedPayload) as unknown as Record<string,unknown>;
  const data=notification.data as Record<string,unknown>|undefined;
  if(typeof data?.signedTransactionInfo==='string'){
   signedTransaction=data.signedTransactionInfo;
   transaction=await verifyBillingTransaction(signedTransaction,config);
   if(typeof data.signedRenewalInfo==='string'){signedRenewal=data.signedRenewalInfo;renewal=await verifyBillingRenewal(signedRenewal,transaction,config);}
  }
  normalizedVerifiedNotification(notification,config.environment,Boolean(transaction));
 }catch{return Response.json({error:'Invalid signed notification'},{status:400,headers});}
 // A valid Apple event must remain retryable if persistence or transport fails.
 // Do not classify a database outage as an invalid signature or acknowledge it.
 try{
  const database=billingDatabase(config);
  if(transaction&&signedTransaction)await persistBillingTransaction(database,config,signedTransaction,transaction);
  if(renewal&&signedRenewal)await persistBillingRenewal(database,config,signedRenewal,renewal);
  const record=normalizedVerifiedNotification(notification,config.environment,Boolean(transaction));
  await persistVerifiedNotification(signedPayload,record,async(name,args)=>await database.rpc(name,args));
  return Response.json({received:true},{headers});
 }catch{return Response.json({error:'Retry notification'},{status:503,headers});}
}
