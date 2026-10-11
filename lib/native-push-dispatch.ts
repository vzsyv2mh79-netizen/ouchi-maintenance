import type { APNsDisposition } from './apns-maintenance';
export type NativePushDestination={id:string;environment:'Sandbox'|'Production';deviceToken:string;topic:string;registeredAt:number};
export type NativePushDispatchDependencies={
 read:(registrationID:string)=>Promise<NativePushDestination|null>;
 allowed:(registrationID:string)=>Promise<boolean>;
 send:(input:{deviceToken:string;bundleId:string;registeredAt:number;dueCount:number;now:number},signal?:AbortSignal)=>Promise<APNsDisposition|'skipped'>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Prepared Sandbox dispatch only. Trusted server computes count; callers never
 * supply a destination token. Already accepted APNs messages cannot be recalled.
 */
export async function dispatchRegisteredSandboxPush(id:string,count:number,now:number,deps:NativePushDispatchDependencies,signal?:AbortSignal):Promise<APNsDisposition|'skipped'>{
 if(!uuid.test(id)||id==='00000000-0000-0000-0000-000000000000'||!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(now)||now<=0)throw new Error('Invalid dispatch');
 if(signal?.aborted||count===0)return 'skipped';
 let sending=false;
 try{
  const row=await deps.read(id);
  if(signal?.aborted||!row)return 'skipped';
  if(row.id!==id||row.environment!=='Sandbox'||row.topic!=='jp.ouchi.maintenance'||!/^([0-9a-f]{2}){16,512}$/.test(row.deviceToken)||!Number.isSafeInteger(row.registeredAt)||row.registeredAt<=0||row.registeredAt>now)return 'inspect';
  const input=Object.freeze({deviceToken:row.deviceToken,bundleId:row.topic,registeredAt:row.registeredAt,dueCount:count,now});
  if(await deps.allowed(id)!==true||signal?.aborted)return 'skipped';
  // A confirmed provider receipt must survive caller cancellation, otherwise a
  // scheduler could resend a notification that Apple already accepted.
  sending=true;
  return await deps.send(input,signal);
 }catch{return sending?'delivery-unknown':'retry';}
}
