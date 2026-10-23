import {createHash} from 'node:crypto';
import {sessionAfterAuthVerification, type VerifiedAppSession} from './verified-app-session';
import {
 createHomeHandoffIdentityVerifier, HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,
 HOME_HANDOFF_AUTH_USER_PIN_SQL, HOME_HANDOFF_AUTH_SESSION_PIN_SQL,
 HOME_HANDOFF_AUTH_FACTOR_PIN_SQL, HOME_HANDOFF_AUTH_STATE_SQL,
} from './home-handoff-identity';

type Transaction = Parameters<ReturnType<typeof createHomeHandoffIdentityVerifier>>[1];
type Options = Parameters<typeof createHomeHandoffIdentityVerifier>[0] & {
 verifyReadAuthority: (identity: VerifiedAppSession, tx: Transaction) => Promise<boolean>;
};
export const SHARED_CONSENT_SESSION_SQL = `select
 extract(epoch from clock_timestamp()) * 1000 as checked_at,
 s.aal::text as session_aal,
 exists(select 1 from auth.mfa_factors f where f.user_id=s.user_id
  and f.status::text='verified' and f.factor_type::text='totp') as verified_totp,
 (s.not_after is null or s.not_after>clock_timestamp())
 and s.created_at<=clock_timestamp()
 and (s.refreshed_at is null or s.refreshed_at at time zone 'UTC'<=clock_timestamp())
 and ($3::bigint is null or s.created_at+($3::bigint * interval '1 second')>clock_timestamp())
 and ($4::bigint is null or (s.refreshed_at is not null and s.refreshed_at at time zone 'UTC'+($4::bigint * interval '1 second')>clock_timestamp()))
 and (to_jsonb(u)->>'deleted_at' is null)
 and (to_jsonb(u)->>'banned_until' is null or (to_jsonb(u)->>'banned_until')::timestamptz<=clock_timestamp()) as session_current
 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=$1::uuid and s.user_id=$2::uuid`;

/**
 * Current Auth identity for a private, request-authorized shared consent.
 * It grants no app access: the mandatory authority reader must bind the actor
 * to the original private request/plan on this transaction. Normal Ouchi
 * enrollment is deliberately not consulted after retirement has stopped it.
 * The owning issuer/worker must retain these locks through COMMIT and repeat
 * this reader in its final checks. No route, grant, connection or policy
 * credential is created here. Secrets in the pinned snapshot never leave it.
 */
export function createSharedConsentIdentityVerifier(options: Options) {
 createHomeHandoffIdentityVerifier(options); // Validate explicit Auth/policy configuration.
 if (typeof options.verifyReadAuthority !== 'function') throw Error('Private shared consent authority reader required');
 const {getUser,policyReader,projectID,verifyReadAuthority}=options;
 const isCurrent=policyReader.isCurrent.bind(policyReader);
 const duration = (value: unknown) => value === null || (Number.isSafeInteger(value) && Number(value)>0 && Number(value)<=315360000);
 return async (bearer: string, tx: Transaction) => {
  if (!(tx?.signal instanceof AbortSignal) || typeof tx.query !== 'function') throw Error('Pinned consent transaction required');
  const signal=tx.signal;
  const query=async(sql:string,args:unknown[]) => {
   signal.throwIfAborted(); const result=await tx.query(sql,args); signal.throwIfAborted(); return result;
  };
  const readPolicy=async() => {
   signal.throwIfAborted(); const policy=await policyReader(signal); signal.throwIfAborted();
   if (!policy || policy.projectID!==projectID || !isCurrent(policy)
    || policy.assuranceMode!=='highest-current-aal/v1' || policy.singleSession!==false
    || policy.totpVerify!==true || !duration(policy.timeboxSeconds) || !duration(policy.inactivitySeconds))
    throw Error('Current shared consent Auth policy unavailable');
   return policy;
  };
  const firstPolicy=await readPolicy();
  const authenticate=async() => {
   signal.throwIfAborted(); const result=await getUser(bearer,signal); signal.throwIfAborted();
   if (result.error || !result.data.user) return null;
   return sessionAfterAuthVerification(bearer,result.data.user.id);
  };
  const first=await authenticate();
  if (!isCurrent(firstPolicy)) throw Error('Shared consent Auth policy expired');
  if (!first || await verifyReadAuthority(first,tx)!==true) return null;
  signal.throwIfAborted();
  const constraint=await query(HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,[]);
  if (constraint.rows.length!==1 || constraint.rows[0].supported!==true) throw Error('Current Auth pin constraints unavailable');
  const user=await query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[first.userID]);
  if (user.rows.length!==1 || user.rows[0].id!==first.userID) return null;
  const session=await query(HOME_HANDOFF_AUTH_SESSION_PIN_SQL,[first.sessionID,first.userID]);
  if (session.rows.length!==1 || session.rows[0].id!==first.sessionID) return null;
  await query(HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,[first.userID]);
  if (!isCurrent(firstPolicy)) throw Error('Shared consent Auth policy expired');
  const policy=await readPolicy();
  const final=await authenticate();
  if (!isCurrent(policy)) throw Error('Shared consent Auth policy expired');
  if (!final || final.userID!==first.userID || final.sessionID!==first.sessionID
   || await verifyReadAuthority(final,tx)!==true) return null;
  const result=await query(SHARED_CONSENT_SESSION_SQL,[final.sessionID,final.userID,policy.timeboxSeconds,policy.inactivitySeconds]);
  if (!isCurrent(policy)) throw Error('Shared consent Auth policy expired');
  if (result.rows.length!==1) return null;
  const row=result.rows[0],checkedAt=Math.floor(Number(row.checked_at));
  if (!Number.isSafeInteger(checkedAt) || checkedAt<=0 || row.session_current!==true
   || row.session_aal!=='aal2' || row.verified_totp!==true
   || !sessionAfterAuthVerification(bearer,final.userID,new Date(checkedAt))) return null;
  const claims=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString('utf8')) as {aal?:unknown;amr?:unknown};
  if (claims.aal!=='aal2' || !Array.isArray(claims.amr) || claims.amr.length>16) return null;
  const recent=claims.amr.filter((value:unknown):value is {method:string;timestamp:number} => {
   if (!value || typeof value!=='object') return false;
   const item=value as {method?:unknown;timestamp?:unknown};
   return item.method==='totp' && Number.isSafeInteger(item.timestamp) && Number(item.timestamp)>0
    && Number(item.timestamp)*1000<=checkedAt && Number(item.timestamp)*1000>=checkedAt-600000;
  });
  if (recent.length!==1) return null;
  const state=await query(HOME_HANDOFF_AUTH_STATE_SQL,[final.userID,final.sessionID]);
  if (state.rows.length!==1 || !state.rows[0].auth_state || typeof state.rows[0].auth_state!=='object' || Array.isArray(state.rows[0].auth_state)) return null;
  if (await verifyReadAuthority(final,tx)!==true) return null;
  signal.throwIfAborted();
  if (!isCurrent(policy)) throw Error('Shared consent Auth policy expired');
  const authStateDigest=createHash('sha256').update('OuchiMaintenance/shared-consent-auth-state/v1\n'+JSON.stringify(state.rows[0].auth_state)).digest('hex');
  return Object.freeze({...final,aal:'aal2' as const,authenticatedAt:recent[0].timestamp*1000,checkedAt,authStateDigest});
 };
}
