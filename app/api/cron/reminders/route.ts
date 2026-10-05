import {timingSafeEqual} from 'node:crypto';
import {pushConfiguration,pushDatabase,sendPush} from '@/lib/push-server';
import {reminderPayload} from '@/lib/push-validation';
export const runtime='nodejs';
export const maxDuration=300;
export const dynamic='force-dynamic';
type Job={id:string;endpoint:string;p256dh:string;auth:string;due_count:number;claim_token:string;delivery_day:string};
export async function GET(request:Request) {
 const secret=process.env.CRON_SECRET,header=request.headers.get('authorization');
 if(!secret||!header)return new Response('Unauthorized',{status:401});
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(header);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return new Response('Unauthorized',{status:401});
 const config=pushConfiguration();
 if(!config)return Response.json({error:'Notifications are not configured'},{status:503});
 const db=pushDatabase(config),deadline=Date.now()+180000;let sent=0,expired=0,failed=0;
 try {
  while(Date.now()<deadline) {
   const {data,error}=await db.rpc('claim_maintenance_push',{batch_size:100});
   if(error)throw error;
   const jobs=(data??[]) as Job[];
   if(!jobs.length)return Response.json({sent,expired,failed},{status:failed?503:200,headers:{'Cache-Control':'no-store'}});
   for(let i=0;i<jobs.length;i+=10) await Promise.all(jobs.slice(i,i+10).filter(job=>Number(job.due_count)>0).map(async job=>{
    let delivered=false,gone=false;
    try{await sendPush(config,job,reminderPayload(Number(job.due_count),job.delivery_day));delivered=true;sent++;}
    catch(cause){const code=(cause as {statusCode?:number})?.statusCode;gone=code===404||code===410;if(gone)expired++;else failed++;}
    const {error:finishError}=await db.rpc('finish_maintenance_push',{subscription_id:job.id,delivery_token:job.claim_token,delivery_day:job.delivery_day,delivered,expired:gone});
    if(finishError)throw finishError;
   }));
  }
  return Response.json({sent,expired,failed,error:'Time limit reached'},{status:503});
 }catch{console.error('Maintenance reminder processing failed');return Response.json({error:'Reminder processing failed'},{status:500});}
}
