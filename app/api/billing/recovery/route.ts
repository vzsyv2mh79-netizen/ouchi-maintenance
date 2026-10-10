import {billingConfiguration,billingDatabase,verifiedPurchaseAccount,enqueueBillingRecoveryAfterAuth,readBillingBody} from '@/lib/billing-server';
import {boundedBillingRead} from '@/lib/billing-read-deadline';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 if(process.env.BILLING_RECONCILIATION_REQUESTS_ENABLED!=='true'||process.env.BILLING_RECONCILIATION_WORKER_ENABLED!=='true')return Response.json({state:'disabled'},{status:503,headers});
 const config=billingConfiguration();if(!config||config.storage!=='verified-ledger')return Response.json({state:'unavailable'},{status:503,headers});
 if(new URL(request.url).search)return Response.json({error:'Unsupported parameters'},{status:400,headers});
 const token=request.headers.get('authorization');if(!token?.startsWith('Bearer ')||token.length>16384||!token.slice(7)||/\s/.test(token.slice(7)))return Response.json({error:'Login required'},{status:401,headers});
 try{
  if(request.body){const body=await boundedBillingRead(()=>readBillingBody(request),request.signal,5000);if(Object.keys(body).length)return Response.json({error:'Recovery scope is server-selected'},{status:400,headers});}
  else if(request.headers.get('content-length')&&request.headers.get('content-length')!=='0')return Response.json({error:'Invalid body'},{status:400,headers});
 }catch{return Response.json({error:'Invalid recovery request'},{status:400,headers});}
 try{
  const db=billingDatabase(config),bearer=token.slice(7),{data:{user},error}=await db.auth.getUser(bearer);
  if(error||!user)return Response.json({error:'Login unavailable'},{status:401,headers});
  const epoch=await verifiedPurchaseAccount(db,bearer,user.id);if(!epoch)return Response.json({error:'Enrollment unavailable'},{status:403,headers});
  const accepted=await enqueueBillingRecoveryAfterAuth(db,config,bearer,user.id,epoch);
  return Response.json({state:accepted?'accepted':'no_purchase_history'},{status:accepted?202:200,headers});
 }catch{return Response.json({error:'Recovery request unavailable'},{status:503,headers});}
}
