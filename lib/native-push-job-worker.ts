import type { APNsDisposition } from './apns-maintenance';
type Outcome=APNsDisposition|'skipped';
export type NativePushJobDependencies={
 claim:(job:string)=>Promise<{lease:string;registration:string}|null>;
 start:(job:string,lease:string)=>Promise<boolean>;
 dispatch:(registration:string,job:string,lease:string,signal?:AbortSignal)=>Promise<Outcome>;
 finish:(job:string,lease:string,outcome:Outcome)=>Promise<boolean>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=(value:string)=>uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
/** Internal orchestration only. A failed acknowledgement is not permission to resend. */
export async function runNativePushJob(job:string,deps:NativePushJobDependencies,signal?:AbortSignal):Promise<{
 status:'unclaimed'|'recorded'|'unconfirmed';outcome?:Outcome;
}>{
 if(!valid(job))throw Error('Invalid notification job');
 if(signal?.aborted)return {status:'unclaimed'};
 let claim;
 try{claim=await deps.claim(job);}catch{return {status:'unconfirmed'};}
 if(!claim)return {status:'unclaimed'};
 if(!valid(claim.lease)||!valid(claim.registration))return {status:'unconfirmed'};
 let outcome:Outcome='skipped';
 if(!signal?.aborted){
  let started=false;
  try{started=await deps.start(job,claim.lease);}catch{
   // No send occurred here, but the server may have recorded send_started_at.
   outcome='delivery-unknown';
  }
  if(started){
   if(signal?.aborted)outcome='delivery-unknown';
   else{
    try{outcome=await deps.dispatch(claim.registration,job,claim.lease,signal);}catch{outcome='delivery-unknown';}
   }
  }
 }
 // Do not cancel receipt persistence when a caller cancels the send operation.
 try{
  return {status:await deps.finish(job,claim.lease,outcome)?'recorded':'unconfirmed',outcome};
 }catch{return {status:'unconfirmed',outcome};}
}
