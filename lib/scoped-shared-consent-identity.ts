import {sessionAfterAuthVerification} from './verified-app-session';

export const SCOPED_SHARED_CONSENT_AUTH_SQL='select * from maintenance_private.scoped_shared_consent_auth($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::bigint)';
export const SCOPED_SHARED_CONSENT_DOMAIN='OuchiMaintenance/scoped-shared-consent-auth/v1';
type Policy={projectID:string;authVersion:string;assuranceMode:string;singleSession:boolean;totpVerify:boolean;timeboxSeconds:number|null;inactivitySeconds:number|null};
type Reader=((signal:AbortSignal)=>Promise<Policy|null>)&{isCurrent:(value:Policy)=>boolean};
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;beforeCommit:(key:string,check:()=>Promise<boolean>)=>void};
type GetUser=(bearer:string,signal:AbortSignal)=>Promise<{data:{user:{id:string;is_anonymous?:boolean}|null};error:unknown}>;
const uuid=(v:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const duration=(v:unknown)=>v===null||(Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=315360000);

/** Undeployed dedicated-principal port. The private RPC checks the fixed
 * original request/plan and actual LOGIN, pins Auth state and returns only its
 * scoped digest/times. No raw Auth SQL fallback, role switch, credential lookup
 * or automatic conversion of an existing provider's signed proof is allowed.
 * The owning issuer must repeat this exact port in its COMMIT checks. It is
 * never a post-Auth recovery/capability reader or a combined-controller grant.
 */
export function createScopedSharedConsentIdentityVerifier({projectID,requestID,homeID,nativeLease,policyReader,getUser,clock=Date.now}:{projectID:string;requestID:string;homeID:string;nativeLease:string;policyReader:Reader;getUser:GetUser;clock?:()=>number}){
 if(!/^[a-z]{20}$/.test(projectID)||![requestID,homeID,nativeLease].every(uuid)||typeof policyReader!=='function'||typeof policyReader.isCurrent!=='function'||typeof getUser!=='function'||typeof clock!=='function')throw Error('Explicit scoped consent providers required');
 const current=policyReader.isCurrent.bind(policyReader);
 return async(bearer:string,tx:Transaction)=>{
  if(!(tx?.signal instanceof AbortSignal)||tx.signal.aborted||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')return null;
  const signal=tx.signal;
  try{
   const policy=await policyReader(signal);signal.throwIfAborted();
   if(!policy||policy.projectID!==projectID||policy.authVersion!=='v2.197.0'||policy.assuranceMode!=='highest-current-aal/v1'||policy.singleSession!==false||policy.totpVerify!==true||!duration(policy.timeboxSeconds)||!duration(policy.inactivitySeconds)||!current(policy))return null;
   // Snapshot scalar settings before any other awaited provider can mutate them.
   const timebox=policy.timeboxSeconds,inactivity=policy.inactivitySeconds;
   const result=await getUser(bearer,signal);signal.throwIfAborted();
   if(result.error||!result.data.user||result.data.user.is_anonymous===true||!current(policy))return null;
   const now=clock(),identity=sessionAfterAuthVerification(bearer,result.data.user.id,new Date(now));
   if(!identity)return null;
   const c=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString('utf8'));
   const aud=Array.isArray(c.aud)?c.aud:[c.aud];
   if(c.iss!=='https://'+projectID+'.supabase.co/auth/v1'||c.role!=='authenticated'||!aud.includes('authenticated')||c.is_anonymous!==false||c.aal!=='aal2'||!Number.isSafeInteger(c.iat)||c.iat<=0||c.iat*1000>now+60000||c.exp<=c.iat||!Array.isArray(c.amr)||c.amr.length>16||(c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf*1000>now+60000)))return null;
   const totp=c.amr.filter((a:{method?:unknown;timestamp?:unknown})=>a?.method==='totp'&&Number.isSafeInteger(a.timestamp)&&Number(a.timestamp)>0&&Number(a.timestamp)*1000<=now&&Number(a.timestamp)*1000>=now-600000);
   if(totp.length!==1)return null;
   const authenticatedAt=Number(totp[0].timestamp)*1000;
   const state=await tx.query(SCOPED_SHARED_CONSENT_AUTH_SQL,[requestID,homeID,identity.userID,identity.sessionID,nativeLease,'aal2',authenticatedAt,timebox,inactivity]);signal.throwIfAborted();
   if(!current(policy)||state.rows.length!==1)return null;
   const row=state.rows[0],checkedAt=Number(row.checked_at),authTime=Number(row.authenticated_at);
   if(Object.keys(row).sort().join(',')!=='auth_state_digest,authenticated_at,checked_at'||typeof row.auth_state_digest!=='string'||!/^[a-f0-9]{64}$/.test(row.auth_state_digest)||authTime!==authenticatedAt||!Number.isSafeInteger(checkedAt)||checkedAt<=0||checkedAt>clock()||clock()-checkedAt>=60000)return null;
   const digest=row.auth_state_digest;
   const final=await getUser(bearer,signal);signal.throwIfAborted();
   const at=clock();
   if(final.error||!final.data.user||final.data.user.id!==identity.userID||final.data.user.is_anonymous===true||!current(policy)||!sessionAfterAuthVerification(bearer,identity.userID,new Date(at))||at-checkedAt>=60000||at-authenticatedAt>600000)return null;
   return Object.freeze({...identity,aal:'aal2' as const,authenticatedAt,checkedAt,authStateDigest:digest,proofDomain:SCOPED_SHARED_CONSENT_DOMAIN});
  }catch{return null;}
 };
}

/** Dedicated issuer identity port, not a consent/proof-store implementation.
 * Retains the original scoped digest and signed TOTP time through COMMIT. The
 * bearer exists only in this transaction closure, never in durable evidence.
 * A caller cannot substitute a legacy or peer-provider identity verifier.
 */
export function createScopedSharedConsentIssuerIdentity(options:Parameters<typeof createScopedSharedConsentIdentityVerifier>[0]){
 const fixed={...options};
 const verify=createScopedSharedConsentIdentityVerifier(fixed);
 const requestID=fixed.requestID,homeID=fixed.homeID;
 return async(bearer:string,tx:Transaction)=>{
  const first=await verify(bearer,tx);if(!first)return null;
  tx.beforeCommit('scoped-consent:'+requestID+':'+homeID+':'+first.userID,async()=>{
   const final=await verify(bearer,tx);
   return !!final&&final.userID===first.userID&&final.sessionID===first.sessionID
    &&final.aal===first.aal&&final.authStateDigest===first.authStateDigest
    &&final.authenticatedAt===first.authenticatedAt&&final.proofDomain===first.proofDomain;
  });
  return first;
 };
}
