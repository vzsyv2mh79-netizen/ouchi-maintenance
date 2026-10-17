import {reconcilePurchaseHistory} from './billing-reconciliation';
import {boundedBillingRead} from './billing-read-deadline';
import type {VerifiedTransaction} from './billing';
type EngineDependencies=Parameters<typeof reconcilePurchaseHistory>[2];
type Scope=Parameters<typeof reconcilePurchaseHistory>[1];
export type RecoveryJob={id:string;userId:string;accountToken:string;environment:Scope['environment'];transactionId:string;revision:string|null;leaseToken:string;leaseUntil:string};
type Dependencies={
 readSeed:(job:RecoveryJob)=>Promise<VerifiedTransaction>;
 leaseIsCurrent:(job:RecoveryJob)=>Promise<boolean>;
 finish:(job:RecoveryJob,result:{complete:boolean;revision:string|null;error:'read_unavailable'|'cancelled'|null})=>Promise<boolean>;
 apple:EngineDependencies;
};
/** Internal worker: claimed service job only. No client-selected identity, scheduler or new rights. */
export async function runRecoveryJob(job:RecoveryJob,scope:Scope,deps:Dependencies,signal?:AbortSignal,budgetMs=60000){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const leaseEnd=Date.parse(job.leaseUntil);
 if([job.id,job.userId,job.accountToken,job.leaseToken].some(v=>!uuid.test(v)||v==='00000000-0000-0000-0000-000000000000')||job.environment!==scope.environment||job.accountToken!==scope.accountToken||!job.transactionId||job.transactionId.length>128||!Number.isInteger(budgetMs)||budgetMs<1||budgetMs>60000||!Number.isFinite(leaseEnd)||leaseEnd-Date.now()<=budgetMs+5000)throw new Error('Invalid recovery job');
 const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const guard=async()=>{if(controller.signal.aborted||Date.now()>=leaseEnd||!await deps.leaseIsCurrent(job))throw new Error('Recovery lease unavailable');if(controller.signal.aborted||Date.now()>=leaseEnd)throw new Error('Recovery lease unavailable');};
 try{
  const result=await boundedBillingRead(async()=>{
   await guard();const seed=await deps.readSeed(job);await guard();
   if(seed.transactionId!==job.transactionId||seed.accountToken!==job.accountToken||seed.environment!==job.environment)throw new Error('Recovery seed changed scope');
   return reconcilePurchaseHistory(seed,scope,{
    ...deps.apple,
    saveTransaction:async(jws,transaction)=>{await guard();await deps.apple.saveTransaction(jws,transaction);},
    saveRenewal:async(jws,renewal)=>{await guard();await deps.apple.saveRenewal(jws,renewal);},
   },{revision:job.revision??undefined,maxPages:1,signal:controller.signal});
  },controller.signal,budgetMs);
  await guard();if(!await deps.finish(job,{complete:result.complete,revision:result.revision,error:null}))throw new Error('Recovery acknowledgement unavailable');
  return result;
 }catch{
  controller.abort();
  // Durable failure retains the last acknowledged cursor. Uncertain finish must never report success.
  const recorded=await deps.finish(job,{complete:false,revision:null,error:signal?.aborted?'cancelled':'read_unavailable'});
  if(!recorded)throw new Error('Recovery failure acknowledgement unavailable');
  return {complete:false as const,retryRequested:!signal?.aborted};
 }finally{controller.abort();signal?.removeEventListener('abort',cancel);}
}

/** Decode only a service RPC claim; never expose this as client input. */
export function parseRecoveryJob(value:unknown,environment:Scope['environment']):RecoveryJob{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid recovery claim');
 const v=value as Record<string,unknown>;
 for(const key of ['id','userId','accountToken','transactionId','leaseToken','leaseUntil'])if(typeof v[key]!=='string')throw new Error('Invalid recovery claim');
 if(v.environment!==environment||(v.revision!==null&&(typeof v.revision!=='string'||!v.revision||v.revision.length>4096)))throw new Error('Invalid recovery claim');
 return {id:v.id as string,userId:v.userId as string,accountToken:v.accountToken as string,environment,transactionId:v.transactionId as string,revision:v.revision as string|null,leaseToken:v.leaseToken as string,leaseUntil:v.leaseUntil as string};
}
