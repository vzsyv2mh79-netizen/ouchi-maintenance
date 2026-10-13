import {createHash} from 'node:crypto';
import {sessionAfterAuthVerification} from './verified-app-session';
import {HomeHandoffAdditionalVerificationRequired} from './home-handoff-handler.mjs';

// Prepared same-transaction identity check. This does not create a connection,
// grant Auth access, enable a route, or authorize ownership changes on its own.
type Policy={projectID:string;singleSession:boolean;timeboxSeconds:number|null;inactivitySeconds:number|null;allowLowAALSeconds?:number|null;assuranceMode?:'highest-current-aal/v1';totpVerify:boolean;phoneVerify:boolean;webAuthnVerify:boolean};
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
  if(!policy||policy.projectID!==projectID||!policyReader.isCurrent(policy)||policy.singleSession!==false
   ||(policy.assuranceMode!==undefined&&policy.assuranceMode!=='highest-current-aal/v1'))throw Error('Current Auth policy unavailable');
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

// Inventory consent uses these additional locks inside the caller's dedicated
// transaction. User locks fence factor/session INSERT through validated immediate
// Auth foreign keys; existing factors/sessions/enrollment rows stay locked until
// COMMIT. A deployment without those Auth FK guarantees is explicitly refused.
export const HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL=`select count(distinct c.conrelid)=2 as supported
 from pg_catalog.pg_constraint c
 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 join pg_catalog.pg_attribute target on target.attrelid=c.confrelid and target.attnum=any(c.confkey)
 where c.contype='f' and c.convalidated and not c.condeferrable
 and c.confrelid='auth.users'::regclass and a.attname='user_id'
 and target.attname='id' and cardinality(c.conkey)=1 and cardinality(c.confkey)=1
 and c.conrelid in ('auth.sessions'::regclass,'auth.mfa_factors'::regclass)`;
export const HOME_HANDOFF_AUTH_USER_PIN_SQL='select id from auth.users where id=$1::uuid for update';
export const HOME_HANDOFF_AUTH_SESSION_PIN_SQL='select id from auth.sessions where id=$1::uuid and user_id=$2::uuid for update';
export const HOME_HANDOFF_AUTH_FACTOR_PIN_SQL='select id from auth.mfa_factors where user_id=$1::uuid order by id for update';
export const HOME_HANDOFF_ENROLLMENT_PIN_SQL=`select e.epoch_id
 from maintenance_private.app_epochs e
 join maintenance_private.account_access a on a.user_id=e.user_id
 join maintenance_private.app_session_epochs b on b.user_id=e.user_id and b.epoch_id=e.epoch_id
 where e.user_id=$1::uuid and b.session_id=$2::uuid and e.enabled and a.enabled
 for update of e,a,b`;

// Private snapshot never leaves this backend adapter. Only its domain-separated
// digest is bound into the signed consent; factor secrets are not returned/stored.
export const HOME_HANDOFF_AUTH_STATE_SQL=`select jsonb_build_object(
 'user',jsonb_build_object('id',u.id,'password',to_jsonb(u)->'encrypted_password','bannedUntil',to_jsonb(u)->'banned_until','deletedAt',to_jsonb(u)->'deleted_at'),
 'session',jsonb_build_object('id',s.id,'userID',s.user_id,'aal',s.aal,'createdAt',s.created_at,'notAfter',s.not_after),
 'factors',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from auth.mfa_factors f where f.user_id=u.id),'[]'::jsonb)) as auth_state
 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1::uuid and s.id=$2::uuid`;
const authStateDigest=(state:unknown)=>{
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Pinned Auth state required');
 return createHash('sha256').update('OuchiMaintenance/inventory-auth-state/v1\n'+JSON.stringify(state)).digest('hex');
};

/** Prepared inventory issuer identity adapter. No route/grant/connection is
 * enabled here. Caller must keep this transaction through consent persistence,
 * order multi-user locks consistently and honor its signal/SQL timeout. Current
 * deployment Auth-policy acquisition is still a required external provider.
 * Only password and TOTP recent-authentication methods are supported; unsupported
 * methods refuse rather than replacing authentication time with verification time.
 */
export function createHomeHandoffInventoryIdentityVerifier(options:Parameters<typeof createHomeHandoffIdentityVerifier>[0]) {
 createHomeHandoffIdentityVerifier(options); // Validate configuration eagerly.
 return async(bearer:string,tx:Transaction)=>{
  // Policy evidence belongs to this invocation, never another concurrent actor.
  let lastPolicy:Policy|null=null;
  const policyReader:Reader=Object.assign(async(signal:AbortSignal)=>{
   const policy=await options.policyReader(signal);lastPolicy=policy;return policy;
  },{isCurrent:(policy:Policy)=>options.policyReader.isCurrent(policy)});
  const verify=createHomeHandoffIdentityVerifier({...options,policyReader});
  const first=await verify(bearer,tx);if(!first)return null;
  const signal=tx.signal;
  const query=async(sql:string,args:unknown[])=>{signal.throwIfAborted();const value=await tx.query(sql,args);signal.throwIfAborted();return value;};
  const constraint=await query(HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,[]);
  if(constraint.rows.length!==1||constraint.rows[0].supported!==true)throw Error('Current Auth pin constraints unavailable');
  const user=await query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[first.userID]);
  if(user.rows.length!==1||user.rows[0].id!==first.userID)return null;
  const session=await query(HOME_HANDOFF_AUTH_SESSION_PIN_SQL,[first.sessionID,first.userID]);
  if(session.rows.length!==1||session.rows[0].id!==first.sessionID)return null;
  await query(HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,[first.userID]);
  const enrollment=await query(HOME_HANDOFF_ENROLLMENT_PIN_SQL,[first.userID,first.sessionID]);
  if(enrollment.rows.length!==1||enrollment.rows[0].epoch_id!==first.epochID)return null;
  let policyRow:Record<string,unknown>|undefined;
  // Reverify the original bearer and current policy AFTER acquiring all locks.
  const final=await verify(bearer,{signal,query:async(sql,args)=>{
   const result=await query(sql,args);if(sql===HOME_HANDOFF_SESSION_POLICY_SQL)policyRow=result.rows[0];return result;
  }});
  if(!final||final.userID!==first.userID||final.sessionID!==first.sessionID||final.epochID!==first.epochID||!policyRow)return null;
  // Use exactly the policy validated by the final session read; a new policy
  // must not silently replace it without applying its session limits again.
  const policy=lastPolicy as Policy|null;signal.throwIfAborted();
  if(!policy||policy.projectID!==options.projectID||!options.policyReader.isCurrent(policy)||policy.singleSession!==false)throw Error('Current Auth policy expired');
  if(policyRow.has_verified_factor===true&&policy.totpVerify!==true)return null;
  const checkedAt=Math.floor(Number(policyRow.verified_at));
  if(!Number.isSafeInteger(checkedAt)||checkedAt<=0)return null;
  const claims=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString('utf8')) as {aal?:unknown;amr?:unknown};
  if(!['aal1','aal2'].includes(String(claims.aal))||!Array.isArray(claims.amr)||claims.amr.length>16)return null;
  const recent=claims.amr.filter((c:unknown):c is {method:string;timestamp:number}=>{
   if(!c||typeof c!=='object')return false;
   const r=c as {method?:unknown;timestamp?:unknown};
   return (policyRow?.has_verified_factor===true?r.method==='totp':r.method==='password')
    &&Number.isSafeInteger(r.timestamp)&&Number(r.timestamp)>0
    &&Number(r.timestamp)*1000<=checkedAt&&Number(r.timestamp)*1000>=checkedAt-600000;
  });
  if(recent.length!==1)return null;
  const state=await query(HOME_HANDOFF_AUTH_STATE_SQL,[final.userID,final.sessionID]);
  if(state.rows.length!==1||!options.policyReader.isCurrent(policy))return null;
  return Object.freeze({...final,aal:claims.aal as 'aal1'|'aal2',authenticatedAt:recent[0].timestamp*1000,checkedAt,authStateDigest:authStateDigest(state.rows[0].auth_state)});
 };
}

type InventoryActorClaim={purpose:string;bindingDigest:string;authStateDigest:string;actorID:string;sessionID:string;epochID:string;aal:'aal1'|'aal2';authenticatedAt:number;checkedAt:number;acceptedAt:number;expiresAt:number};
/** Backend callback ONLY for claims already signature/binding-verified by the
 * private inventory-consent provider. This does not verify a signature itself,
 * grant household rights, create an endpoint, or accept client-supplied claims.
 * Keep the pinned transaction through COMMIT; lock multiple actors consistently.
 * The exact pinned Auth/factor-state digest must match signed issuance evidence.
 */
export function createHomeHandoffInventoryActorVerifier({policyReader,projectID}:{policyReader:Reader;projectID:string}) {
 if(typeof policyReader!=='function'||typeof policyReader.isCurrent!=='function'||!/^[a-z]{20}$/.test(projectID))throw Error('Current inventory actor provider required');
 const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
 return async(tx:Transaction,c:InventoryActorClaim,signal:AbortSignal=tx?.signal)=>{
  try{
   if(!(signal instanceof AbortSignal)||tx?.signal!==signal||typeof tx.query!=='function'
    ||c?.purpose!=='OuchiMaintenance/family-attachment-inventory/v2'||!/^[0-9a-f]{64}$/.test(c.bindingDigest)||!/^[0-9a-f]{64}$/.test(c.authStateDigest)
    ||![c.actorID,c.sessionID,c.epochID].every(uuid)||!['aal1','aal2'].includes(c.aal))return false;
   const query=async(sql:string,args:unknown[])=>{signal.throwIfAborted();const result=await tx.query(sql,args);signal.throwIfAborted();return result;};
   const policy=await policyReader(signal);signal.throwIfAborted();
   if(!policy||policy.projectID!==projectID||!policyReader.isCurrent(policy)||policy.singleSession!==false
    ||(policy.assuranceMode!==undefined&&policy.assuranceMode!=='highest-current-aal/v1'))return false;
   const constraints=await query(HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,[]);
   if(constraints.rows.length!==1||constraints.rows[0].supported!==true)return false;
   const user=await query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[c.actorID]);if(user.rows.length!==1||user.rows[0].id!==c.actorID)return false;
   const session=await query(HOME_HANDOFF_AUTH_SESSION_PIN_SQL,[c.sessionID,c.actorID]);if(session.rows.length!==1||session.rows[0].id!==c.sessionID)return false;
   await query(HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,[c.actorID]);
   const enrollment=await query(HOME_HANDOFF_ENROLLMENT_PIN_SQL,[c.actorID,c.sessionID]);
   if(enrollment.rows.length!==1||enrollment.rows[0].epoch_id!==c.epochID||!policyReader.isCurrent(policy))return false;
   const result=await query(HOME_HANDOFF_SESSION_POLICY_SQL,[c.sessionID,c.actorID,policy.timeboxSeconds,policy.inactivitySeconds]);
   if(result.rows.length!==1||!policyReader.isCurrent(policy))return false;
   const row=result.rows[0],now=Math.floor(Number(row.verified_at));
   if(!Number.isSafeInteger(now)||now<=0||row.session_current!==true||row.epoch_id!==c.epochID||row.session_aal!==c.aal||typeof row.has_verified_factor!=='boolean')return false;
   if(row.has_verified_factor&&(c.aal!=='aal2'||policy.totpVerify!==true))return false;
   if(![c.authenticatedAt,c.checkedAt,c.acceptedAt,c.expiresAt].every(v=>Number.isSafeInteger(v)&&v>0)
    ||c.authenticatedAt>c.checkedAt||c.checkedAt>c.acceptedAt||c.acceptedAt>now
    ||c.authenticatedAt<now-600000||c.checkedAt<c.acceptedAt-60000
    ||c.expiresAt!==c.acceptedAt+900000||c.expiresAt<=now)return false;
   const state=await query(HOME_HANDOFF_AUTH_STATE_SQL,[c.actorID,c.sessionID]);
   if(state.rows.length!==1||authStateDigest(state.rows[0].auth_state)!==c.authStateDigest)return false;
   signal.throwIfAborted();return policyReader.isCurrent(policy);
  }catch{return false;}
 };
}
