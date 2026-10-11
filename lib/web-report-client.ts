import type {BillingEnvironment} from './billing';
import type {maintenanceReport} from './maintenance-report';
export type WebReport = ReturnType<typeof maintenanceReport>;
export type ReportSession = {account:string;token:string};
export type WebReportLease = {report:WebReport;checkedAt:number;deadline:number;clockDeadline:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zero='00000000-0000-0000-0000-000000000000';
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid report response');return value as Record<string,unknown>;}
function validID(value:unknown):value is string{return typeof value==='string'&&uuid.test(value)&&value.toLowerCase()!==zero;}
function count(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=1_000_000;}
function day(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function checkedWebReport(value:unknown,home:string):WebReport{
 const r=record(value);
 if(!validID(r.homeId)||r.homeId.toLowerCase()!==home.toLowerCase()||typeof r.homeName!=='string'||!r.homeName.trim()||r.homeName.length>160||typeof r.generatedAt!=='string'||r.generatedAt.length>64||!Number.isFinite(Date.parse(r.generatedAt))||!day(r.today)||typeof r.explanation!=='string'||r.explanation.length>4096)throw Error('Invalid report identity');
 for(const key of ['productCount','taskCount','overdue','dueToday'])if(!count(r[key]))throw Error('Invalid report totals');
 if(Number(r.overdue)+Number(r.dueToday)>Number(r.taskCount)||!Array.isArray(r.months)||r.months.length!==6||!Array.isArray(r.perProduct)||r.perProduct.length!==r.productCount)throw Error('Invalid report counts');
 const [year,month]=r.today.split('-').map(Number);
 for(let i=0;i<6;i++){const m=record(r.months[i]),expected=new Date(Date.UTC(year,month-6+i,1)).toISOString().slice(0,7);if(m.month!==expected||!count(m.completed))throw Error('Invalid report months');}
 const ids=new Set<string>();let overdue=0,due=0,completed=0;
 for(const value of r.perProduct){const p=record(value);if(!validID(p.productId)||ids.has(p.productId.toLowerCase())||typeof p.name!=='string'||!p.name.trim()||p.name.length>160||!count(p.overdue)||!count(p.dueToday)||!count(p.completedThisMonth))throw Error('Invalid report product');ids.add(p.productId.toLowerCase());overdue+=p.overdue;due+=p.dueToday;completed+=p.completedThisMonth;}
 if(overdue!==r.overdue||due!==r.dueToday||completed!==record(r.months[5]).completed)throw Error('Inconsistent report totals');
 return r as unknown as WebReport;
}
export function reportLeaseCurrent(lease:WebReportLease,now=Date.now(),clock=performance.now()) {return Number.isFinite(now)&&Number.isFinite(clock)&&now>=lease.checkedAt&&now<lease.deadline&&clock<lease.clockDeadline;}
export async function loadWebReport(options:{account:string;home:string;environment:BillingEnvironment;session:()=>Promise<ReportSession|null>;signal:AbortSignal;origin?:string;fetcher?:typeof fetch;now?:()=>number;clock?:()=>number}):Promise<WebReportLease>{
 const {account,home,environment,session}=options,signal=AbortSignal.any([options.signal,AbortSignal.timeout(30000)]),fetcher=options.fetcher??fetch,origin=options.origin??location.origin,now=options.now??Date.now,clock=options.clock??(()=>performance.now());
 if(!validID(account)||!validID(home)||!['Sandbox','Production'].includes(environment))throw Error('Invalid report scope');
 const initialSession=await session();signal.throwIfAborted();const captured=initialSession?{account:initialSession.account,token:initialSession.token}:null;
 if(!captured||captured.account.toLowerCase()!==account.toLowerCase()||!captured.token||captured.token.length>16384||/\s/.test(captured.token))throw Error('Report login required');
 const check=async()=>{signal.throwIfAborted();const current=await session();signal.throwIfAborted();if(current?.account!==captured.account||current?.token!==captured.token)throw Error('Report account changed');};
 async function request(path:string,epoch?:string){
  const url=new URL(path,origin);const response=await fetcher(url,{headers:{Authorization:'Bearer '+captured!.token,...(epoch?{'X-Ouchi-App-Epoch':epoch}:{})},cache:'no-store',redirect:'error',signal});signal.throwIfAborted();
  if(response.url!==url.href||response.redirected||response.status!==200||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error('Report service unavailable');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>2_000_000)) {void response.body?.cancel();throw Error('Report response too large');}
  const reader=response.body?.getReader();if(!reader)throw Error('Empty report response');
  const parts:Uint8Array[]=[];let size=0,done=false;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){signal.throwIfAborted();const chunk=await reader.read();signal.throwIfAborted();if(chunk.done){done=true;break;}size+=chunk.value.byteLength;if(size>2_000_000)throw Error('Report response too large');parts.push(chunk.value);}}
  finally{signal.removeEventListener('abort',cancel);if(!done)cancel();reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  await check();return record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }
 function rights(value:Record<string,unknown>){const time=now();if(value.plan!=='premium'||value.environment!==environment||!validID(value.purchaseAccountToken)||!['ouchi.premium.monthly','ouchi.premium.annual'].includes(String(value.productId))||typeof value.expiresAt!=='number'||!Number.isFinite(value.expiresAt)||value.expiresAt<=time)throw Error('Current premium report rights required');return {epoch:value.purchaseAccountToken.toLowerCase(),expiry:value.expiresAt};}
 const initial=rights(await request('/api/billing/entitlement'));
 const envelope=await request('/api/maintenance-report?homeId='+home.toLowerCase(),initial.epoch);
 if(envelope.environment!==environment||typeof envelope.purchaseAccountToken!=='string'||envelope.purchaseAccountToken.toLowerCase()!==initial.epoch)throw Error('Report enrollment changed');
 const report=checkedWebReport(envelope.report,home),latest=rights(await request('/api/billing/entitlement'));
 if(latest.epoch!==initial.epoch)throw Error('Report enrollment changed');await check();
 const checkedAt=now(),duration=Math.min(300_000,latest.expiry-checkedAt);if(duration<=0)throw Error('Expired report rights');return {report,checkedAt,deadline:checkedAt+duration,clockDeadline:clock()+duration};
}
