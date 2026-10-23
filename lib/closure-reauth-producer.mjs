import {randomUUID} from 'node:crypto';
export const REAUTH_REGISTER_SQL='select maintenance_private.closure_reauth_register($1::uuid,$2::uuid,$3::uuid,$4::uuid) as registered';
export const REAUTH_OBSERVE_SQL='select maintenance_private.closure_reauth_observe($1::uuid,$2::uuid,$3::uuid,$4::uuid) as observed';
export const REAUTH_CLOSE_SQL='select maintenance_private.closure_reauth_close($1::uuid,$2::uuid,$3::uuid,$4::uuid) as removed';
export const REAUTH_SWEEP_SQL='select maintenance_private.closure_reauth_sweep($1::uuid,$2::uuid) as swept';
const id=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
async function bounded(work,signal){
 signal.throwIfAborted();let stop;
 const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{const value=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return work();}),cancelled]);signal.throwIfAborted();return value;}
 finally{signal.removeEventListener('abort',stop);}
}
/** Prepared server producer only. scope comes from exact-bearer verification.
 * clientForRequest must send the supplied agent on password grant and use an
 * independent bounded transport for local logout. No tokens/proof leave this
 * function. Durable marker cleanup, not SDK logout, fences unknown/late sessions.
 * Expired markers require a scheduled sweep; no production scheduler is enabled.
 */
export function createClosureReauthenticationProducer({transactions,clientForRequest}){
 if(typeof transactions?.run!=='function'||typeof clientForRequest!=='function')throw Error('Scoped reauthentication providers required');
 return async(email,password,callerSignal,scope)=>{
  const fixed=Object.freeze({userID:scope?.userID,sessionID:scope?.sessionID,epochID:scope?.epochID,email:scope?.email});
  if(![fixed.userID,fixed.sessionID,fixed.epochID].every(id)||email!==fixed.email||typeof password!=='string'||!password||password.length>1024||!(callerSignal instanceof AbortSignal))throw Error('Verified reauthentication scope required');
  const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(10000)]),marker=randomUUID(),args=[fixed.userID,fixed.sessionID,fixed.epochID,marker];
  const call=(sql,values,s)=>transactions.run(s,tx=>tx.query(sql,values));
  let client,authenticated=null;
  try{
   signal.throwIfAborted();await call(REAUTH_SWEEP_SQL,[fixed.userID,fixed.epochID],signal);
   const registered=await call(REAUTH_REGISTER_SQL,args,signal);if(registered.rows.length!==1||registered.rows[0].registered!==true)throw Error('Reauthentication marker unconfirmed');
   signal.throwIfAborted();client=clientForRequest({agent:'OuchiMaintenance/closure-reauth/v1/'+marker,signal});
   const {data,error}=await bounded(()=>client.auth.signInWithPassword({email,password}),signal);signal.throwIfAborted();
   if(!error&&data.user?.id===fixed.userID&&data.session){
    const observed=await call(REAUTH_OBSERVE_SQL,args,signal);
    if(observed.rows.length!==1||!Number.isInteger(observed.rows[0].observed)||observed.rows[0].observed<1)throw Error('Marked authentication session unconfirmed');
    authenticated=fixed.userID;
   }
  }finally{
   let logoutError;
   try{if(client){const {error}=await bounded(()=>client.auth.signOut({scope:'local'}),AbortSignal.timeout(5000));if(error)logoutError=Error('Temporary SDK session cleanup failed');}}
   catch{logoutError=Error('Temporary SDK session cleanup failed');}
   // Even a failed/lost registration reply is reconciled using this same marker.
   // Independent finite signal permits cleanup after the caller cancels.
   const closed=await call(REAUTH_CLOSE_SQL,args,AbortSignal.timeout(5000));
   if(closed.rows.length!==1||!Number.isInteger(closed.rows[0].removed)||closed.rows[0].removed<0)throw Error('Temporary marker cleanup unconfirmed');
   if(logoutError)throw logoutError;
  }
  signal.throwIfAborted();return authenticated;
 };
}
