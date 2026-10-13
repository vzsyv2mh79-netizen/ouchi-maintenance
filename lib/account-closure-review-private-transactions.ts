import {createAccountClosureReviewTransactions} from './account-closure-review-transactions';
import {CLOSURE_REAUTHENTICATION_STATE_SQL} from './account-closure-review-reauthentication.mjs';
import {REAUTH_REGISTER_SQL,REAUTH_OBSERVE_SQL,REAUTH_CLOSE_SQL,REAUTH_SWEEP_SQL} from './closure-reauth-producer.mjs';
import {HOME_HANDOFF_SESSION_POLICY_SQL,HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,HOME_HANDOFF_AUTH_USER_PIN_SQL,HOME_HANDOFF_AUTH_SESSION_PIN_SQL,HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,HOME_HANDOFF_ENROLLMENT_PIN_SQL} from './home-handoff-identity';
const mapped=new Map<string,{sql:string;actorIndex:number|null}>([
 [HOME_HANDOFF_SESSION_POLICY_SQL,{sql:'select * from maintenance_private.closure_review_session($1::uuid,$2::uuid,$3::bigint,$4::bigint)',actorIndex:1}],
 [HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,{sql:'select * from maintenance_private.closure_review_pin_constraints()',actorIndex:null}],
 [HOME_HANDOFF_AUTH_USER_PIN_SQL,{sql:'select * from maintenance_private.closure_review_pin_user($1::uuid)',actorIndex:0}],
 [HOME_HANDOFF_AUTH_SESSION_PIN_SQL,{sql:'select * from maintenance_private.closure_review_pin_session($1::uuid,$2::uuid)',actorIndex:1}],
 [HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,{sql:'select * from maintenance_private.closure_review_pin_factors($1::uuid)',actorIndex:0}],
 [HOME_HANDOFF_ENROLLMENT_PIN_SQL,{sql:'select * from maintenance_private.closure_review_pin_enrollment($1::uuid,$2::uuid)',actorIndex:0}],
 [CLOSURE_REAUTHENTICATION_STATE_SQL,{sql:'select * from maintenance_private.closure_review_auth_state($1::uuid)',actorIndex:0}],
 ...[REAUTH_REGISTER_SQL,REAUTH_OBSERVE_SQL,REAUTH_CLOSE_SQL,REAUTH_SWEEP_SQL].map(sql=>[sql,{sql,actorIndex:0}] as const),
 ['select pg_advisory_xact_lock(hashtext($1::text))',{sql:'select maintenance_private.closure_review_actor_lock($1::uuid)',actorIndex:0}],
 ...['request','read','cancel'].map(verb=>[`select public.${verb}_maintenance_closure_review($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt`,{sql:`select * from maintenance_private.closure_review_execute('${verb}',$1::uuid,$2::uuid,$3::uuid,$4::uuid)`,actorIndex:0}] as const),
]);
const control=new Set(['BEGIN','COMMIT','ROLLBACK',"SET LOCAL statement_timeout = '4500ms'","SET LOCAL lock_timeout = '1000ms'"]);
/** Prepared private backend transport, not client Auth or JWT verification.
 * The composed server verifies the exact bearer BEFORE issuing any scoped SQL.
 * Its verified query arguments supply this transaction-local actor context;
 * client JSON cannot set it. SQL helpers require matching auth.uid(), execute
 * only for the separate NOLOGIN backend role, and return credential/factor
 * digests rather than raw secret state. A production login and minimum grants
 * must be independently provisioned/reviewed; SET ROLE alone is not that proof.
 * No migration, credential, role membership or shipping route is activated here.
 */
export function createAccountClosureReviewPrivateTransactions({connect}:Parameters<typeof createAccountClosureReviewTransactions>[0]){
 if(typeof connect!=='function')throw Error('Dedicated private review connection required');
 return createAccountClosureReviewTransactions({connect:async options=>{
  const raw=await connect(options);let actor:string|null=null;
  if(!raw||typeof raw.query!=='function'||typeof raw.abort!=='function'||typeof raw.close!=='function')return raw;
  return {abort:()=>raw.abort(),close:()=>raw.close(),query:async(sql:string,args?:unknown[])=>{
   if(control.has(sql)){
    const result=await raw.query(sql,args);
    if(sql==='BEGIN')await raw.query('SET LOCAL ROLE ouchi_closure_review_executor');
    return result;
   }
   const target=mapped.get(sql);if(!target||!Array.isArray(args))throw Error('Unsupported private review SQL');
   const current=target.actorIndex===null?actor:args[target.actorIndex];
   if(typeof current!=='string'||!current||(actor!==null&&actor!==current))throw Error('Bound private review actor required');
   if(actor===null){actor=current;await raw.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor})]);}
   return raw.query(target.sql,[...args]);
  }};
 }});
}
