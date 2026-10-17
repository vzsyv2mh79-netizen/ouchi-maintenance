import type {ReportSession} from './web-report-client';
export type WebEnrollmentState={userID:string;sessionID:string;epochID:string|null;enrolled:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
/** The token payload is only a comparison scope; the server verifies it with Auth. */
function scope(token:string,account:string){
 const parts=token.split('.');if(parts.length!==3||!/^[A-Za-z0-9_-]+$/.test(parts[1]))throw Error('Enrollment login required');
 const body=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
 if(body.sub!==account||!valid(body.session_id)||!Number.isFinite(body.exp)||body.exp*1000<=Date.now())throw Error('Enrollment login expired');
 return body.session_id as string;
}
export async function readOrEnrollWebAccount(options:{account:string;session:()=>Promise<ReportSession|null>;signal:AbortSignal;consent?:{password:string;requestID:string};origin?:string;fetcher?:typeof fetch}):Promise<WebEnrollmentState>{
 const signal=AbortSignal.any([options.signal,AbortSignal.timeout(30000)]),fetcher=options.fetcher??fetch;
 if(!valid(options.account))throw Error('Invalid enrollment account');
 const consent=options.consent?{...options.consent}:undefined;
 if(consent&&(!valid(consent.requestID)||!consent.password||consent.password.length>1024))throw Error('Invalid enrollment confirmation');
 const initial=await options.session();signal.throwIfAborted();
 if(!initial||initial.account!==options.account||!initial.token||initial.token.length>16384||/\s/.test(initial.token))throw Error('Enrollment login required');
 const captured=Object.freeze({...initial}),sessionID=scope(captured.token,options.account);
 const check=async()=>{signal.throwIfAborted();const current=await options.session();signal.throwIfAborted();if(current?.account!==captured.account||current?.token!==captured.token)throw Error('Enrollment login changed');};
 const url=new URL('/api/account/enrollment',options.origin??location.origin);
 async function request(body?:object){
  await check();const response=await fetcher(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+captured.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal,cache:'no-store',redirect:'error'});
  signal.throwIfAborted();
  if(response.url!==url.href||response.redirected||response.status!==200||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error('Enrollment result unavailable');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>4096)){void response.body?.cancel().catch(()=>{});throw Error('Enrollment response too large');}
  const reader=response.body?.getReader();if(!reader)throw Error('Empty enrollment response');
  const chunks:Uint8Array[]=[];let count=0,done=false;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done){done=true;break;}count+=part.value.byteLength;if(count>4096)throw Error('Enrollment response too large');chunks.push(part.value);}}
  finally{signal.removeEventListener('abort',cancel);if(!done)cancel();reader.releaseLock();}
  if(count===0||declared!==null&&Number(declared)!==count)throw Error('Enrollment length mismatch');
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  await check();if(!value||typeof value!=='object'||Array.isArray(value)||value.userID!==options.account||value.sessionID!==sessionID)throw Error('Enrollment identity mismatch');return value;
 }
 let granted:string|undefined;
 if(consent){const receipt=await request({confirmation:'ENROLL_OUCHI_MAINTENANCE',password:consent.password,requestID:consent.requestID});if(Object.keys(receipt).sort().join(',')!=='epochID,requestID,sessionID,userID'||receipt.requestID!==consent.requestID||!valid(receipt.epochID))throw Error('Enrollment acknowledgement unavailable');granted=receipt.epochID;}
 const state=await request();
 if(Object.keys(state).sort().join(',')!=='enrolled,epochID,sessionID,userID'||typeof state.enrolled!=='boolean'||(state.enrolled?!valid(state.epochID):state.epochID!==null)||granted!==undefined&&state.epochID!==granted)throw Error('Enrollment readback mismatch');
 await check();return Object.freeze({...state}) as WebEnrollmentState;
}
