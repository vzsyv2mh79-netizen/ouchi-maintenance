import type {SupabaseClient} from '@supabase/supabase-js';
import type {APNsEnvironment} from './apns-maintenance';
import type {BillingEnvironment} from './billing';
import {dispatchRegisteredScopedPush,type NativePushDestination} from './native-push-dispatch';
import type {NativePushDispatchDependencies} from './native-push-dispatch';
import {runNativePushJob} from './native-push-job-worker';
import type {NativePushJobDependencies} from './native-push-job-worker';
import type {NativePushBatchDependencies} from './native-push-batch';
export type NativePushScope={push:APNsEnvironment;purchase:BillingEnvironment};
/** Internal composition only. The explicit scopes are server deployment config,
 * never request bodies. A route/scheduler does not activate this adapter. */
export function storedScopedNativePushBatch(db:SupabaseClient,scope:NativePushScope,send:NativePushDispatchDependencies['send'],now:()=>number=Date.now):NativePushBatchDependencies{
 const selected=Object.freeze({push:scope.push,purchase:scope.purchase});
 if(!['Sandbox','Production'].includes(selected.push)||!['Sandbox','Production'].includes(selected.purchase))throw Error('Invalid notification scope');
 const args={target_push_environment:selected.push,target_purchase_environment:selected.purchase};
 const rpc=async(name:string,values:Record<string,unknown>)=>{const result=await db.rpc(name,{...values,...args});if(result.error)throw Error('Notification storage unavailable');return result.data;};
 const seen=new Map<string,NativePushDestination>();
 const read=async(id:string)=>{const data=await rpc('read_maintenance_native_scoped_destination',{registration_id:id});if(data===null)return null;
  if(!data||typeof data!=='object'||Array.isArray(data)||data.id!==id||data.environment!==selected.push||data.purchaseEnvironment!==selected.purchase||data.topic!=='jp.ouchi.maintenance'||typeof data.deviceToken!=='string'||!/^([0-9a-f]{2}){16,512}$/.test(data.deviceToken)||!Number.isSafeInteger(data.registeredAt)||data.registeredAt<=0)throw Error('Invalid notification destination');
  return Object.freeze({...data}) as NativePushDestination;
 };
 const destination:NativePushDispatchDependencies={
  read:async id=>{const row=await read(id);if(row)seen.set(id,row);else seen.delete(id);return row;},
  allowed:async id=>{const prior=seen.get(id);const current=await read(id);seen.delete(id);return !!prior&&!!current&&prior.deviceToken===current.deviceToken&&prior.registeredAt===current.registeredAt;},
  send,
 };
 const job:NativePushJobDependencies={
  claim:async id=>{const lease=await rpc('claim_maintenance_native_scoped_push_job',{target_job:id});if(lease===null)return null;if(typeof lease!=='string')throw Error('Invalid notification lease');const registration=await rpc('read_maintenance_native_scoped_job_claim',{target_job:id,target_lease:lease});if(typeof registration!=='string')throw Error('Invalid notification claim');return {lease,registration};},
  start:async(id,lease)=>await rpc('start_maintenance_native_scoped_push_job',{target_job:id,target_lease:lease})===true,
  finish:async(id,lease,outcome)=>await rpc('finish_maintenance_native_scoped_push_job',{target_job:id,target_lease:lease,outcome})===true,
  dispatch:async(registration,idJob,lease,signal)=>{
   if(signal?.aborted)return 'skipped';
   const claim=await rpc('read_maintenance_native_scoped_job_claim',{target_job:idJob,target_lease:lease});if(claim!==registration)return 'inspect';
   const count=await rpc('count_maintenance_native_scoped_job_due',{target_job:idJob,target_lease:lease});
   if(!Number.isSafeInteger(count)||count<0||count>100000)return 'inspect';
   if(signal?.aborted||count===0)return 'skipped';
   const guarded={...destination,allowed:async(id:string)=>{
    if(!await destination.allowed(id)||signal?.aborted)return false;
    const currentClaim=await rpc('read_maintenance_native_scoped_job_claim',{target_job:idJob,target_lease:lease});
    if(currentClaim!==registration)return false;
    return await rpc('count_maintenance_native_scoped_job_due',{target_job:idJob,target_lease:lease})===count&&!signal?.aborted;
   }};
   try{return await dispatchRegisteredScopedPush(selected,registration,count,now(),guarded,signal);}finally{seen.delete(registration);} 
  },
 };
 return {
  page:async(after,limit)=>{const data=await rpc('page_maintenance_native_scoped_devices',{after_id:after,batch_size:limit});if(!Array.isArray(data)||data.some(value=>typeof value!=='string'))throw Error('Invalid notification page');return data;},
  enqueue:async registration=>{const data=await rpc('enqueue_maintenance_native_scoped_daily_job',{registration_id:registration});if(data!==null&&typeof data!=='string')throw Error('Invalid notification job');return data;},
  run:(id,signal)=>runNativePushJob(id,job,signal),
 };
}
