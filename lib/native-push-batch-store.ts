import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativePushBatchDependencies } from './native-push-batch';
/** Internal service-only paging; tokens never appear in page responses. */
export function storedNativePushBatch(db:SupabaseClient,run:NativePushBatchDependencies['run']):NativePushBatchDependencies{
 return {
  page:async(after,limit)=>{
   const result=await db.rpc('page_maintenance_native_sandbox_devices',{after_id:after,batch_size:limit});
   if(result.error||!Array.isArray(result.data)||result.data.some(value=>typeof value!=='string'))throw Error('Notification page unavailable');
   return result.data;
  },
  enqueue:async registration=>{
   const result=await db.rpc('enqueue_maintenance_native_daily_job',{registration_id:registration});
   if(result.error||(result.data!==null&&typeof result.data!=='string'))throw Error('Notification enqueue unavailable');
   return result.data;
  },run,
 };
}
