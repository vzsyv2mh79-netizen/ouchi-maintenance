/** Request preparation only; production routing remains disabled until erasure works. */
type Identity={userID:string;sessionID:string;email:string;epochID:string};
export type DeletionRequestDependencies={
 verify:(bearer:string)=>Promise<Identity|null>;
 /** Must clean up the temporary reauthentication session before resolving. */
 reauthenticate:(email:string,password:string)=>Promise<string|null>;
 enqueue:(identity:Identity)=>Promise<string|null>;
};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
async function readConfirmation(request:Request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');
 let cancelled=false;
 const abort=()=>{cancelled=true;void reader.cancel().catch(()=>{});};
 const timer=setTimeout(abort,5000);request.signal.addEventListener('abort',abort,{once:true});
 let bytes=0;const parts:Uint8Array[]=[];
 try{
  if(request.signal.aborted)throw Error('Cancelled');
  while(true){const value=await reader.read();if(value.done)break;bytes+=value.value.byteLength;if(bytes>4096)throw Error('Oversized body');parts.push(value.value);}
  if(cancelled||request.signal.aborted)throw Error('Cancelled body');
  const body=new Uint8Array(bytes);let offset=0;for(const p of parts){body.set(p,offset);offset+=p.byteLength;}
  const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
  if(!parsed||Array.isArray(parsed)||Object.keys(parsed).sort().join(',')!=='confirmation,password'||parsed.confirmation!=='DELETE_OUCHI_ACCOUNT'||typeof parsed.password!=='string'||parsed.password.length<1||parsed.password.length>1024)throw Error('Invalid confirmation');
  return parsed.password as string;
 }finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});}
}
export async function handleAccountDeletionRequest(request:Request,deps:DeletionRequestDependencies){
 const reply=(body:object,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const header=request.headers.get('authorization');
 if(!header||header.length>16384||!/^Bearer [^\s]+$/.test(header))return reply({error:'Authentication required'},401);
 let password:string;try{password=await readConfirmation(request);}catch{return reply({error:'Explicit confirmation and password required'},400);}
 try{
  const identity=await deps.verify(header.slice(7));
  if(!identity||![identity.userID,identity.sessionID,identity.epochID].every(uuid)||typeof identity.email!=='string'||!identity.email||identity.email.length>320)return reply({error:'Authentication required'},401);
  const confirmed=await deps.reauthenticate(identity.email,password);
  if(!uuid(confirmed)||confirmed.toLowerCase()!==identity.userID.toLowerCase())return reply({error:'Reauthentication required'},403);
  if(request.signal.aborted)return reply({error:'Request cancelled'},409);
  const requestID=await deps.enqueue(Object.freeze({...identity}));
  if(!uuid(requestID))throw Error('Missing durable acknowledgement');
  return reply({state:'pending',requestID},202);
 }catch{return reply({error:'Deletion request not confirmed. Check status before retrying.'},503);}
}
