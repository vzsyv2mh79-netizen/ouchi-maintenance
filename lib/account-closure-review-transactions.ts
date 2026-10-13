import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
import {CLOSURE_REAUTHENTICATION_STATE_SQL} from './account-closure-review-reauthentication.mjs';
import {REAUTH_REGISTER_SQL,REAUTH_OBSERVE_SQL,REAUTH_CLOSE_SQL,REAUTH_SWEEP_SQL} from './closure-reauth-producer.mjs';
import {HOME_HANDOFF_SESSION_POLICY_SQL,HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,HOME_HANDOFF_AUTH_USER_PIN_SQL,HOME_HANDOFF_AUTH_SESSION_PIN_SQL,HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,HOME_HANDOFF_ENROLLMENT_PIN_SQL} from './home-handoff-identity';
const id=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const ids=(count:number)=>(args:unknown[])=>args.length===count&&args.every(id);
const allowed=new Map<string,(args:unknown[])=>boolean>([
 [HOME_HANDOFF_SESSION_POLICY_SQL,args=>args.length===4&&args.slice(0,2).every(id)&&args.slice(2).every(value=>value===null||(Number.isSafeInteger(value)&&Number(value)>=0))],
 [HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,ids(0)],
 [HOME_HANDOFF_AUTH_USER_PIN_SQL,ids(1)],
 [HOME_HANDOFF_AUTH_SESSION_PIN_SQL,ids(2)],
 [HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,ids(1)],
 [HOME_HANDOFF_ENROLLMENT_PIN_SQL,ids(2)],
 [CLOSURE_REAUTHENTICATION_STATE_SQL,ids(1)],
 [REAUTH_REGISTER_SQL,ids(4)],[REAUTH_OBSERVE_SQL,ids(4)],[REAUTH_CLOSE_SQL,ids(4)],[REAUTH_SWEEP_SQL,ids(2)],
 ['select pg_advisory_xact_lock(hashtext($1::text))',ids(1)],
 ...['request','read','cancel'].map(verb=>[`select public.${verb}_maintenance_closure_review($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt`,ids(4)] as const),
]);

/** Dedicated request transport only. This SQL allowlist is defense in depth,
 * not database least privilege or Auth authorization: the server/verifier still
 * owns verified scope and the connection must use separately approved grants.
 * No credentials, pool, role/grant, route or production flag is created here.
 * connect bounds acquisition; abort interrupts its socket; close is bounded.
 * Existing transaction adapter owns deadlines, rollback and lost-COMMIT refusal.
 */
export function createAccountClosureReviewTransactions(options:Parameters<typeof createReceiptTransactions>[0]){
 const transaction=createReceiptTransactions(options);
 return Object.freeze({run:<T>(signal:AbortSignal,callback:(tx:{query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>})=>Promise<T>)=>transaction(async tx=>{
  let active=true;
  try{return await callback(Object.freeze({query:async(sql:string,args:unknown[])=>{
   if(!active)throw Error('Review transaction callback closed');
   const check=allowed.get(sql);
   if(!Array.isArray(args)||!check||!check(args))throw Error('Unsupported review SQL or scope');
   // Capture parameters before yielding; caller mutation cannot redirect SQL.
   return tx.query(sql,[...args]);
  }}));}finally{active=false;}
 },{signal,readOnly:false})});
}
