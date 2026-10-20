import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {sessionAfterAuthVerification} from './verified-app-session';
import {createScopedSharedConsentIdentityVerifier} from './scoped-shared-consent-identity';

type IdentityOptions=Parameters<typeof createScopedSharedConsentIdentityVerifier>[0];
type Tx=Parameters<ReturnType<typeof createScopedSharedConsentIdentityVerifier>>[1];
type Options=Omit<IdentityOptions,'requestID'|'homeID'>&{key:Uint8Array;scope:unknown};
type Payload={domain:string;scope:ReturnType<typeof normalizeSharedDeletionScope>;userID:string;nativeLease:string;sessionID:string;epochID:string;aal:'aal2';passwordAt:number;authenticatedAt:number;authStateDigest:string;expiresAt:number};
const domain='OuchiMaintenance/owner-only-original/v1';
const fields=['domain','scope','userID','nativeLease','sessionID','epochID','aal','passwordAt','authenticatedAt','authStateDigest','expiresAt'] as const;
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,k==='scope'?normalizeSharedDeletionScope(p.scope):p[k]])));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
export const OUCHI_OWNER_FRAME_SQL='select * from maintenance_private.ouchi_owner_only_frame($1::uuid,$2::uuid,$3::jsonb,$4::uuid)';
export const OUCHI_OWNER_AUTH_SQL='select * from maintenance_private.ouchi_owner_auth($1::uuid,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::bigint,$7::bigint,$8::bigint,$9::bigint)';
export const OUCHI_OWNER_RECORD_SQL='select maintenance_private.record_ouchi_owner_original($1::uuid,$2::uuid,$3::jsonb,$4::uuid,$5::jsonb,$6::text,$7::bigint,$8::bigint) as ok';
export const OUCHI_OWNER_READ_SQL='select * from maintenance_private.read_ouchi_owner_original($1::uuid,$2::uuid,$3::jsonb,$4::uuid)';

/** Disabled independent owner-only intake. An empty family roster is never
 * consent. This port needs its own signed password/TOTP original, actual
 * session enrollment, independent zero-roster SQL frame and exact physical
 * transaction adoption. No peer/family DTO or caller identity verdict accepted.
 * No runtime adapter, post-Auth permission, deletion or grants are installed.
 */
export function createOuchiOwnerOnlyClaimPort(input:Options){
 const fixed={...input},scope=normalizeSharedDeletionScope(input.scope),scopeText=JSON.stringify(scope),key=Buffer.from(input.key),clock=input.clock??Date.now;
 const own=scope.apps.find(a=>a.app==='ouchi-maintenance');
 if(!own||!uuid(input.nativeLease)||!/[a-z]{20}/.test(input.projectID)||input.projectID.length!==20||!(input.key instanceof Uint8Array)||key.length<32||key.length>64||typeof input.getUser!=='function'||typeof input.policyReader?.isCurrent!=='function')throw Error('Independent Ouchi owner providers required');
 const args=[scope.requestID,scope.leaseToken,scopeText,fixed.nativeLease];
 const sign=(p:Payload)=>createHmac('sha256',key).update(domain+'\n'+canonical(p)).digest('hex');
 const fingerprint=(p:{payload:Payload;signature:string})=>createHash('sha256').update(p.signature+canonical(p.payload)).digest('hex');
 const matches=(v:unknown)=>{try{return JSON.stringify(normalizeSharedDeletionScope(v))===scopeText;}catch{return false;}};
 const caps=new WeakMap<object,{tx:Tx;pid:number;xid:string;proof:string}>(),issueChecks=new WeakMap<Tx,string>();
 async function frame(tx:Tx){
  if(!(tx?.signal instanceof AbortSignal)||typeof tx.beforeCommit!=='function'||typeof tx.query!=='function')throw Error('Checked physical owner transaction required');
  tx.signal.throwIfAborted();const rows=(await tx.query(OUCHI_OWNER_FRAME_SQL,args)).rows;tx.signal.throwIfAborted();
  if(rows.length!==1)throw Error('Independent zero-family frame refused');const r=rows[0];
  if(Object.keys(r).sort().join(',')!=='backend_pid,status,transaction_id'||!['requested','processing'].includes(String(r.status))||!Number.isSafeInteger(r.backend_pid)||Number(r.backend_pid)<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id))throw Error('Unknown physical owner frame');
  return {status:String(r.status),pid:Number(r.backend_pid),xid:r.transaction_id};
 }
 async function policy(tx:Tx){
  const p=await fixed.policyReader(tx.signal);tx.signal.throwIfAborted();
  const valid=(v:unknown)=>v===null||(Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=315360000);
  if(!p||p.projectID!==fixed.projectID||p.authVersion!=='v2.197.0'||p.assuranceMode!=='highest-current-aal/v1'||p.singleSession!==false||p.totpVerify!==true||!valid(p.timeboxSeconds)||!valid(p.inactivitySeconds)||!fixed.policyReader.isCurrent(p))throw Error('Current owner policy required');return p;
 }
 async function auth(tx:Tx,sessionID:string,passwordAt:number,authenticatedAt:number){
  const p=await policy(tx);
  const rows=(await tx.query(OUCHI_OWNER_AUTH_SQL,[...args,sessionID,passwordAt,authenticatedAt,p.timeboxSeconds,p.inactivitySeconds])).rows;tx.signal.throwIfAborted();
  if(!fixed.policyReader.isCurrent(p)||rows.length!==1)throw Error('Current owner Auth required');const r=rows[0],at=Number(r.checked_at),now=clock();
  if(Object.keys(r).sort().join(',')!=='auth_state_digest,checked_at,epoch_id'||typeof r.auth_state_digest!=='string'||!/^[a-f0-9]{64}$/.test(r.auth_state_digest)||r.epoch_id!==own!.scopeID||!uuid(r.epoch_id)||!Number.isSafeInteger(at)||at<=0||at>now||now-at>=60000||Math.min(passwordAt,authenticatedAt)+600000<=now)throw Error('Owner identity or actual enrollment changed');
  return {digest:r.auth_state_digest,epochID:r.epoch_id,policy:p};
 }
 async function bearer(token:string,tx:Tx){
  await frame(tx);const p=await policy(tx),first=await fixed.getUser(token,tx.signal);tx.signal.throwIfAborted();
  if(first.error||!first.data.user||first.data.user.id!==scope.userID||first.data.user.is_anonymous===true||!fixed.policyReader.isCurrent(p))throw Error('Verified original owner bearer required');
  const session=sessionAfterAuthVerification(token,scope.userID,new Date(clock()));if(!session)throw Error('Current owner bearer required');
  const c=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')),now=clock();
  if(c.iss!=='https://'+fixed.projectID+'.supabase.co/auth/v1'||c.role!=='authenticated'||!(Array.isArray(c.aud)?c.aud:[c.aud]).includes('authenticated')||c.is_anonymous!==false||c.aal!=='aal2'||!Number.isSafeInteger(c.iat)||c.iat<=0||c.iat*1000>now+60000||c.exp<=c.iat||(c.nbf!==undefined&&(!Number.isSafeInteger(c.nbf)||c.nbf*1000>now+60000))||!Array.isArray(c.amr)||c.amr.length>16)throw Error('Signed owner password/TOTP required');
  const at=(method:string)=>{const rows=c.amr.filter((m:{method?:unknown;timestamp?:unknown})=>m?.method===method&&Number.isSafeInteger(m.timestamp)&&Number(m.timestamp)>0&&Number(m.timestamp)*1000<=now&&Number(m.timestamp)*1000>now-600000);if(rows.length!==1)throw Error('Exact recent AMR required');return Number(rows[0].timestamp)*1000;};
  const passwordAt=at('password'),authenticatedAt=at('totp'),live=await auth(tx,session.sessionID,passwordAt,authenticatedAt);
  const final=await fixed.getUser(token,tx.signal);tx.signal.throwIfAborted();
  if(final.error||final.data.user?.id!==scope.userID||final.data.user.is_anonymous===true||!fixed.policyReader.isCurrent(p)||!sessionAfterAuthVerification(token,scope.userID,new Date(clock()))||Math.min(passwordAt,authenticatedAt)+600000<=clock())throw Error('Owner bearer changed');
  const payload:Payload={domain,scope:normalizeSharedDeletionScope(scope),userID:scope.userID,nativeLease:fixed.nativeLease,sessionID:session.sessionID,epochID:live.epochID,aal:'aal2',passwordAt,authenticatedAt,authStateDigest:live.digest,expiresAt:Math.min(passwordAt,authenticatedAt)+600000};
  return {payload,signature:sign(payload),policy:live.policy};
 }
 async function readCurrent(tx:Tx){
  await frame(tx);const rows=(await tx.query(OUCHI_OWNER_READ_SQL,args)).rows;tx.signal.throwIfAborted();
  if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='payload,signature')throw Error('Private owner original required');
  const payload=rows[0].payload as Payload,signature=rows[0].signature;
  if(!payload||Object.keys(payload).sort().join(',')!==[...fields].sort().join(',')||payload.domain!==domain||!matches(payload.scope)||payload.userID!==scope.userID||payload.nativeLease!==fixed.nativeLease||!uuid(payload.sessionID)||payload.epochID!==own!.scopeID||payload.aal!=='aal2'||typeof payload.authStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(payload.authStateDigest)||![payload.passwordAt,payload.authenticatedAt,payload.expiresAt].every(n=>Number.isSafeInteger(n)&&n>0)||payload.expiresAt!==Math.min(payload.passwordAt,payload.authenticatedAt)+600000||payload.expiresAt<=clock()||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(payload),'hex')))throw Error('Independent signed owner original required');
  const live=await auth(tx,payload.sessionID,payload.passwordAt,payload.authenticatedAt);
  if(live.digest!==payload.authStateDigest||live.epochID!==payload.epochID)throw Error('Original owner identity changed');return {payload,signature};
 }
 return Object.freeze({
  /** Read-only, hook-free processing check. The owning transaction must call
   * this again in its beforeCommit check. It requires the original live Auth
   * session and start freshness; it is never historical/logout authority.
   */
  async verifyProcessingOriginal(value:unknown,tx:Tx){
   try{
    if(!matches(value))return false;
    const pin=await frame(tx);if(pin.status!=='processing')return false;
    const proof=fingerprint(await readCurrent(tx)),middle=await frame(tx);
    if(middle.status!=='processing'||middle.pid!==pin.pid||middle.xid!==pin.xid)return false;
    if(fingerprint(await readCurrent(tx))!==proof)return false;
    const final=await frame(tx);
    return final.status==='processing'&&final.pid===pin.pid&&final.xid===pin.xid;
   }catch{return false;}
  },
  async issue(token:string,tx:Tx){
   if((await frame(tx)).status!=='requested')throw Error('Requested-only owner issuance required');
   const original=await bearer(token,tx),saved=(await tx.query(OUCHI_OWNER_RECORD_SQL,[...args,canonical(original.payload),original.signature,original.policy.timeboxSeconds,original.policy.inactivitySeconds])).rows;
   if(saved.length!==1||saved[0].ok!==true)throw Error('Immutable owner issuance refused');
   const proof=fingerprint(await readCurrent(tx)),prior=issueChecks.get(tx);if(prior!==undefined&&prior!==proof)throw Error('Owner original changed');
   if(prior===undefined){tx.beforeCommit('ouchi-owner-issue:'+scope.requestID,async()=>{try{return (await frame(tx)).status==='requested'&&fingerprint(await bearer(token,tx))===proof&&fingerprint(await readCurrent(tx))===proof;}catch{return false;}});issueChecks.set(tx,proof);}
   return Object.freeze({status:'accepted' as const,expiresAt:original.payload.expiresAt});
  },
  async requested(value:unknown,tx:Tx){
   try{if(!matches(value))return null;const pin=await frame(tx);if(pin.status!=='requested')return null;
    const proof=fingerprint(await readCurrent(tx)),last=await frame(tx);if(last.status!=='requested'||last.pid!==pin.pid||last.xid!==pin.xid)return null;
    const cap=Object.freeze({kind:'ouchi-owner-only-capability' as const});caps.set(cap,{tx,...pin,proof});return cap;
   }catch{return null;}
  },
  async adopted(value:unknown,cap:unknown,tx:Tx){
   try{if(!matches(value)||!cap||typeof cap!=='object')return false;const original=caps.get(cap);if(!original||original.tx!==tx)return false;
    const pin=await frame(tx);if(pin.status!=='processing'||pin.pid!==original.pid||pin.xid!==original.xid||fingerprint(await readCurrent(tx))!==original.proof)return false;
    const final=await frame(tx);return final.status==='processing'&&final.pid===original.pid&&final.xid===original.xid;
   }catch{return false;}
  }
 });
}
