import type {SupabaseClient} from '@supabase/supabase-js';
import {runNativePushBatch,type NativePushBatchDependencies} from './native-push-batch';
import type {NativePushScope} from './native-push-scoped-store';
type Claim={lease:string;cycle:string;cursor:string|null};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
/** Internal bounded coordinator. DB transports must be bounded independently;
 * receiptDb must remain usable for checkpoint after execution cancellation. */
export async function runStoredNativeDeliverySweep(db:SupabaseClient,receiptDb:SupabaseClient,scope:NativePushScope,batch:NativePushBatchDependencies|((current:()=>Promise<void>)=>NativePushBatchDependencies),signal?:AbortSignal){
 const selected=Object.freeze({push:scope.push,purchase:scope.purchase});
 if(!['Sandbox','Production'].includes(selected.push)||!['Sandbox','Production'].includes(selected.purchase))throw Error('Invalid delivery scope');
 const args={target_push_environment:selected.push,target_purchase_environment:selected.purchase};
 const rpc=async(client:SupabaseClient,name:string,values:Record<string,unknown>={})=>{const r=await client.rpc(name,{...values,...args});if(r.error)throw Error('Delivery coordinator unavailable');return r.data;};
 if(signal?.aborted)return {status:'cancelled' as const};
 let claim:Claim;
 try{
  const value=await rpc(db,'claim_maintenance_native_delivery_sweep');
  if(value===null)return {status:'idle' as const};
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==3||!uuid(value.lease)||!uuid(value.cycle)||(value.cursor!==null&&!uuid(value.cursor)))return {status:'unconfirmed' as const};
  claim=Object.freeze({...value});
 }catch{return {status:'unconfirmed' as const};}
 const lease={target_cycle:claim.cycle,target_lease:claim.lease};
 const current=async()=>{if(signal?.aborted)throw Error('Delivery cancelled');if(await rpc(db,'maintenance_native_delivery_sweep_current',lease)!==true)throw Error('Delivery lease changed');};
 let cleaned=0,backlog=false;
 let result:Awaited<ReturnType<typeof runNativePushBatch>>={status:'unconfirmed',cursor:claim.cursor,visited:0,accepted:0,unconfirmed:0};
 try{
  await current();
  // Cleanup is mandatory before dispatch; a malformed or failed ack must stop sends.
  // Global expired identities are safe to remove regardless of deployment scope.
  const cleanup=await db.rpc('prune_maintenance_native_delivery_identities',{batch_size:500});
  if(cleanup.error||!Number.isSafeInteger(cleanup.data)||cleanup.data<0||cleanup.data>500)throw Error('Delivery cleanup unavailable');
  cleaned=cleanup.data;backlog=cleaned===500;
  await current();
  const selectedBatch=typeof batch==='function'?batch(current):batch;
  const guarded:NativePushBatchDependencies={
   page:async(after,limit)=>{await current();return selectedBatch.page(after,limit);},
   enqueue:async(id)=>{await current();return selectedBatch.enqueue(id);},
   run:async(job,jobSignal)=>{await current();return selectedBatch.run(job,jobSignal);},
  };
  result=await runNativePushBatch(guarded,signal,claim.cursor);
 }catch{/* Cursor stays before unconfirmed work; job-level durable identities prevent resending. */}
 const status=result.status==='cancelled'?'partial':result.status;
 try{
  const saved=await rpc(receiptDb,'checkpoint_maintenance_native_delivery_sweep',{...lease,expected_cursor:claim.cursor,next_cursor:result.cursor,result_status:status});
  if(saved!==true)return {status:'unconfirmed' as const,cleaned,cleanupBacklog:backlog};
 }catch{return {status:'unconfirmed' as const,cleaned,cleanupBacklog:backlog};}
 return {...result,cleaned,cleanupBacklog:backlog};
}
