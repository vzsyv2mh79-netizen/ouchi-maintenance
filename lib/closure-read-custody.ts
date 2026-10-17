import 'server-only';
import {createHash} from 'node:crypto';
import {sessionAfterAuthVerification} from './verified-app-session';
import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
type Connection={query:(sql:string,args?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;abort:()=>void;close:()=>Promise<void>};
export type ClosureReadAction='describe'|'register'|'status';
type Options={enabled?:boolean;action:ClosureReadAction;getUser?:(bearer:string,signal:AbortSignal)=>Promise<{data:{user:{id:string}|null};error:unknown}>;connect:(options:{signal:AbortSignal})=>Promise<Connection>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
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
 const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Exact receipt scope required');return v as Record<string,unknown>;
}
/** Dormant Ouchi-only transport. No shared-account journal, Auth deletion,
 * receipt auto-renewal, deployment/secret discovery or local erasure. The
 * client must durably save its random credential before explicit registration.
 * A server-anchored deadline is an upper bound; canonical job pruning or
 * completion-proof expiry can make status unavailable earlier.
 */
export function createClosureReadCustodyServer({enabled=false,action,getUser,connect}:Options){
 if(typeof enabled!=='boolean'||!['describe','register','status'].includes(action)||(action!=='status'&&typeof getUser!=='function'))throw Error('Explicit scoped receipt providers required');
 const transaction=createReceiptTransactions({connect});
 return async(request:Request)=>{
  const reply=(value:object,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
  if(!enabled)return reply({error:'Read custody unavailable'},503);
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const origin=request.headers.get('origin');
  if(origin!==null&&origin!=='https://ouchi-maintenance.vercel.app')return reply({error:'Origin refused'},403);
  if(new URL(request.url).search||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))return reply({error:'Exact JSON required'},400);
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10000)]);let saved:Record<string,unknown>;
  try{
   saved=Object.freeze({...await body(request,signal)});
   const keys=['expectedEpochID','submissionID','requestID',...(action==='describe'?[]:['credentialID']),...(action==='register'?['expiresAt']:[])].sort().join(',');
   if(Object.keys(saved).sort().join(',')!==keys||!uuid(saved.expectedEpochID)||!uuid(saved.submissionID)||!uuid(saved.requestID)
    ||(action!=='describe'&&!uuid(saved.credentialID))||(action==='register'&&!date(saved.expiresAt)))throw Error('Exact saved scope required');
  }catch{return reply({error:'Saved read scope required'},400);}
  const raw=request.headers.get('x-ouchi-closure-read');let tokenHash:string|undefined;
  if(action==='describe'){if(raw!==null)return reply({error:'Unexpected credential'},400);}
  else{
   if(!raw||!/^[A-Za-z0-9_-]{43}$/.test(raw)||Buffer.from(raw,'base64url').length!==32||Buffer.from(raw,'base64url').toString('base64url')!==raw)return reply({error:'Saved read credential required'},401);
   tokenHash=createHash('sha256').update('Ouchi/closure-read/v1\n'+raw).digest('hex');
  }
  const authorization=request.headers.get('authorization');
  if(action==='status'&&authorization!==null)return reply({error:'Use saved read credential only'},400);
  if(action!=='status'&&(!authorization||authorization.length>16384||!/^Bearer [^\s,]+$/.test(authorization)))return reply({error:'Authentication required'},401);
  try{
   let identity:{userID:string;sessionID:string}|null=null;
   if(action!=='status'){
    const bearer=authorization!.slice(7),verified=await bounded(()=>getUser!(bearer,signal),signal);signal.throwIfAborted();
    if(verified.error||!verified.data.user)return reply({error:'Authentication required'},401);
    identity=sessionAfterAuthVerification(bearer,verified.data.user.id);if(!identity)return reply({error:'Authentication required'},401);
   }
   const result=await transaction(async tx=>{
    await tx.query(action==='status'?'SET LOCAL ROLE ouchi_closure_receipt_reader':'SET LOCAL ROLE ouchi_closure_receipt_registrar');
    if(identity)await tx.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:identity.userID}),identity.userID]);
    const base=[saved.expectedEpochID,saved.submissionID,saved.requestID];
    const r=action==='describe'?await tx.query('select maintenance_private.read_closure_read_window($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) receipt',[identity!.userID,identity!.sessionID,...base])
     :action==='register'?await tx.query('select maintenance_private.register_closure_read_credential($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::timestamptz) receipt',[identity!.userID,identity!.sessionID,...base,saved.credentialID,tokenHash,saved.expiresAt])
      :await tx.query('select maintenance_private.read_closure_credential_progress($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) receipt',[...base,saved.credentialID,tokenHash]);
    if(r.rows.length!==1)throw Error('Unconfirmed receipt');return r.rows[0].receipt;
   },{signal,readOnly:false});
   signal.throwIfAborted();
   const common={requestID:saved.requestID,epochID:saved.expectedEpochID,submissionID:saved.submissionID,...(action==='describe'?{}:{credentialID:saved.credentialID})};
   if(result===null)return reply({kind:'app-closure-read-unavailable/v1',...common,state:'unavailable'},404);
   if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Invalid receipt');const r=result as Record<string,unknown>;
   const keys=['kind',...Object.keys(common),...(action==='status'?['state']:['expiresAt']),...(action==='register'?['registered']:[])].sort().join(',');
   const kind=action==='describe'?'app-closure-read-window/v1':action==='register'?'app-closure-read-registration/v1':'app-closure-read-status/v1';
   if(Object.keys(r).sort().join(',')!==keys||r.kind!==kind||Object.entries(common).some(([k,v])=>r[k]!==v))throw Error('Receipt scope mismatch');
   if(action==='status'){if(!['pending','running','failed','complete'].includes(String(r.state)))throw Error('Invalid progress');}
   else if(!date(r.expiresAt)||Date.parse(r.expiresAt)<=Date.now()||Date.parse(r.expiresAt)>Date.now()+30*86400000)throw Error('Invalid anchored deadline');
   if(action==='register'&&(r.registered!==true||r.expiresAt!==saved.expiresAt))throw Error('Registration not confirmed');
   return reply(r,200);
  }catch{return reply({error:'Read custody unconfirmed; retain saved credential'},503);}
 };
}
