import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativePushJobDependencies } from './native-push-job-worker';
import { dispatchRegisteredSandboxPush, type NativePushDispatchDependencies } from './native-push-dispatch';
/** Trusted server count; no route or scheduled sending is enabled here. */
export function countedNativePushDispatch(db:SupabaseClient,destination:NativePushDispatchDependencies,now:()=>number=Date.now):NativePushJobDependencies['dispatch']{
 return async(registration,job,lease,signal)=>{
  if(signal?.aborted)return 'skipped';
  const scope=await db.rpc('read_maintenance_native_push_job_claim',{target_job:job,target_lease:lease});
  if(scope.error||scope.data!==registration)return 'inspect';
  const result=await db.rpc('count_maintenance_native_job_due',{target_job:job,target_lease:lease});
  if(result.error||!Number.isSafeInteger(result.data)||result.data<0||result.data>100000)return 'inspect';
  if(signal?.aborted||result.data===0)return 'skipped';
  return dispatchRegisteredSandboxPush(registration,result.data,now(),destination,signal);
 };
}
