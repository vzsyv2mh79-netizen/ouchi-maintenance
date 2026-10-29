import {createHmac,timingSafeEqual} from 'node:crypto';
import {SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';

export const PRE_NATIVE_LOGOUT_CONSENT_SQL='select * from maintenance_private.read_pre_native_after_logout_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid)';
type Transaction={signal:AbortSignal;query:(sql:string,args:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;beforeCommit:(key:string,check:()=>Promise<boolean>)=>void};
type Payload={requestID:string;homeID:string;userID:string;sessionID:string;aal:'aal2';authenticatedAt:number;authStateDigest:string;proofDomain:string;expiresAt:number};
type Options={key:Uint8Array;requestID:string;homeID:string;rootLease:string;nativeRequestID:string;ownerEpoch:string;nativeLease:string;verifyReadAuthority:(tx:Transaction,scope:Readonly<Record<string,string>>,signal:AbortSignal)=>Promise<boolean>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const fields=['requestID','homeID','userID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));

/** Separate historical-only read after global logout, BEFORE native seal.
 * Returns the immutable signed original, never current identity, new consent,
 * Storage deletion permission or a mutation capability. SQL pins the exact
 * root/native phases, actual session absence and ALL retained family evidence.
 * Independent current writer/namespace/retained-byte readbacks are mandatory
 * on this same checked transaction; no default receipt/boolean authorization.
 * No network credentials, roles, grants, existing reader changes or endpoint.
 */
export function createPreNativeAfterLogoutConsent(input:Options){
 const fixed={...input},secret=Buffer.from(input.key);
 if(!(input.key instanceof Uint8Array)||secret.length<32||![fixed.requestID,fixed.homeID,fixed.rootLease,fixed.nativeRequestID,fixed.ownerEpoch,fixed.nativeLease].every(uuid)||typeof input.verifyReadAuthority!=='function')throw Error('Fixed original custody and independent read authority required');
 const checks=new WeakMap<Transaction,Map<string,string>>(),pins=new WeakMap<Transaction,{pid:number;xid:string}>();
 async function readSnapshot(actor:string,tx:Transaction){
  if(!uuid(actor)||!(tx?.signal instanceof AbortSignal)||typeof tx.beforeCommit!=='function')throw Error('Pinned archival transaction required');
  tx.signal.throwIfAborted();
  const rows=(await tx.query(PRE_NATIVE_LOGOUT_CONSENT_SQL,[fixed.requestID,fixed.homeID,actor,fixed.rootLease,fixed.nativeRequestID,fixed.ownerEpoch,fixed.nativeLease])).rows;
  tx.signal.throwIfAborted();if(rows.length===0)return null;
  if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='backend_pid,payload,signature,transaction_id')throw Error('Exact archival custody required');
  const pin={pid:Number(rows[0].backend_pid),xid:String(rows[0].transaction_id)},priorPin=pins.get(tx);
  if(!Number.isSafeInteger(rows[0].backend_pid)||pin.pid<=0||typeof rows[0].transaction_id!=='string'||!/^[1-9][0-9]*$/.test(pin.xid)||(priorPin&&(priorPin.pid!==pin.pid||priorPin.xid!==pin.xid)))throw Error('Pinned historical connection changed');
  const p=rows[0].payload as Payload,s=rows[0].signature;
  if(!p||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.requestID!==fixed.requestID||p.homeID!==fixed.homeID||p.userID!==actor||![p.requestID,p.homeID,p.userID,p.sessionID].every(uuid)||p.aal!=='aal2'||p.proofDomain!==SCOPED_SHARED_CONSENT_DOMAIN||typeof p.authStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||!Number.isSafeInteger(p.authenticatedAt)||p.authenticatedAt<=0||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=p.authenticatedAt||p.expiresAt>p.authenticatedAt+600000||typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw Error('Original signed archival proof required');
  const expected=createHmac('sha256',secret).update('OuchiMaintenance/original-scoped-consent/v1\n'+canonical(p)).digest();
  if(!timingSafeEqual(expected,Buffer.from(s,'hex')))throw Error('Original signed archival proof required');
  pins.set(tx,pin);
  const originalPayload=Object.freeze({...p}),originalText=canonical(originalPayload);
  const authority=Object.freeze({requestID:fixed.requestID,homeID:fixed.homeID,rootLease:fixed.rootLease,nativeRequestID:fixed.nativeRequestID,ownerEpoch:fixed.ownerEpoch,nativeLease:fixed.nativeLease,actorID:actor});
  if(await fixed.verifyReadAuthority(tx,authority,tx.signal)!==true)throw Error('Current independent historical read authority required');
  tx.signal.throwIfAborted();
  const final=(await tx.query(PRE_NATIVE_LOGOUT_CONSENT_SQL,[fixed.requestID,fixed.homeID,actor,fixed.rootLease,fixed.nativeRequestID,fixed.ownerEpoch,fixed.nativeLease])).rows;tx.signal.throwIfAborted();
  if(final.length!==1||Object.keys(final[0]).sort().join(',')!=='backend_pid,payload,signature,transaction_id'||final[0].backend_pid!==pin.pid||final[0].transaction_id!==pin.xid||final[0].signature!==s||canonical(final[0].payload as Payload)!==originalText)throw Error('Historical frame changed after readback');
  return Object.freeze({kind:'pre-native-after-logout-historical-consent-only' as const,payload:originalPayload,signature:s});
 }
 return Object.freeze({readSnapshot,async read(actor:string,tx:Transaction){
  const first=await readSnapshot(actor,tx);if(!first)return null;
  const fingerprint=first.signature+canonical(first.payload),actors=checks.get(tx)??new Map<string,string>();
  const prior=actors.get(actor);if(prior!==undefined){if(prior!==fingerprint)throw Error('Original archival proof changed');return first;}
  tx.beforeCommit('pre-native-after-logout:'+fixed.requestID+':'+fixed.homeID+':'+actor,async()=>{
   try{const final=await readSnapshot(actor,tx);return !!final&&final.signature+canonical(final.payload)===fingerprint;}catch{return false;}
  });actors.set(actor,fingerprint);checks.set(tx,actors);return first;
 }});
}
