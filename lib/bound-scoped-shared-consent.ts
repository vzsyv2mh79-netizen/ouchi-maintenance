import {createHmac,timingSafeEqual} from 'node:crypto';
import {createScopedSharedConsentIssuerIdentity,SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';

type Options=Parameters<typeof createScopedSharedConsentIssuerIdentity>[0];
type Transaction=Parameters<ReturnType<typeof createScopedSharedConsentIssuerIdentity>>[1];
type Payload={requestID:string;homeID:string;userID:string;sessionID:string;aal:'aal2';authenticatedAt:number;authStateDigest:string;proofDomain:string;expiresAt:number};
export const BOUND_CONSENT_RECORD_SQL='select maintenance_private.record_scoped_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text,$8::bigint,$9::bigint) as recorded';
export const BOUND_CONSENT_READ_SQL='select * from maintenance_private.read_scoped_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)';
export const BOUND_CONSENT_CURRENT_SQL='select * from maintenance_private.current_bound_scoped_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,$7::bigint)';
const uuid=(s:unknown)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s)&&s!=='00000000-0000-0000-0000-000000000000';
const fields=['requestID','homeID','userID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));
function validPayload(p:Payload){return p&&Object.keys(p).sort().join(',')===[...fields].sort().join(',')&&[p.requestID,p.homeID,p.userID,p.sessionID].every(uuid)&&p.aal==='aal2'&&p.proofDomain===SCOPED_SHARED_CONSENT_DOMAIN&&typeof p.authStateDigest==='string'&&/^[a-f0-9]{64}$/.test(p.authStateDigest)&&Number.isSafeInteger(p.authenticatedAt)&&p.authenticatedAt>0&&Number.isSafeInteger(p.expiresAt)&&p.expiresAt>p.authenticatedAt&&p.expiresAt<=p.authenticatedAt+600000;}

/** Undeployed private custody candidate. The issuer and worker have different
 * RPCs/LOGINs. No bearer is retained. Historical reads are deliberately a
 * different result type and confer no current identity or mutation authority.
 * Owning controller must verify committed family/Storage receipts and scoped
 * post-Auth capability independently. This adapter does not erase/log out Auth.
 */
export function createBoundScopedSharedConsent({key,rootLease,...input}:Options&{key:Uint8Array;rootLease:string}){
 if(!(key instanceof Uint8Array)||key.length<32||!uuid(rootLease))throw Error('Independent proof key and fixed current root lease required');
 const fixed={...input},secret=Buffer.from(key),clock=fixed.clock??Date.now;
 const issuer=createScopedSharedConsentIssuerIdentity(fixed);
 const currentChecks=new WeakMap<Transaction,Map<string,string>>(),historyChecks=new WeakMap<Transaction,Map<string,string>>();
 const sign=(payload:Payload)=>createHmac('sha256',secret).update('OuchiMaintenance/original-scoped-consent/v1\n'+canonical(payload)).digest('hex');
 const args=(actor:string)=>[fixed.requestID,fixed.homeID,actor,rootLease,fixed.nativeLease];
 function verify(row:Record<string,unknown>){
  const p=row.payload as Payload,s=row.signature;
  if(Object.keys(row).sort().join(',')!=='payload,signature'||!validPayload(p)||p.requestID!==fixed.requestID||p.homeID!==fixed.homeID||typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s)||!timingSafeEqual(Buffer.from(sign(p),'hex'),Buffer.from(s,'hex')))throw Error('Original independent Ouchi proof required');
  return Object.freeze({payload:Object.freeze({...p}),signature:s});
 }
 async function read(actor:string,tx:Transaction){
  if(!uuid(actor)||!(tx?.signal instanceof AbortSignal)||tx.signal.aborted||typeof tx.beforeCommit!=='function')throw Error('Pinned original proof transaction required');
  const rows=(await tx.query(BOUND_CONSENT_READ_SQL,args(actor))).rows;tx.signal.throwIfAborted();
  if(rows.length===0)return null;if(rows.length!==1)throw Error('Ambiguous original proof');
  const result=verify(rows[0]);if(result.payload.userID!==actor)throw Error('Original actor changed');return result;
 }
 async function current(actor:string,tx:Transaction){
  try{
   const original=await read(actor,tx);if(!original||original.payload.expiresAt<=clock())return null;
   const policy=await fixed.policyReader(tx.signal);tx.signal.throwIfAborted();
   const duration=(v:unknown)=>v===null||(Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=315360000);
   if(!policy||policy.projectID!==fixed.projectID||policy.authVersion!=='v2.197.0'||policy.assuranceMode!=='highest-current-aal/v1'||policy.singleSession!==false||policy.totpVerify!==true||!duration(policy.timeboxSeconds)||!duration(policy.inactivitySeconds)||!fixed.policyReader.isCurrent(policy))return null;
   const rows=(await tx.query(BOUND_CONSENT_CURRENT_SQL,[...args(actor),policy.timeboxSeconds,policy.inactivitySeconds])).rows;tx.signal.throwIfAborted();
   if(!fixed.policyReader.isCurrent(policy)||rows.length!==1)return null;
   const r=rows[0],now=clock(),checkedAt=Number(r.checked_at),p=original.payload;
   if(Object.keys(r).sort().join(',')!=='auth_state_digest,authenticated_at,checked_at'||r.auth_state_digest!==p.authStateDigest||Number(r.authenticated_at)!==p.authenticatedAt||!Number.isSafeInteger(checkedAt)||checkedAt<=0||checkedAt>now||now-checkedAt>=60000||p.authenticatedAt>now||now-p.authenticatedAt>600000||p.expiresAt<=now)return null;
   return Object.freeze({userID:p.userID,sessionID:p.sessionID,authenticatedAt:p.authenticatedAt,authStateDigest:p.authStateDigest,proofDomain:p.proofDomain,expiresAt:p.expiresAt});
  }catch{return null;}
 }
 return Object.freeze({
  async issue(bearer:string,tx:Transaction){
   const identity=await issuer(bearer,tx);if(!identity)throw Error('Current original consent identity required');
   const old=await read(identity.userID,tx);
   if(old){const p=old.payload;if(p.sessionID!==identity.sessionID||p.authenticatedAt!==identity.authenticatedAt||p.authStateDigest!==identity.authStateDigest||p.expiresAt<=clock())throw Error('Original consent cannot be rebound');return old;}
   const payload:Payload={requestID:fixed.requestID,homeID:fixed.homeID,userID:identity.userID,sessionID:identity.sessionID,aal:'aal2',authenticatedAt:identity.authenticatedAt,authStateDigest:identity.authStateDigest,proofDomain:identity.proofDomain,expiresAt:identity.authenticatedAt+600000};
   const signature=sign(payload),policy=await fixed.policyReader(tx.signal);tx.signal.throwIfAborted();
   if(!policy||!fixed.policyReader.isCurrent(policy))throw Error('Current issuance policy required');
   const r=await tx.query(BOUND_CONSENT_RECORD_SQL,[fixed.requestID,fixed.homeID,identity.userID,identity.sessionID,fixed.nativeLease,payload,signature,policy.timeboxSeconds,policy.inactivitySeconds]);
   if(r.rows.length!==1||r.rows[0].recorded!==true||!fixed.policyReader.isCurrent(policy))throw Error('Atomic original proof required');
   const saved=await read(identity.userID,tx);if(!saved||saved.signature!==signature||canonical(saved.payload)!==canonical(payload))throw Error('Original proof persistence unconfirmed');
   tx.beforeCommit('bound-consent:'+fixed.requestID+':'+fixed.homeID+':'+identity.userID,async()=>{
    try{const final=await read(identity.userID,tx);return !!final&&final.signature===signature&&canonical(final.payload)===canonical(payload)&&payload.expiresAt>clock();}catch{return false;}
   });
   return saved;
  },
  // Hook-free stage readbacks. Use these from an existing COMMIT callback;
  // they still validate exact current scope/lease/policy or historical custody.
  readCurrent:current,
  async readHistoricalSnapshot(actor:string,tx:Transaction){
   const record=await read(actor,tx);return record?Object.freeze({kind:'historical-consent-only' as const,...record}):null;
  },
  async verifyCurrent(actor:string,tx:Transaction){
   const first=await current(actor,tx);if(!first)return null;
   const fingerprint=JSON.stringify(first),actors=currentChecks.get(tx)??new Map<string,string>();
   const old=actors.get(actor);if(old!==undefined)return old===fingerprint?first:null;
   tx.beforeCommit('bound-current:'+fixed.requestID+':'+fixed.homeID+':'+actor,async()=>{
    const final=await current(actor,tx);return !!final&&JSON.stringify(final)===JSON.stringify(first);
   });actors.set(actor,fingerprint);currentChecks.set(tx,actors);return first;
  },
  async readHistorical(actor:string,tx:Transaction){
   const record=await read(actor,tx);if(!record)return null;
   const fingerprint=record.signature+canonical(record.payload),actors=historyChecks.get(tx)??new Map<string,string>();
   const old=actors.get(actor);if(old!==undefined){if(old!==fingerprint)throw Error('Original historical proof changed');return Object.freeze({kind:'historical-consent-only' as const,...record});}
   tx.beforeCommit('bound-history:'+fixed.requestID+':'+fixed.homeID+':'+actor,async()=>{
    try{const final=await read(actor,tx);return !!final&&final.signature===record.signature&&canonical(final.payload)===canonical(record.payload);}catch{return false;}
   });actors.set(actor,fingerprint);historyChecks.set(tx,actors);return Object.freeze({kind:'historical-consent-only' as const,...record});
  }
 });
}
