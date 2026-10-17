import {sessionAfterAuthVerification} from './verified-app-session';
import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
type AuthResult={data:{user:{id:string}|null};error:unknown};
type Connection={query:(sql:string,args?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;abort:()=>void;close:()=>Promise<void>};
type Options={enabled?:boolean;getUser:(bearer:string,signal:AbortSignal)=>Promise<AuthResult>;connect:(options:{signal:AbortSignal})=>Promise<Connection>};
async function bounded<T>(operation:()=>Promise<T>,signal:AbortSignal){
 signal.throwIfAborted();let stop:()=>void=()=>{};const abort=new Promise<never>((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([Promise.resolve().then(operation),abort]);}finally{signal.removeEventListener('abort',stop);}
}
async function body(request:Request,signal:AbortSignal){
 const reader=request.body?.getReader();if(!reader)throw Error('Body required');const chunks:Uint8Array[]=[];let size=0;
 const stop=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',stop,{once:true});
 try{for(;;){signal.throwIfAborted();const next=await reader.read();signal.throwIfAborted();if(next.done)break;size+=next.value.byteLength;if(size>4096)throw Error('Body too large');chunks.push(next.value);}}
 finally{signal.removeEventListener('abort',stop);stop();reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!v||Array.isArray(v)||Object.keys(v).sort().join(',')!=='expectedEpochID,submissionID'||!uuid(v.expectedEpochID)||!uuid(v.submissionID))throw Error('Exact saved submission required');return Object.freeze({epochID:v.expectedEpochID as string,submissionID:v.submissionID as string});
}
/** Read-only disabled-by-default status endpoint. Auth identity comes from a
 * fresh getUser for the exact bearer, never JSON/user_metadata. The minimum SQL
 * role has no raw Auth/table access, mutation, receipt issuance or epoch opening.
 */
export function createClosureSubmissionProgressServer({enabled=false,getUser,connect}:Options){
 if(typeof enabled!=='boolean'||typeof getUser!=='function')throw Error('Explicit progress providers required');const transaction=createReceiptTransactions({connect});
 return async(request:Request)=>{
  const reply=(value:object,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(!enabled)return reply({error:'Progress is not available'},503);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(new URL(request.url).search||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))return reply({error:'Invalid request'},400);
  const authorization=request.headers.get('authorization');if(!authorization||authorization.length>16384||!/^Bearer [^\s,]+$/.test(authorization))return reply({error:'Authentication required'},401);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10000)]);let saved;
  try{saved=await body(request,signal);}catch{return reply({error:'Saved submission required'},400);}
  try{
   signal.throwIfAborted();const token=authorization.slice(7),verified=await bounded(()=>getUser(token,signal),signal);signal.throwIfAborted();
   if(verified.error||!verified.data.user)return reply({error:'Authentication required'},401);
   const identity=sessionAfterAuthVerification(token,verified.data.user.id);if(!identity)return reply({error:'Authentication required'},401);
   const result=await transaction(async tx=>{
    await tx.query('SET LOCAL ROLE ouchi_closure_progress_reader');
    await tx.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:identity.userID}),identity.userID]);
    const result=await tx.query('select maintenance_private.read_closure_submission_progress($1::uuid,$2::uuid,$3::uuid,$4::uuid) receipt',[identity.userID,identity.sessionID,saved.epochID,saved.submissionID]);
    if(result.rows.length!==1)throw Error('Progress unconfirmed');return result.rows[0].receipt;
   },{signal,readOnly:false});
   if(result===null)return reply({kind:'app-closure-progress/v1',state:'progress_unavailable',epochID:saved.epochID,submissionID:saved.submissionID},404);
   if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Progress unconfirmed');const r=result as Record<string,unknown>;
   if(Object.keys(r).sort().join(',')!=='epochID,kind,requestID,state,submissionID'||r.kind!=='app-closure-progress/v1'||!uuid(r.requestID)||r.epochID!==saved.epochID||r.submissionID!==saved.submissionID||!['pending','running','complete','failed'].includes(String(r.state)))throw Error('Progress scope unconfirmed');
   return reply(r,200);
  }catch{return reply({error:'Progress unconfirmed; keep the saved submission'},503);}
 };
}
