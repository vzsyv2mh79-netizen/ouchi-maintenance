import {timingSafeEqual} from 'node:crypto';
import {billingConfiguration,dispatchNextBillingRecoveryJob} from '@/lib/billing-server';
export const runtime='nodejs';
export const maxDuration=120;
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'},secret=process.env.CRON_SECRET,authorization=request.headers.get('authorization');
 if(!secret||secret.length<16||secret.length>4096||!authorization||authorization.length>4103)return Response.json({error:'Unauthorized'},{status:401,headers});
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(authorization);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return Response.json({error:'Unauthorized'},{status:401,headers});
 if(process.env.BILLING_RECONCILIATION_WORKER_ENABLED!=='true')return Response.json({state:'disabled'},{status:503,headers});
 if(new URL(request.url).search)return Response.json({error:'Unsupported parameters'},{status:400,headers});
 const config=billingConfiguration();if(!config)return Response.json({state:'unavailable'},{status:503,headers});
 try{
  const result=await dispatchNextBillingRecoveryJob(config);
  return Response.json(result,{status:result.state==='retry_requested'?503:200,headers});
 }catch{return Response.json({error:'Recovery processing unavailable'},{status:503,headers});}
}
