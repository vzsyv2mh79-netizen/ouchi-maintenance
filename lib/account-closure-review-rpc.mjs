// Prepared backend port only. Caller must verify real Auth and explicit recent
// reauthentication before request; IDs never come from client JSON/flags.
// This records review intake, not a deletion job, handoff consent or erasure.
const id=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function receipt(value,epoch){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='epochID,kind,reviewRequestID,state'
 ||value.kind!=='app-closure-review/v1'||value.state!=='review_required'||value.epochID!==epoch||!id(value.reviewRequestID))throw Error('Review intake unconfirmed');
 return Object.freeze({...value});
}
export function createAccountClosureReviewRPC({client,timeoutMS=10000}){
 if(typeof client?.rpc!=='function'||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>20000)throw Error('Private review provider required');
 async function invoke(name,scope,callerSignal,nullable){
  const fixed=Object.freeze({userID:scope?.userID,sessionID:scope?.sessionID,epochID:scope?.epochID});
  if(!(callerSignal instanceof AbortSignal)||!Object.values(fixed).every(id))throw Error('Verified review scope required');
  const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(timeoutMS)]);
  signal.throwIfAborted();
  const query=client.rpc(name,{target_user:fixed.userID,verified_session:fixed.sessionID,expected_epoch:fixed.epochID});
  if(typeof query?.abortSignal!=='function'||typeof query?.retry!=='function')throw Error('Bounded review transport required');
  let stop;
  const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
  let result;
  try{signal.throwIfAborted();result=await Promise.race([query.retry(false).abortSignal(signal),cancelled]);}
  finally{signal.removeEventListener('abort',stop);}
  signal.throwIfAborted();
  if(Object.keys(fixed).some(key=>scope[key]!==fixed[key]))throw Error('Review identity changed; read original status');
  if(result.error)throw Error('Review intake unconfirmed');
  if(nullable&&result.data===null)return null;
  return receipt(result.data,fixed.epochID);
 }
 return Object.freeze({request:(scope,signal)=>invoke('request_maintenance_closure_review',scope,signal,false),read:(scope,signal)=>invoke('read_maintenance_closure_review',scope,signal,true)});
}
