import type {BillingEnvironment} from './billing';
import type {ReportSession} from './web-report-client';
import {parseReminderSchedule,freeReminderSchedule,type ReminderSchedule} from './reminder-schedule';
export type WebReminderSelection={revision:number;saved:ReminderSchedule|null;effective:ReminderSchedule;premiumActive:boolean;epoch:string;environment:BillingEnvironment;checkedAt:number;deadline:number;clockDeadline:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validID(value:unknown):value is string{return typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid settings response');return value as Record<string,unknown>;}
export function reminderSelectionCurrent(value:WebReminderSelection,now=Date.now(),clock=performance.now()){return now>=value.checkedAt&&now<value.deadline&&clock<value.clockDeadline;}
export async function changeWebReminder(options:{account:string;environment:BillingEnvironment;session:()=>Promise<ReportSession|null>;signal:AbortSignal;save?:{prior:WebReminderSelection;schedule:ReminderSchedule};origin?:string;fetcher?:typeof fetch;now?:()=>number;clock?:()=>number}):Promise<WebReminderSelection>{
 const {account,environment,session,save}=options,signal=AbortSignal.any([options.signal,AbortSignal.timeout(30000)]),fetcher=options.fetcher??fetch,origin=options.origin??location.origin,now=options.now??Date.now,clock=options.clock??(()=>performance.now());
 if(!validID(account)||!['Sandbox','Production'].includes(environment))throw Error('Invalid settings scope');
 const initialSession=await session();signal.throwIfAborted();const captured=initialSession?{account:initialSession.account,token:initialSession.token}:null;
 if(!captured||captured.account.toLowerCase()!==account.toLowerCase()||!captured.token||captured.token.length>16384||/\s/.test(captured.token))throw Error('Settings login required');
 const check=async()=>{signal.throwIfAborted();const current=await session();signal.throwIfAborted();if(current?.account!==captured.account||current?.token!==captured.token)throw Error('Settings account changed');};
 async function request(path:string,epoch?:string,body?:object){
  const url=new URL(path,origin);const response=await fetcher(url,{method:body?'PUT':'GET',body:body?JSON.stringify(body):undefined,headers:{...(body?{'Content-Type':'application/json'}:{}),Authorization:'Bearer '+captured!.token,...(epoch?{'X-Ouchi-App-Epoch':epoch}:{})},cache:'no-store',redirect:'error',signal});signal.throwIfAborted();
  if(response.url!==url.href||response.redirected||response.status!==200||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error('Reminder service unavailable');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>4096)) {void response.body?.cancel();throw Error('Reminder response too large');}
  const reader=response.body?.getReader();if(!reader)throw Error('Empty report response');
  const parts:Uint8Array[]=[];let size=0,done=false;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();if(chunk.done){done=true;break;}size+=chunk.value.byteLength;if(size>4096)throw Error('Reminder response too large');parts.push(chunk.value);}}
  finally{signal.removeEventListener('abort',cancel);if(!done)cancel();reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  await check();return record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }
 function rights(value:Record<string,unknown>){
  if(!['premium','free'].includes(String(value.plan))||value.environment!==environment||!validID(value.purchaseAccountToken))throw Error('Invalid settings rights');
  const premium=value.plan==='premium';if(premium&&(!['ouchi.premium.monthly','ouchi.premium.annual'].includes(String(value.productId))||typeof value.expiresAt!=='number'||!Number.isFinite(value.expiresAt)||value.expiresAt<=now()))throw Error('Expired settings rights');
  return {epoch:value.purchaseAccountToken.toLowerCase(),premium,expiry:premium?value.expiresAt as number:null};
 }
 const initial=rights(await request('/api/billing/entitlement'));
 let input:{revision:number;schedule:ReminderSchedule}|undefined;
 if(save){if(!initial.premium||save.prior.epoch!==initial.epoch||save.prior.environment!==environment||!Number.isSafeInteger(save.prior.revision)||save.prior.revision<0||save.prior.revision>=Number.MAX_SAFE_INTEGER)throw Error('Settings save scope changed');input={revision:save.prior.revision,schedule:parseReminderSchedule(save.schedule)};}
 const result=await request('/api/reminder-settings',initial.epoch,input);
 if(Object.keys(result).sort().join(',')!=='effective,environment,premiumActive,purchaseAccountToken,revision,salesEnabled,saved'||result.environment!==environment||result.purchaseAccountToken!==initial.epoch||result.salesEnabled!==false||typeof result.premiumActive!=='boolean'||!Number.isSafeInteger(result.revision)||Number(result.revision)<0)throw Error('Invalid settings receipt');
 const saved=result.saved===null?null:parseReminderSchedule(result.saved),effective=parseReminderSchedule(result.effective);
 if((result.revision===0)!==(saved===null)||JSON.stringify(effective)!==JSON.stringify(result.premiumActive?(saved??freeReminderSchedule):freeReminderSchedule))throw Error('Inconsistent settings receipt');
 if(input&&(result.revision!==input.revision+1||JSON.stringify(saved)!==JSON.stringify(input.schedule)))throw Error('Unconfirmed settings save');
 const latest=rights(await request('/api/billing/entitlement'));await check();
 if(latest.epoch!==initial.epoch||latest.premium!==result.premiumActive)throw Error('Settings rights changed');
 const checkedAt=now(),duration=Math.min(300000,latest.expiry===null?300000:latest.expiry-checkedAt);if(duration<=0)throw Error('Expired settings rights');
 return {revision:result.revision as number,saved,effective,premiumActive:latest.premium,epoch:latest.epoch,environment,checkedAt,deadline:checkedAt+duration,clockDeadline:clock()+duration};
}
