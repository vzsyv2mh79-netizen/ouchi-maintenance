import {createHmac,timingSafeEqual} from 'node:crypto';
import {createScopedSharedConsentIdentityVerifier,SCOPED_SHARED_CONSENT_AUTH_SQL,SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';

type IdentityOptions=Parameters<typeof createScopedSharedConsentIdentityVerifier>[0];
type Transaction=Parameters<ReturnType<typeof createScopedSharedConsentIdentityVerifier>>[1];
type Payload={requestID:string;homeID:string;userID:string;sessionID:string;aal:'aal2';authenticatedAt:number;authStateDigest:string;proofDomain:string;expiresAt:number};
export const PREPARED_CONSENT_AUTH_SQL='select * from maintenance_private.prepared_scoped_shared_consent_auth($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::bigint)';
export const PREPARED_CONSENT_RECORD_SQL='select maintenance_private.record_prepared_scoped_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text,$8::bigint,$9::bigint) as recorded';
export const PREPARED_CONSENT_READ_SQL='select * from maintenance_private.read_prepared_scoped_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)';
export const PREPARED_CONSENT_CURRENT_SQL='select * from maintenance_private.current_prepared_scoped_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,$7::bigint)';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const fields=['requestID','homeID','userID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));
const duration=(v:unknown)=>v===null||(Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=315360000);

/** Dormant intake-only contract. It uses the SAME strict bearer/TOTP/policy
 * verifier with one fixed private prepared RPC, never a supplied verifier/SQL.
 * Issuance is requested-only in SQL. Claim confirmation can survive only the
 * formal transition to processing with the exact original planned lease.
 * It does not claim/freeze/erase anything or replace a normal worker identity.
 */
export function createPreparedScopedSharedConsent({key,rootLease,...input}:IdentityOptions&{key:Uint8Array;rootLease:string}){
 if(!(key instanceof Uint8Array)||key.length<32||!uuid(rootLease))throw Error('Independent original key and planned root lease required');
 const fixed={...input},secret=Buffer.from(key),clock=fixed.clock??Date.now;
 const strict=createScopedSharedConsentIdentityVerifier(fixed);
 const identityChecks=new WeakMap<Transaction,Map<string,string>>(),claimChecks=new WeakMap<Transaction,Map<string,string>>();
 const sign=(p:Payload)=>createHmac('sha256',secret).update('OuchiMaintenance/original-scoped-consent/v1\n'+canonical(p)).digest('hex');
 const args=(actor:string)=>[fixed.requestID,fixed.homeID,actor,rootLease,fixed.nativeLease];
 async function identity(bearer:string,tx:Transaction){
  // The strict verifier is query-only. An unexpected new query/hook fails
  // closed rather than falling back to raw Auth or a different connection.
  const prepared:Transaction={signal:tx.signal,beforeCommit:()=>{throw Error('Unexpected identity hook');},query:(sql,values)=>{
   if(sql!==SCOPED_SHARED_CONSENT_AUTH_SQL)throw Error('Unexpected prepared identity query');
   return tx.query(PREPARED_CONSENT_AUTH_SQL,values);
  }};
  return strict(bearer,prepared);
 }
 function validate(row:Record<string,unknown>,actor:string){
  const p=row.payload as Payload,s=row.signature;
  if(Object.keys(row).sort().join(',')!=='payload,signature'||!p||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.requestID!==fixed.requestID||p.homeID!==fixed.homeID||p.userID!==actor||![p.requestID,p.homeID,p.userID,p.sessionID].every(uuid)||p.aal!=='aal2'||p.proofDomain!==SCOPED_SHARED_CONSENT_DOMAIN||typeof p.authStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||!Number.isSafeInteger(p.authenticatedAt)||p.authenticatedAt<=0||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=p.authenticatedAt||p.expiresAt>p.authenticatedAt+600000||typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s)||!timingSafeEqual(Buffer.from(sign(p),'hex'),Buffer.from(s,'hex')))throw Error('Exact original prepared consent required');
  return Object.freeze({payload:Object.freeze({...p}),signature:s});
 }
 async function original(actor:string,tx:Transaction){
  if(!uuid(actor)||!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Pinned prepared transaction required');
  tx.signal.throwIfAborted();const rows=(await tx.query(PREPARED_CONSENT_READ_SQL,args(actor))).rows;tx.signal.throwIfAborted();
  if(rows.length===0)return null;if(rows.length!==1)throw Error('Ambiguous prepared proof');return validate(rows[0],actor);
 }
 async function policy(tx:Transaction){
  const p=await fixed.policyReader(tx.signal);tx.signal.throwIfAborted();
  return p&&p.projectID===fixed.projectID&&p.authVersion==='v2.197.0'&&p.assuranceMode==='highest-current-aal/v1'&&p.singleSession===false&&p.totpVerify===true&&duration(p.timeboxSeconds)&&duration(p.inactivitySeconds)&&fixed.policyReader.isCurrent(p)?p:null;
 }
 async function readClaimSnapshot(actor:string,tx:Transaction){
  const first=await original(actor,tx);if(!first)return null;
  const p=first.payload,now=clock();if(p.authenticatedAt>now||p.expiresAt<=now)return null;
  const settings=await policy(tx);if(!settings)return null;
  const rows=(await tx.query(PREPARED_CONSENT_CURRENT_SQL,[...args(actor),settings.timeboxSeconds,settings.inactivitySeconds])).rows;tx.signal.throwIfAborted();
  if(!fixed.policyReader.isCurrent(settings)||rows.length!==1)return null;
  const r=rows[0],at=Number(r.checked_at);
  if(Object.keys(r).sort().join(',')!=='auth_state_digest,authenticated_at,checked_at'||r.auth_state_digest!==p.authStateDigest||Number(r.authenticated_at)!==p.authenticatedAt||!Number.isSafeInteger(at)||at<=0||at>clock()||clock()-at>=60000||p.expiresAt<=clock())return null;
  return Object.freeze({kind:'prepared-consent-for-claim-only' as const,...first});
 }
 return Object.freeze({readClaimSnapshot,async verifyClaim(actor:string,tx:Transaction){
  const first=await readClaimSnapshot(actor,tx);if(!first)return null;
  const fingerprint=first.signature+canonical(first.payload),actors=claimChecks.get(tx)??new Map<string,string>(),prior=actors.get(actor);
  if(prior!==undefined){if(prior!==fingerprint)throw Error('Original claim proof changed');return first;}
  tx.beforeCommit('prepared-claim:'+fixed.requestID+':'+fixed.homeID+':'+actor,async()=>{
   try{const final=await readClaimSnapshot(actor,tx);return !!final&&final.signature+canonical(final.payload)===fingerprint;}catch{return false;}
  });actors.set(actor,fingerprint);claimChecks.set(tx,actors);return first;
 },async issue(bearer:string,tx:Transaction){
  const first=await identity(bearer,tx);if(!first)throw Error('Current prepared issuer identity required');
  const payload:Payload={requestID:fixed.requestID,homeID:fixed.homeID,userID:first.userID,sessionID:first.sessionID,aal:'aal2',authenticatedAt:first.authenticatedAt,authStateDigest:first.authStateDigest,proofDomain:first.proofDomain,expiresAt:first.authenticatedAt+600000};
  const signature=sign(payload),settings=await policy(tx);if(!settings)throw Error('Current prepared issuance policy required');
  // Always call requested-only record, including replay. No new issuance can
  // be smuggled through the transition-aware claim/read path after processing.
  const result=await tx.query(PREPARED_CONSENT_RECORD_SQL,[fixed.requestID,fixed.homeID,first.userID,first.sessionID,fixed.nativeLease,payload,signature,settings.timeboxSeconds,settings.inactivitySeconds]);tx.signal.throwIfAborted();
  if(result.rows.length!==1||result.rows[0].recorded!==true||!fixed.policyReader.isCurrent(settings))throw Error('Requested-only original issuance required');
  const saved=await original(first.userID,tx);if(!saved||saved.signature!==signature||canonical(saved.payload)!==canonical(payload))throw Error('Atomic prepared custody required');
  const fingerprint=signature+canonical(payload),actors=identityChecks.get(tx)??new Map<string,string>(),prior=actors.get(first.userID);
  if(prior!==undefined){if(prior!==fingerprint)throw Error('Prepared original identity changed');return saved;}
  tx.beforeCommit('prepared-issue:'+fixed.requestID+':'+fixed.homeID+':'+first.userID,async()=>{
   try{const final=await identity(bearer,tx),record=await original(first.userID,tx);return !!final&&!!record&&final.userID===first.userID&&final.sessionID===first.sessionID&&final.authenticatedAt===first.authenticatedAt&&final.authStateDigest===first.authStateDigest&&final.proofDomain===first.proofDomain&&record.signature===signature&&canonical(record.payload)===canonical(payload)&&payload.expiresAt>clock();}catch{return false;}
  });actors.set(first.userID,fingerprint);identityChecks.set(tx,actors);return saved;
 }});
}
