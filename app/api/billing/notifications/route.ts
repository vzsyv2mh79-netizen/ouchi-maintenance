import {billingConfiguration,billingDatabase,billingVerifier,verifyBillingTransaction,readBillingBody} from '@/lib/billing-server';
export const runtime='nodejs';
export async function POST(request:Request){
 const config=billingConfiguration(),headers={'Cache-Control':'no-store'};if(!config)return Response.json({error:'Billing disabled'},{status:503,headers});
 try{const body=await readBillingBody(request);if(typeof body.signedPayload!=='string')throw new Error();const notification=await billingVerifier(config).verifyAndDecodeNotification(body.signedPayload);
 if(!notification.data?.signedTransactionInfo)return Response.json({received:true},{headers});
 const transaction=await verifyBillingTransaction(notification.data.signedTransactionInfo,config);
 const {error}=await billingDatabase(config).rpc('apply_ouchi_sandbox_transaction',{payload:transaction});if(error)return Response.json({error:'Retry notification'},{status:503,headers});return Response.json({received:true},{headers});
 }catch{return Response.json({error:'Invalid signed notification'},{status:400,headers});}
}
