/** Request preparation only; production routing remains disabled until erasure works. */
type Identity={userID:string;sessionID:string;email:string;epochID:string};
/** Only the trusted enqueue adapter may report this verified refusal. */
export class DeletionFamilyHandoffRequiredError extends Error {}
export class DeletionFamilyReviewRequiredError extends Error {}
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
  if(!parsed||Array.isArray(parsed)||Object.keys(parsed).sort().join(',')!=='confirmation,expectedEpochID,password'||parsed.confirmation!=='DELETE_OUCHI_ACCOUNT'||!uuid(parsed.expectedEpochID)||typeof parsed.password!=='string'||parsed.password.length<1||parsed.password.length>1024)throw Error('Invalid confirmation');
  return Object.freeze({password:parsed.password as string,expectedEpochID:parsed.expectedEpochID as string});
 }finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});}
}
export async function handleAccountDeletionRequest(request:Request,deps:DeletionRequestDependencies){
 const reply=(body:object,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(new URL(request.url).search)return reply({error:'Invalid request'},400);
 const header=request.headers.get('authorization');
 if(!header||header.length>16384||!/^Bearer [^\s]+$/.test(header))return reply({error:'Authentication required'},401);
 let confirmation:Readonly<{password:string;expectedEpochID:string}>;try{confirmation=await readConfirmation(request);}catch{return reply({error:'Explicit confirmation and password required'},400);}
 let enqueueAttempted=false;
 try{
  request.signal.throwIfAborted();
  const identity=await deps.verify(header.slice(7));
  request.signal.throwIfAborted();
  if(!identity||![identity.userID,identity.sessionID,identity.epochID].every(uuid)||typeof identity.email!=='string'||!identity.email||identity.email.length>320)return reply({error:'Authentication required'},401);
  const fixed=Object.freeze({...identity});
  if(fixed.epochID.toLowerCase()!==confirmation.expectedEpochID.toLowerCase())return reply({error:'Account registration changed. Review before retrying.'},409);
  const confirmed=await deps.reauthenticate(fixed.email,confirmation.password);
  if(!uuid(confirmed)||confirmed.toLowerCase()!==fixed.userID.toLowerCase())return reply({error:'Reauthentication required'},403);
  if(request.signal.aborted)return reply({error:'Request cancelled'},409);
  enqueueAttempted=true;
  const requestID=await deps.enqueue(fixed);
  // An aborted response does not undo a durable remote request. Recover its status.
  request.signal.throwIfAborted();
  if(!uuid(requestID))throw Error('Missing durable acknowledgement');
  return reply({state:'pending',requestID,epochID:fixed.epochID},202);
 }catch(error){
  if(enqueueAttempted&&!request.signal.aborted&&error instanceof DeletionFamilyReviewRequiredError)return reply({error:'Family review required',code:'family_review_required'},409);
  if(enqueueAttempted&&!request.signal.aborted&&error instanceof DeletionFamilyHandoffRequiredError)return reply({error:'Family handoff required',code:'family_handoff_required'},409);
  return reply({error:'Deletion request not confirmed. Check status before retrying.'},503);
 }
}
