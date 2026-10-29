// Prepared server handler only: no production route is registered.
// Trusted providers own real Auth/session checks and temporary reauth cleanup.
// A review receipt is neither a deletion job nor a claim of completed erasure.
const id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function identity(value){
 if(!value||![value.userID,value.sessionID,value.epochID].every(id)||typeof value.email!=='string'||!value.email||value.email.length>320)throw Error('Verified identity required');
 return Object.freeze({userID:value.userID,sessionID:value.sessionID,epochID:value.epochID,email:value.email});
}
async function bounded(operation,signal){
 signal.throwIfAborted();let stop;
 const abort=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{signal.throwIfAborted();const value=await Promise.race([operation(),abort]);signal.throwIfAborted();return value;}
 finally{signal.removeEventListener('abort',stop);}
}
async function readBody(request,signal,action){
 const reader=request.body?.getReader();if(!reader)throw Error('Body required');
 let bytes=0;const chunks=[];
 const abort=()=>{void reader.cancel().catch(()=>{});};
 signal.addEventListener('abort',abort,{once:true});
 try{
  while(true){const next=await bounded(()=>reader.read(),signal);if(next.done)break;bytes+=next.value.byteLength;if(bytes>4096)throw Error('Body too large');chunks.push(next.value);}
  const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  const expected=action==='request'?'confirmation,expectedEpochID,password,submissionID':action==='cancel'?'confirmation,expectedEpochID,submissionID':'expectedEpochID,submissionID';
  if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==expected||!id(value.expectedEpochID)||!id(value.submissionID))throw Error('Invalid body');
  if(action!=='read'&&value.confirmation!==(action==='request'?'REQUEST_OUCHI_ACCOUNT_DELETION':'CANCEL_OUCHI_DELETION_REVIEW'))throw Error('Explicit confirmation required');
  if(action==='request'&&(typeof value.password!=='string'||value.password.length<1||value.password.length>1024))throw Error('Reauthentication required');
  return Object.freeze({...value});
 }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});}
}
function validateReceipt(value,scope){
 if(!value||Object.keys(value).sort().join(',')!=='epochID,kind,reviewRequestID,state,submissionID'
 ||value.kind!=='app-closure-review/v2'||!['review_required','cancelled'].includes(value.state)
 ||!id(value.reviewRequestID)||value.epochID!==scope.epochID||value.submissionID!==scope.submissionID)throw Error('Unconfirmed review');
 return value;
}
export function createAccountClosureReviewHandler({verify,reauthenticate,port,timeoutMS=10000}){
 if(typeof verify!=='function'||typeof reauthenticate!=='function'||!['request','read','cancel'].every(key=>typeof port?.[key]==='function')||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>20000)throw Error('Trusted bounded providers required');
 return async function handle(request,action){
  const reply=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(!['request','read','cancel'].includes(action)||request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(new URL(request.url).search||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))return reply({error:'Invalid request'},400);
  const auth=request.headers.get('authorization');
  if(!auth||auth.length>16384||!/^Bearer [^\s]+$/.test(auth))return reply({error:'Authentication required'},401);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(timeoutMS)]);
  let body;try{body=await readBody(request,signal,action);}catch{return reply({error:'Explicit review information required'},400);}
  try{
   const initial=await bounded(()=>verify(auth.slice(7),signal),signal);
   if(initial===null)return reply({error:'Authentication required'},401);
   const first=identity(initial);
   if(first.epochID!==body.expectedEpochID)return reply({error:'Registration changed; review before retrying'},409);
   if(action==='request'){
    // Provider must clean up its temporary session before resolving, also on abort.
    const user=await bounded(()=>reauthenticate(first.email,body.password,signal),signal);
    if(user!==first.userID)return reply({error:'Reauthentication required'},403);
   }
   // Recheck the original bearer, not a new reauth session, before any mutation.
   const refreshed=await bounded(()=>verify(auth.slice(7),signal),signal);
   if(refreshed===null)return reply({error:'Authentication required'},401);
   const current=identity(refreshed);
   if(Object.keys(first).some(key=>first[key]!==current[key]))return reply({error:'Identity changed; review original status'},409);
   const scope=Object.freeze({userID:first.userID,sessionID:first.sessionID,epochID:first.epochID,submissionID:body.submissionID});
   const receipt=await bounded(()=>port[action](scope,signal),signal);
   if(receipt===null&&action!=='request')return reply({kind:'app-closure-review/v2',state:'review_not_found',epochID:scope.epochID,submissionID:scope.submissionID},404);
   return reply(validateReceipt(receipt,scope),action==='request'?202:200);
  }catch{return reply({error:'Review result unconfirmed; read the same submission before retrying'},503);}
 };
}
