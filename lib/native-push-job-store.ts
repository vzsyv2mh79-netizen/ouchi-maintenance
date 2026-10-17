import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativePushJobDependencies } from './native-push-job-worker';
/** Service-only adapter. Caller injects bounded transport and trusted dispatch;
 * neither a device token nor a due count is supplied by a public client.
 */
export function storedNativePushJob(db:SupabaseClient,dispatch:NativePushJobDependencies['dispatch']):NativePushJobDependencies{
 return {
  claim:async job=>{
   const result=await db.rpc('claim_maintenance_native_push_job',{target_job:job});
   if(result.error)throw Error('Notification claim unavailable');
   if(result.data===null)return null;
   if(typeof result.data!=='string'||!/^[0-9a-f-]{36}$/i.test(result.data))throw Error('Invalid notification claim');
   const lease=result.data;
   const row=await db.rpc('read_maintenance_native_push_job_claim',{target_job:job,target_lease:lease});
   if(row.error||typeof row.data!=='string')throw Error('Notification claim scope unavailable');
   return {lease,registration:row.data};
  },
  start:async(job,lease)=>{
   const result=await db.rpc('start_maintenance_native_push_job',{target_job:job,target_lease:lease});
   if(result.error)throw Error('Notification start unavailable');
   return result.data===true;
  },
  finish:async(job,lease,outcome)=>{
   const result=await db.rpc('finish_maintenance_native_push_job',{target_job:job,target_lease:lease,outcome});
   if(result.error)throw Error('Notification receipt unavailable');
   return result.data===true;
  },dispatch,
 };
}
