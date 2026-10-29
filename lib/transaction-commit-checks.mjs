// Backend-only callback boundary. The caller owns a dedicated transaction and
// must COMMIT only after this resolves, or ROLLBACK after any rejection. This
// creates no connection, authorization, role/grant or shipping endpoint.
async function bounded(promise,signal){
 signal.throwIfAborted();let reject;
 const aborted=new Promise((_,fail)=>{reject=fail;});
 const stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});
 try{return await Promise.race([promise,aborted]);}
 finally{signal.removeEventListener('abort',stop);}
}
export async function runWithTransactionCommitChecks(raw,signal,callback){
 if(typeof raw?.query!=='function'||!(signal instanceof AbortSignal)||typeof callback!=='function')throw Error('Dedicated transaction and signal required');
 signal.throwIfAborted();let phase='working',pending=0;const checks=new Map();
 const tx=Object.freeze({signal,query:async(...args)=>{
  if(phase==='closed')throw Error('Transaction callback is closed');
  signal.throwIfAborted();pending++;
  try{const result=await raw.query(...args);signal.throwIfAborted();return result;}
  finally{pending--;}
 },beforeCommit:(key,verify)=>{
  if(phase!=='working')throw Error('Commit check registration is closed');
  if(typeof key!=='string'||!/^[A-Za-z0-9:._/-]{1,256}$/.test(key)||typeof verify!=='function')throw Error('Bound commit check required');
  // Repeated approval must not replace its first immutable verification closure.
  if(!checks.has(key)){if(checks.size>=32)throw Error('Commit check limit');checks.set(key,verify);}
 }});
 try{
  const result=await bounded(Promise.resolve().then(()=>{signal.throwIfAborted();return callback(tx);}),signal);
  if(pending!==0)throw Error('Unfinished transaction query');
  phase='checking';
  for(const verify of checks.values()){
   signal.throwIfAborted();
   if(await bounded(Promise.resolve().then(()=>verify(tx)),signal)!==true){
    const error=Error('Current transaction verification required before COMMIT');
    error.code='CURRENT_TRANSACTION_VERIFICATION_REQUIRED';throw error;
   }
   if(pending!==0)throw Error('Unfinished transaction verification query');
  }
  signal.throwIfAborted();return result;
 }finally{phase='closed';}
}
