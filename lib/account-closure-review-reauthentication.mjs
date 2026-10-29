import {createHash} from 'node:crypto';
export const CLOSURE_REAUTHENTICATION_STATE_SQL=`select jsonb_build_object(
 'userID',u.id,'email',u.email,'password',u.encrypted_password,
 'bannedUntil',to_jsonb(u)->'banned_until','deletedAt',to_jsonb(u)->'deleted_at',
 'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=u.id),'[]'::jsonb)
) as reauthentication_state from auth.users u where u.id=$1::uuid`;
const id=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function digest(value,identity){
 if(!value||Object.keys(value).sort().join(',')!=='bannedUntil,deletedAt,email,factors,password,userID'||value.userID!==identity.userID||value.email!==identity.email||typeof value.password!=='string'||!value.password||!Array.isArray(value.factors))throw Error('Current reauthentication state required');
 return createHash('sha256').update('OuchiMaintenance/closure-reauthentication/v1\n'+JSON.stringify(canonical(value))).digest('hex');
}
async function bounded(work,signal){
 signal.throwIfAborted();let stop;
 const aborted=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{const value=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return work();}),aborted]);signal.throwIfAborted();return value;}
 finally{signal.removeEventListener('abort',stop);}
}
/** One HTTP request only. identity comes from exact-bearer Auth verification.
 * readAuthState owns a bounded backend SQL read; authenticate owns temporary
 * password authentication AND logout cleanup before resolving. Never run that
 * authentication under Auth row pins. Only a private digest survives the read;
 * no password, password hash, factor secret or proof is returned or persisted.
 */
export function createAccountClosureReviewReauthentication({identity,readAuthState,authenticate,clock=()=>performance.now(),lifetimeMS=15000}){
 const fixed=Object.freeze({userID:identity?.userID,sessionID:identity?.sessionID,epochID:identity?.epochID,email:identity?.email});
 if(![fixed.userID,fixed.sessionID,fixed.epochID].every(id)||typeof fixed.email!=='string'||!fixed.email||fixed.email.length>320||typeof readAuthState!=='function'||typeof authenticate!=='function'||typeof clock!=='function'||!Number.isInteger(lifetimeMS)||lifetimeMS<1||lifetimeMS>60000)throw Error('Request-scoped reauthentication providers required');
 let started=false,proof=null,submission=null;
 const current=signal=>{const now=clock();return !!proof&&!proof.signal.aborted&&signal instanceof AbortSignal&&!signal.aborted&&Number.isFinite(now)&&now>=proof.startedAt&&now<proof.startedAt+lifetimeMS;};
 return Object.freeze({
  reauthenticate:async(email,password,callerSignal)=>{
   if(started||email!==fixed.email||typeof password!=='string'||!password||password.length>1024||!(callerSignal instanceof AbortSignal))return null;
   started=true;proof=null;
   const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(lifetimeMS)]),startedAt=clock();
   if(!Number.isFinite(startedAt))return null;
   const before=digest(await bounded(()=>readAuthState(fixed.userID,signal),signal),fixed);
   const user=await bounded(()=>authenticate(email,password,signal),signal);
   if(user!==fixed.userID)return null;
   const after=digest(await bounded(()=>readAuthState(fixed.userID,signal),signal),fixed);
   if(before!==after)return null;
   proof=Object.freeze({digest:after,startedAt,signal});
   if(!current(signal)){proof=null;return null;}
   return fixed.userID;
  },
  verify:async(scope,tx)=>{
   const bound=Object.freeze({userID:scope?.userID,sessionID:scope?.sessionID,epochID:scope?.epochID,submissionID:scope?.submissionID});
   if(!current(tx?.signal)||typeof tx?.query!=='function'||!id(scope?.submissionID)||['userID','sessionID','epochID'].some(key=>scope[key]!==fixed[key]))return false;
   if(submission!==null&&scope.submissionID!==submission)return false;
   const result=await bounded(()=>tx.query(CLOSURE_REAUTHENTICATION_STATE_SQL,[fixed.userID]),tx.signal);
   if(result.rows.length!==1||!current(tx.signal)||Object.keys(bound).some(key=>scope[key]!==bound[key]))return false;
   if(digest(result.rows[0].reauthentication_state,fixed)!==proof.digest)return false;
   submission=bound.submissionID;
   return current(tx.signal);
  },
 });
}
