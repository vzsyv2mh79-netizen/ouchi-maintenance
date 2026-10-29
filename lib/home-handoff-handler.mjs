// Prepared handler only; no shipping route/provider is enabled here.
// verifyCurrent must independently acquire current Auth/MFA/session policy.
// All provider operations must honor signal and settle their own resources.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validID=value=>typeof value==='string'&&uuid.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const states=new Set(['pending','expired','cancelled','completed']);
const response=(status,value)=>Response.json(value,{status,headers:{'cache-control':'no-store','pragma':'no-cache'}});
export class HomeHandoffRefusal extends Error {
 constructor(reason){super('Handoff refused');this.reason=reason;}
}
// Only the trusted current-policy identity verifier may issue this refusal.
export class HomeHandoffAdditionalVerificationRequired extends Error {}
async function bounded(promise,signal){
 signal.throwIfAborted();let reject;
 const aborted=new Promise((resolve,fail)=>{reject=fail;});
 const stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});
 try{return await Promise.race([promise,aborted]);}finally{signal.removeEventListener('abort',stop);}
}
async function body(request,signal){
 const reader=request.body?.getReader();if(!reader)throw Error('Body required');
 let count=0;const chunks=[];const stop=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
 try{
  while(true){signal.throwIfAborted();const item=await bounded(reader.read(),signal);if(item.done)break;count+=item.value.byteLength;if(count>4096)throw Error('Body too large');chunks.push(item.value);}
  const data=new Uint8Array(count);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
 }finally{signal.removeEventListener('abort',stop);reader.cancel().catch(()=>{});reader.releaseLock();}
}
function checkedStatus(value,requestID,homeID){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='expiresAt,homeID,requestID,state'
 ||value.requestID!==requestID||!validID(value.homeID)||(homeID&&value.homeID!==homeID)||!states.has(value.state)
 ||typeof value.expiresAt!=='string'||value.expiresAt.length>64||!Number.isFinite(Date.parse(value.expiresAt)))throw Error('Unconfirmed result');
 return value;
}
// Never accept caller-supplied user/session identity or client ownership flags.
export async function homeHandoffResponse(request,{origin,verifyCurrent,read,create,decide,timeoutMS=5000}){
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/family\/handoff\/([0-9a-f-]{36})$/);
 if(url.origin!==origin||url.search||url.hash||!match||!validID(match[1]))return response(404,{error:'Handoff unavailable'});
 if(!['GET','POST','PUT'].includes(request.method))return response(405,{error:'Method unavailable'});
 if(![verifyCurrent,read,create,decide].every(port=>typeof port==='function')||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>30000)return response(503,{error:'Handoff result unconfirmed'});
 const authorization=request.headers.get('authorization');
 if(!authorization||!/^Bearer [^\s,]{1,16384}$/.test(authorization))return response(401,{error:'Authentication required'});
 const epochID=request.headers.get('x-ouchi-app-epoch');if(!validID(epochID))return response(400,{error:'Invalid handoff'});
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMS)]);
 let phase='input';
 try{
  signal.throwIfAborted();
  let value;
  if(request.method==='GET'){if(request.body)throw Error('Unexpected body');}
  else{
   if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('Invalid body type');
   value=await body(request,signal);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid body');
   const keys=Object.keys(value).sort().join(',');
   if(request.method==='POST'&&(keys!=='homeID,recipientID'||!validID(value.homeID)||!validID(value.recipientID)))throw Error('Invalid create');
   if(request.method==='PUT'&&(keys!=='accept'||typeof value.accept!=='boolean'))throw Error('Invalid decision');
  }
  phase='identity';signal.throwIfAborted();
  const identity=await bounded(verifyCurrent(authorization.slice(7),signal),signal);signal.throwIfAborted();
  if(!identity||!validID(identity.userID)||!validID(identity.sessionID)||identity.epochID!==epochID)return response(401,{error:'Authentication required'});
  const scope={requestID:match[1],userID:identity.userID,sessionID:identity.sessionID,epochID};
  if(request.method==='POST'&&value.recipientID===identity.userID)return response(400,{error:'Invalid handoff'});
  phase='operation';let result;
  if(request.method==='GET')result=await bounded(read(scope,signal),signal);
  else if(request.method==='POST')result=await bounded(create({...scope,homeID:value.homeID,recipientID:value.recipientID},signal),signal);
  else result=await bounded(decide({...scope,accept:value.accept},signal),signal);
  signal.throwIfAborted();
  if(request.method==='GET'&&result===null)return response(404,{error:'Handoff unavailable'});
  result=checkedStatus(result,scope.requestID,request.method==='POST'?value.homeID:null);
  if(request.method==='PUT'&&result.state!==(value.accept?'completed':'cancelled'))throw Error('Unconfirmed decision');
  return response(200,result);
 }catch(error){
  if(signal.aborted)return response(503,{error:'Handoff result unconfirmed'});
  if(phase==='input')return response(400,{error:'Invalid handoff'});
  if(phase==='identity'&&error instanceof HomeHandoffAdditionalVerificationRequired)return response(403,{error:'Additional verification required',code:'additional_verification_required'});
  if(phase==='operation'&&error instanceof HomeHandoffRefusal&&error.reason==='attachment_handoff_required')return response(409,{error:'Attachment handoff required',code:'attachment_handoff_required'});
  return response(503,{error:'Handoff result unconfirmed'});
 }
}
