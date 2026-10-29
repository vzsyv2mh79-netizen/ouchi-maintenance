import type {BillingEnvironment} from './billing';
import type {ReportSession} from './web-report-client';
import type {NotificationChannel} from './notification-channel-service';
export type WebChannelSelection={revision:number;channel:NotificationChannel;nativeRegistered:boolean;epoch:string;environment:BillingEnvironment;checkedAt:number;deadline:number;clockDeadline:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validID(value:unknown):value is string{return typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid settings response');return value as Record<string,unknown>;}
export function channelSelectionCurrent(value:WebChannelSelection,now=Date.now(),clock=performance.now()){return now>=value.checkedAt&&now<value.deadline&&clock<value.clockDeadline;}
export async function changeWebNotificationChannel(options:{account:string;environment:BillingEnvironment;session:()=>Promise<ReportSession|null>;signal:AbortSignal;save?:{prior:WebChannelSelection;channel:NotificationChannel};origin?:string;fetcher?:typeof fetch;now?:()=>number;clock?:()=>number}):Promise<WebChannelSelection>{
 const {account,environment,session}=options,save=options.save?{prior:{...options.save.prior},channel:options.save.channel}:undefined,signal=AbortSignal.any([options.signal,AbortSignal.timeout(30000)]),fetcher=options.fetcher??fetch,origin=options.origin??location.origin,now=options.now??Date.now,clock=options.clock??(()=>performance.now());
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
  if(size===0||(declared!==null&&Number(declared)!==size))throw Error('Invalid channel response length');
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  await check();return record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }
 function rights(value:Record<string,unknown>){
  // Free channel selection uses ledger only to confirm the exact enrollment.
  if(!['premium','free'].includes(String(value.plan))||value.environment!==environment||!validID(value.purchaseAccountToken))throw Error('Invalid channel enrollment');
  return {epoch:value.purchaseAccountToken.toLowerCase()};
 }
 const initial=rights(await request('/api/billing/entitlement'));
 let input:{revision:number;channel:NotificationChannel}|undefined;
 if(save){if(save.prior.epoch!==initial.epoch||save.prior.environment!==environment||!channelSelectionCurrent(save.prior,now(),clock())||!Number.isSafeInteger(save.prior.revision)||save.prior.revision<0||save.prior.revision>=Number.MAX_SAFE_INTEGER||!['web','native','both'].includes(save.channel))throw Error('Channel save scope changed');input={revision:save.prior.revision,channel:save.channel};}
 const result=await request('/api/notification-channel',initial.epoch,input);
 if(Object.keys(result).sort().join(',')!=='channel,environment,nativeRegistered,purchaseAccountToken,revision'||result.environment!==environment||result.purchaseAccountToken!==initial.epoch||!['web','native','both'].includes(String(result.channel))||typeof result.nativeRegistered!=='boolean'||!Number.isSafeInteger(result.revision)||Number(result.revision)<0||(result.revision===0&&result.channel!=='both'))throw Error('Invalid channel receipt');
 if(input&&(result.revision!==input.revision+1||result.channel!==input.channel))throw Error('Unconfirmed channel save');
 const checked=Object.freeze({revision:result.revision as number,channel:result.channel as NotificationChannel,nativeRegistered:result.nativeRegistered});
 const latest=rights(await request('/api/billing/entitlement'));await check();
 if(latest.epoch!==initial.epoch)throw Error('Channel enrollment changed');
 const checkedAt=now(),duration=300000;if(!Number.isSafeInteger(checkedAt)||checkedAt<=0||!Number.isFinite(clock()))throw Error('Invalid channel clock');
 return {...checked,epoch:latest.epoch,environment,checkedAt,deadline:checkedAt+duration,clockDeadline:clock()+duration};
}
