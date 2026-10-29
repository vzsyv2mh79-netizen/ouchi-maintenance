import {ManagementReauthenticationRequired} from './ownerless-home-management.mjs';
import {HomeHandoffAdditionalVerificationRequired} from './home-handoff-handler.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const reply=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function bounded(promise,signal){
 signal.throwIfAborted();let stop;
 const abort=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([promise,abort]);}finally{signal.removeEventListener('abort',stop);}
}
async function body(request,signal){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('JSON required');
 const reader=request.body?.getReader();if(!reader)throw Error('Body required');
 const chunks=[];let size=0;
 const stop=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
 try{
  while(true){signal.throwIfAborted();const item=await bounded(reader.read(),signal);signal.throwIfAborted();if(item.done)break;size+=item.value.byteLength;if(size>2048)throw Error('Body too large');chunks.push(item.value);}
  const bytes=new Uint8Array(size);let index=0;for(const chunk of chunks){bytes.set(chunk,index);index+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{signal.removeEventListener('abort',stop);reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Ports own the SAME pinned transaction for identity, SQL and final recheck.
 * No supplied user/session ID or client ownership flag enters those ports.
 */
export async function ownerlessHomeManagementResponse(request,{origin,management,timeoutMS=5000}){
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/family\/management\/([0-9a-f-]{36})$/);
 if(url.origin!==origin||url.hash||!match||!uuid(match[1]))return reply(404,{error:'Management unavailable'});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method unavailable'});
 if(!management||!['readStatus','readClaim','claim'].every(key=>typeof management[key]==='function')||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>30000)return reply(503,{error:'Management result unconfirmed'});
 const authorization=request.headers.get('authorization');
 if(!authorization||!/^Bearer [^\s,]{1,16384}$/.test(authorization))return reply(401,{error:'Authentication required'});
 const epochID=request.headers.get('x-ouchi-app-epoch');if(!uuid(epochID))return reply(400,{error:'Invalid management request'});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMS)]);
 let phase='input';
 try{
  let input,operation;
  if(request.method==='GET'){
   if(request.body)throw Error('Unexpected body');
   if(!url.search){input={homeID:match[1],epochID};operation='readStatus';}
   else{
    const entries=[...url.searchParams];
    if(entries.length!==2||entries.map(([key])=>key).sort().join(',')!=='generation,requestID')throw Error('Invalid receipt query');
    const requestID=url.searchParams.get('requestID'),generation=url.searchParams.get('generation');
    if(!uuid(requestID)||!uuid(generation))throw Error('Invalid receipt query');
    input={homeID:match[1],epochID,requestID,generation};operation='readClaim';
   }
  }else{
   if(url.search)throw Error('Unexpected query');const value=await body(request,signal);
   if(!value||Object.keys(value).sort().join(',')!=='confirmation,generation,requestID'
    ||!uuid(value.requestID)||!uuid(value.generation)||value.confirmation!=='CLAIM_HOME_MANAGEMENT')throw Error('Explicit claim required');
   input={homeID:match[1],epochID,...value};operation='claim';
  }
  signal.throwIfAborted();phase='operation';
  const result=await bounded(management[operation](Object.freeze(input),authorization.slice(7),signal),signal);signal.throwIfAborted();
  // Runtime adapter validates the full result before committing. Also bind its
  // response to this HTTP scope instead of forwarding an arbitrary provider body.
  if(!result||result.homeID!==input.homeID||result.epochID!==input.epochID
   ||(operation!=='readStatus'&&(result.requestID!==input.requestID||result.generation!==input.generation)))throw Error('Unconfirmed response');
  if(operation==='readStatus'){
   if(Object.keys(result).sort().join(',')!=='canClaim,epochID,generation,homeID,kind,state'||result.kind!=='ownerless-home-status/v1'
    ||!['managed','awaiting_management'].includes(result.state)||typeof result.canClaim!=='boolean'
    ||(result.state==='managed'?(result.generation!==null||result.canClaim):!uuid(result.generation)))throw Error('Unconfirmed response');
  }else if(Object.keys(result).sort().join(',')!=='epochID,generation,homeID,kind,requestID,state'||result.kind!=='ownerless-home-claim/v1'
   ||!(operation==='claim'?['claimed','superseded']:['claimed','superseded','not_recorded']).includes(result.state))throw Error('Unconfirmed response');
  return reply(200,result);
 }catch(error){
  if(signal.aborted)return reply(503,{error:'Management result unconfirmed'});
  if(phase==='input')return reply(400,{error:'Invalid management request'});
  if(error instanceof ManagementReauthenticationRequired||error instanceof HomeHandoffAdditionalVerificationRequired)return reply(403,{error:'Additional verification required',code:'additional_verification_required'});
  return reply(503,{error:'Management result unconfirmed'});
 }
}
