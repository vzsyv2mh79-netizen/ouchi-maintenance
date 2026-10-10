import {billingConfiguration,billingDatabase,billingVerifier,verifyBillingTransaction,readBillingBody} from '@/lib/billing-server';
import type {VerifiedTransaction} from '@/lib/billing';
export const runtime='nodejs';
export async function POST(request:Request){
 const config=billingConfiguration(),headers={'Cache-Control':'no-store'};
 if(!config)return Response.json({error:'Billing disabled'},{status:503,headers});
 let transaction:VerifiedTransaction;
 try{
  const body=await readBillingBody(request);
  if(typeof body.signedPayload!=='string')throw new Error('Missing signed payload');
  const notification=await billingVerifier(config).verifyAndDecodeNotification(body.signedPayload);
  if(!notification.data?.signedTransactionInfo)return Response.json({received:true},{headers});
  transaction=await verifyBillingTransaction(notification.data.signedTransactionInfo,config);
 }catch{return Response.json({error:'Invalid signed notification'},{status:400,headers});}
 // A valid Apple event must remain retryable if persistence or transport fails.
 // Do not classify a database outage as an invalid signature or acknowledge it.
 try{
  const {error}=await billingDatabase(config).rpc('apply_ouchi_sandbox_transaction',{payload:transaction});
  if(error)throw new Error('Persistence unavailable');
  return Response.json({received:true},{headers});
 }catch{return Response.json({error:'Retry notification'},{status:503,headers});}
}
