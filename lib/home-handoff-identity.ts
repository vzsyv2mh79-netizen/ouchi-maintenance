import {sessionAfterAuthVerification} from './verified-app-session';
import {HomeHandoffAdditionalVerificationRequired} from './home-handoff-handler.mjs';

// Prepared same-transaction identity check. This does not create a connection,
// grant Auth access, enable a route, or authorize ownership changes on its own.
type Policy={projectID:string;singleSession:boolean;timeboxSeconds:number|null;inactivitySeconds:number|null;allowLowAALSeconds:number|null;totpVerify:boolean;phoneVerify:boolean;webAuthnVerify:boolean};
type Reader=((signal:AbortSignal)=>Promise<Policy|null>) & {isCurrent:(policy:Policy)=>boolean};
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
type AuthResult={data:{user:{id:string}|null};error:unknown};
export const HOME_HANDOFF_SESSION_POLICY_SQL=`select
 extract(epoch from clock_timestamp()) * 1000 as verified_at,
 public.read_maintenance_explicit_enrollment($2::uuid,$1::uuid) as epoch_id,
 s.aal::text as session_aal,
 exists(select 1 from auth.mfa_factors f where f.user_id=s.user_id and f.status::text='verified') as has_verified_factor,
 (s.not_after is null or s.not_after>clock_timestamp())
 and s.created_at<=clock_timestamp()
 and (s.refreshed_at is null or (s.refreshed_at at time zone 'UTC')<=clock_timestamp())
 and ($3::bigint is null or s.created_at+($3::bigint * interval '1 second')>clock_timestamp())
 and ($4::bigint is null or (s.refreshed_at is not null and s.refreshed_at at time zone 'UTC'+($4::bigint * interval '1 second')>clock_timestamp())) as session_current
 from auth.sessions s where s.id=$1::uuid and s.user_id=$2::uuid`;

/** getUser verifies the exact original bearer on Auth, not a cached identity.
 * tx is the caller's dedicated transaction; query must honor tx.signal and SQL
 * deadlines. The shipping caller must pin/lock session/factor state and repeat
 * checks before commit. No independent RPC/transaction is accepted here.
 * Single-session mode and inactivity with no refreshed_at are not yet supported.
 */
export function createHomeHandoffIdentityVerifier({getUser,policyReader,projectID}:{getUser:(token:string,signal:AbortSignal)=>Promise<AuthResult>;policyReader:Reader;projectID:string}) {
 if(typeof getUser!=='function'||typeof policyReader!=='function'||typeof policyReader.isCurrent!=='function'||!/^[a-z]{20}$/.test(projectID))throw Error('Current handoff identity provider required');
 return async(bearer:string,tx:Transaction) => {
  if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function')throw Error('Pinned transaction required');
  const signal=tx.signal;signal.throwIfAborted();
  const policy=await policyReader(signal);signal.throwIfAborted();
  if(!policy||policy.projectID!==projectID||!policyReader.isCurrent(policy)||policy.singleSession!==false)throw Error('Current Auth policy unavailable');
  const authenticated=await getUser(bearer,signal);signal.throwIfAborted();
  if(!policyReader.isCurrent(policy))throw Error('Current Auth policy expired');
  if(authenticated.error||!authenticated.data.user)return null;
  const identity=sessionAfterAuthVerification(bearer,authenticated.data.user.id);if(!identity)return null;
  // Only decode AFTER exact-bearer Auth verification. Metadata never supplies AAL.
  const claims=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString('utf8')) as {aal?:unknown};
  const aal=claims.aal===undefined?'aal1':claims.aal;
  if(aal!=='aal1'&&aal!=='aal2')return null;
  const result=await tx.query(HOME_HANDOFF_SESSION_POLICY_SQL,[identity.sessionID,identity.userID,policy.timeboxSeconds,policy.inactivitySeconds]);
  signal.throwIfAborted();
  if(!policyReader.isCurrent(policy))throw Error('Current Auth policy expired');
  if(result.rows.length!==1)return null;
  const row=result.rows[0],now=Number(row.verified_at);
  if(!Number.isFinite(now)||!sessionAfterAuthVerification(bearer,identity.userID,new Date(now))||row.session_current!==true||typeof row.has_verified_factor!=='boolean'||!['aal1','aal2'].includes(String(row.session_aal)))return null;
  // Session AAL2 cannot silently upgrade an older stolen AAL1 bearer. Likewise
  // a downgraded session cannot continue using a stale AAL2 JWT.
  if(row.has_verified_factor && (aal!=='aal2'||row.session_aal!=='aal2'))throw new HomeHandoffAdditionalVerificationRequired();
  if(aal!==row.session_aal)return null;
  if(typeof row.epoch_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.epoch_id)||row.epoch_id==='00000000-0000-0000-0000-000000000000')return null;
  return Object.freeze({...identity,epochID:row.epoch_id});
 };
}
