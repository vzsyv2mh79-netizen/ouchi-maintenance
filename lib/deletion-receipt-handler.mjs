import {createTerminalDeletionReader} from './deletion-receipt-terminal.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
/** Undeployed handler. Scope is loaded from the trusted journal, never supplied
 * in the body. Host/rate limits, real Auth, bounded transaction transport and
 * credential log redaction must be supplied before a production route is added.
 */
export function createDeletionReceiptHTTP({credentials,resolveScope,transaction,allowOrigin}){
 if(!credentials||typeof credentials.register!=='function'||typeof credentials.authorize!=='function'||typeof resolveScope!=='function'||typeof transaction!=='function'||typeof allowOrigin!=='function')throw Error('Receipt HTTP dependencies required');
 return async(request,requestID)=>{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(5000)]);
  if(!uuid.test(requestID)||requestID==='00000000-0000-0000-0000-000000000000'||new URL(request.url).search)return reply(400,{error:'Invalid request'});
  if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
  const origin=request.headers.get('origin');if(origin!==null&&allowOrigin(origin)!==true)return reply(403,{error:'Origin refused'});
  const token=request.headers.get('x-deletion-receipt');if(!token||!tokenPattern.test(token)||Buffer.from(token,'base64url').length!==32||Buffer.from(token,'base64url').toString('base64url')!==token)return reply(401,{error:'Receipt required'});
  let expiry,bearer='';
  if(request.method==='POST'){
   if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply(400,{error:'JSON required'});
   const header=request.headers.get('authorization');if(header!==null){if(header.length>16384||!/^Bearer [^\s]+$/.test(header))return reply(401,{error:'Authentication required'});bearer=header.slice(7);}
   try{const reader=request.body?.getReader();if(!reader)return reply(400,{error:'Body required'});let bytes=0;const chunks=[];try{while(true){if(signal.aborted)throw Error('Aborted');const r=await new Promise((resolve,reject)=>{const stop=()=>{void reader.cancel().catch(()=>{});reject(Error('Aborted'));};if(signal.aborted)return stop();signal.addEventListener('abort',stop,{once:true});reader.read().then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop)).catch(()=>{});});if(r.done)break;bytes+=r.value.byteLength;if(bytes>256){void reader.cancel().catch(()=>{});return reply(413,{error:'Body too large'});}chunks.push(r.value);}}finally{reader.releaseLock();}const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));if(!body||Object.keys(body).join(',')!=='expiresAt'||typeof body.expiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.expiresAt)||!Number.isFinite(Date.parse(body.expiresAt)))return reply(400,{error:'Invalid deadline'});expiry=body.expiresAt;}catch{return reply(400,{error:'Invalid body'});}
  }else if(request.body!==null)return reply(400,{error:'Unexpected body'});
  if(signal.aborted)return reply(409,{error:'Request cancelled'});
  try{
   return await transaction(async tx=>{
    if(signal.aborted)throw Error("Aborted");
    const scope=await resolveScope(requestID,tx);if(!scope||scope.requestID!==requestID)return reply(404,{error:'Receipt unavailable'});
    if(signal.aborted)throw Error('Aborted');
    if(request.method==='POST'){
     const result=await credentials.register(scope,bearer,token,expiry,tx);if(signal.aborted)throw Error('Aborted');
     return reply(200,{registered:true,expiresAt:result.expiresAt});
    }
    if(await credentials.authorize(scope,token,tx)!==true)return reply(401,{error:'Receipt unavailable'});
    const read=createTerminalDeletionReader({authorize:(s,t)=>credentials.authorize(s,token,t)});const result=await read(scope,tx);if(signal.aborted)throw Error('Aborted');
    return reply(200,result);
   },{signal,readOnly:request.method==='GET'});
  }catch{return reply(503,{error:'Receipt confirmation unavailable'});}
 };
}
