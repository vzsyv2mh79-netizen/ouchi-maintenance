import {createHmac,timingSafeEqual} from 'node:crypto';
import {SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';

export const POST_NATIVE_SEAL_CONSENT_SQL='select * from maintenance_private.read_post_native_seal_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid)';
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;beforeCommit:(key:string,check:()=>Promise<boolean>)=>void};
type Payload={requestID:string;homeID:string;userID:string;sessionID:string;aal:'aal2';authenticatedAt:number;authStateDigest:string;proofDomain:string;expiresAt:number};
type Options={key:Uint8Array;requestID:string;homeID:string;rootLease:string;nativeRequestID:string;ownerEpoch:string;completionLease:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const fields=['requestID','homeID','userID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));

/** Review-only archival port. Never a current identity, consent issuer, family
 * writer or Auth eraser. SQL verifies the actual native completion predicate
 * and immutable family checkpoint. Expired consent remains historical only.
 * No network call, retained bearer, role/grant or shipping endpoint is added.
 */
export function createPostNativeSealConsent(input:Options){
 const fixed={...input},secret=Buffer.from(input.key);
 if(!(input.key instanceof Uint8Array)||secret.length<32||![fixed.requestID,fixed.homeID,fixed.rootLease,fixed.nativeRequestID,fixed.ownerEpoch,fixed.completionLease].every(uuid))throw Error('Fixed original custody and sealed native authority required');
 const checks=new WeakMap<Transaction,Map<string,string>>();
 async function readSnapshot(actor:string,tx:Transaction){
  if(!uuid(actor)||!(tx?.signal instanceof AbortSignal)||typeof tx.beforeCommit!=='function')throw Error('Pinned archival transaction required');
  tx.signal.throwIfAborted();
  const rows=(await tx.query(POST_NATIVE_SEAL_CONSENT_SQL,[fixed.requestID,fixed.homeID,actor,fixed.rootLease,fixed.nativeRequestID,fixed.ownerEpoch,fixed.completionLease])).rows;
  tx.signal.throwIfAborted();if(rows.length===0)return null;
  if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='payload,signature')throw Error('Exact archival custody required');
  const p=rows[0].payload as Payload,s=rows[0].signature;
  if(!p||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.requestID!==fixed.requestID||p.homeID!==fixed.homeID||p.userID!==actor||![p.requestID,p.homeID,p.userID,p.sessionID].every(uuid)||p.aal!=='aal2'||p.proofDomain!==SCOPED_SHARED_CONSENT_DOMAIN||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||!Number.isSafeInteger(p.authenticatedAt)||p.authenticatedAt<=0||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=p.authenticatedAt||p.expiresAt>p.authenticatedAt+600000||typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw Error('Original signed archival proof required');
  const expected=createHmac('sha256',secret).update('OuchiMaintenance/original-scoped-consent/v1\n'+canonical(p)).digest();
  if(!timingSafeEqual(expected,Buffer.from(s,'hex')))throw Error('Original signed archival proof required');
  return Object.freeze({kind:'post-native-seal-historical-consent-only' as const,payload:Object.freeze({...p}),signature:s});
 }
 return Object.freeze({readSnapshot,async read(actor:string,tx:Transaction){
  const first=await readSnapshot(actor,tx);if(!first)return null;
  const fingerprint=first.signature+canonical(first.payload),actors=checks.get(tx)??new Map<string,string>();
  const prior=actors.get(actor);if(prior!==undefined){if(prior!==fingerprint)throw Error('Original archival proof changed');return first;}
  tx.beforeCommit('post-native-seal:'+fixed.requestID+':'+fixed.homeID+':'+actor,async()=>{
   try{const final=await readSnapshot(actor,tx);return !!final&&final.signature+canonical(final.payload)===fingerprint;}catch{return false;}
  });actors.set(actor,fingerprint);checks.set(tx,actors);return first;
 }});
}
