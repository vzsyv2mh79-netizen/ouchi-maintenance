import {
 createHomeHandoffIdentityVerifier, HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,
 HOME_HANDOFF_AUTH_USER_PIN_SQL, HOME_HANDOFF_AUTH_SESSION_PIN_SQL,
 HOME_HANDOFF_AUTH_FACTOR_PIN_SQL, HOME_HANDOFF_ENROLLMENT_PIN_SQL,
} from './home-handoff-identity';
import {runWithTransactionCommitChecks} from './transaction-commit-checks.mjs';

type Scope={userID:string;sessionID:string;epochID:string;submissionID:string};
type Transaction={query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
type Transactions={run:<T>(signal:AbortSignal,work:(tx:Transaction)=>Promise<T>)=>Promise<T>};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const operations=Object.freeze({request:'request_maintenance_closure_review',read:'read_maintenance_closure_review',cancel:'cancel_maintenance_closure_review'});

/** Request-scoped backend adapter; never accept a bearer or identity from JSON.
 * The handler must finish temporary password reauthentication BEFORE invoking
 * this port: Auth creates sessions and cannot run under the user row lock.
 * transactions.run owns BEGIN/COMMIT/ROLLBACK on one dedicated connection,
 * cancels SQL on signal/deadline, and never retries an uncertain COMMIT.
 * No route, connection, migration, grants or erasure is enabled here.
 */
export function createAccountClosureReviewTransactionPort({bearer,identityOptions,transactions,verifyReauthentication,timeoutMS=10000}:{bearer:string;identityOptions:Parameters<typeof createHomeHandoffIdentityVerifier>[0];transactions:Transactions;verifyReauthentication?:(scope:Scope,tx:Transaction&{signal:AbortSignal})=>Promise<boolean>;timeoutMS?:number}) {
 if(typeof bearer!=='string'||!bearer||bearer.length>16384||/\s/.test(bearer)||typeof transactions?.run!=='function'||!Number.isInteger(timeoutMS)||timeoutMS<1||timeoutMS>20000)throw Error('Request-scoped bounded review provider required');
 const verify=createHomeHandoffIdentityVerifier(identityOptions);
 async function invoke(action:keyof typeof operations,scope:Scope,callerSignal:AbortSignal){
  const fixed=Object.freeze({userID:scope?.userID,sessionID:scope?.sessionID,epochID:scope?.epochID,submissionID:scope?.submissionID});
  if(!(callerSignal instanceof AbortSignal)||!Object.values(fixed).every(id))throw Error('Verified review scope required');
  const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(timeoutMS)]);
  const unchanged=()=>Object.keys(fixed).every(key=>scope[key as keyof Scope]===fixed[key as keyof Scope]);
  signal.throwIfAborted();
  if(action==='request'&&typeof verifyReauthentication!=='function')throw Error('Bound reauthentication required for review intake');
  const result=await transactions.run(signal,raw=>runWithTransactionCommitChecks(raw,signal,async tx=>{
   const current=async()=>{
    if(!unchanged())return false;
    const value=await verify(bearer,tx);
    return !!value&&value.userID===fixed.userID&&value.sessionID===fixed.sessionID&&value.epochID===fixed.epochID&&unchanged();
   };
   if(!await current())throw Error('Current review identity required');
   // Same order as review SQL and other participant writers; hold to COMMIT.
   await tx.query('select pg_advisory_xact_lock(hashtext($1::text))',[fixed.userID]);
   const constraints=await tx.query(HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,[]);
   if(constraints.rows.length!==1||constraints.rows[0].supported!==true)throw Error('Current Auth pin constraints unavailable');
   const user=await tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[fixed.userID]);
   if(user.rows.length!==1||user.rows[0].id!==fixed.userID)throw Error('Current review user required');
   const session=await tx.query(HOME_HANDOFF_AUTH_SESSION_PIN_SQL,[fixed.sessionID,fixed.userID]);
   if(session.rows.length!==1||session.rows[0].id!==fixed.sessionID)throw Error('Current review session required');
   await tx.query(HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,[fixed.userID]);
   const enrollment=await tx.query(HOME_HANDOFF_ENROLLMENT_PIN_SQL,[fixed.userID,fixed.sessionID]);
   if(enrollment.rows.length!==1||enrollment.rows[0].epoch_id!==fixed.epochID||!await current())throw Error('Current review registration required');
   tx.beforeCommit('closure-review:original-identity',current);
   if(action==='request'){
    const fresh=()=>verifyReauthentication!(fixed,tx);
    if(await fresh()!==true)throw Error('Current bound reauthentication required');
    tx.beforeCommit('closure-review:reauthentication',fresh);
   }
   const reply=await tx.query(`select public.${operations[action]}($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt`,[fixed.userID,fixed.sessionID,fixed.epochID,fixed.submissionID]);
   if(reply.rows.length!==1)throw Error('Review result unconfirmed');
   const value=reply.rows[0].receipt;
   if(value===null&&action!=='request')return null;
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Review result unconfirmed');
   const receipt=value as Record<string,unknown>;
   if(Object.keys(receipt).sort().join(',')!=='epochID,kind,reviewRequestID,state,submissionID'||receipt.kind!=='app-closure-review/v2'||!['review_required','cancelled'].includes(String(receipt.state))||receipt.epochID!==fixed.epochID||receipt.submissionID!==fixed.submissionID||!id(receipt.reviewRequestID))throw Error('Review result unconfirmed');
   return Object.freeze({...receipt});
  }));
  signal.throwIfAborted();if(!unchanged())throw Error('Review scope changed; read original status');
  return result;
 }
 return Object.freeze({request:(scope:Scope,signal:AbortSignal)=>invoke('request',scope,signal),read:(scope:Scope,signal:AbortSignal)=>invoke('read',scope,signal),cancel:(scope:Scope,signal:AbortSignal)=>invoke('cancel',scope,signal)});
}
