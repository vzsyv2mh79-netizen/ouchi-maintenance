import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createPreparedScopedSharedConsent} from './prepared-scoped-shared-consent';
import {SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';
import {handoffPlanDigest} from './home-handoff-consent.mjs';
import {createFamilyAttachmentInventoryConsent} from './family-attachment-inventory-consent.mjs';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';

type Base=Parameters<typeof createPreparedScopedSharedConsent>[0];
type Tx=Parameters<ReturnType<typeof createPreparedScopedSharedConsent>['issue']>[1];
type Options=Base&{scope:unknown;plan:Record<string,unknown>;householdKey:Uint8Array;transaction:<T>(work:(tx:Tx)=>Promise<T>,signal:AbortSignal)=>Promise<T>};
const fields=['requestID','homeID','userID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'] as const;
type Payload={requestID:string;homeID:string;userID:string;sessionID:string;aal:'aal2';authenticatedAt:number;authStateDigest:string;proofDomain:string;expiresAt:number};
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const householdDomain='OuchiMaintenance/shared-family-handoff/v1';
export const INITIAL_FAMILY_PIN_SQL='select maintenance_private.pin_initial_family_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid) as ok';
export const INITIAL_FAMILY_CURRENT_SQL='select * from maintenance_private.current_initial_family_identity($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,$7::bigint)';
export const INITIAL_HOUSEHOLD_ORIGIN_SQL='select * from maintenance_private.read_initial_household_origin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)';
export const INITIAL_HOUSEHOLD_RECORD_SQL='select maintenance_private.record_initial_household_consent($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::uuid,$9::bigint,$10::bigint) as ok';
export const INITIAL_FAMILY_ACTIVATION_SQL='select * from maintenance_private.read_initial_family_activation($1::uuid,$2::uuid,$3::uuid,$4::uuid)';

/** Disabled app-owned initial providers. Both consent kinds derive from the
 * SAME independently signed prepared original plus actual session enrollment.
 * Legacy-format household proofs get immutable original/epoch/hash provenance;
 * old proofs without that provenance are refused, never relabeled or migrated.
 * No raw Auth access, clock-as-authentication, supplied identity verdict or
 * processing worker change. All keys/transactions remain trusted server ports.
 */
export function createInitialFamilyConsentProviders(input:Options){
 const fixed={...input},scope=normalizeSharedDeletionScope(input.scope),plan=JSON.parse(JSON.stringify(input.plan)),digest=handoffPlanDigest(scope,plan);
 if(scope.requestID!==fixed.requestID||plan.householdID!==fixed.homeID||!uuid(plan.successorID)||!(input.householdKey instanceof Uint8Array)||input.householdKey.length<32||typeof input.transaction!=='function')throw Error('Fixed original family provider required');
 const actors=[scope.userID,String(plan.successorID)],secret=Buffer.from(input.key),householdKey=Buffer.from(input.householdKey),clock=input.clock??Date.now;
 const prepared=createPreparedScopedSharedConsent(fixed),checks=new WeakMap<Tx,Map<string,string>>();
 const args=(actor:string)=>[fixed.requestID,fixed.homeID,actor,fixed.rootLease,fixed.nativeLease];
 const frame=[fixed.requestID,fixed.homeID,fixed.rootLease,fixed.nativeLease];
 async function pin(tx:Tx){tx.signal.throwIfAborted();if((await tx.query(INITIAL_FAMILY_PIN_SQL,frame)).rows[0]?.ok!==true)throw Error('Original root-first family frame required');}
 async function transaction<T>(work:(tx:Tx)=>Promise<T>,signal:AbortSignal){return fixed.transaction(async tx=>{if(typeof tx.beforeCommit!=='function')throw Error('Pinned initial issuer transaction required');await pin(tx);return work(tx);},signal);}
 async function settings(tx:Tx){
  const p=await fixed.policyReader(tx.signal);tx.signal.throwIfAborted();
  const duration=(v:unknown)=>v===null||(Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=315360000);
  if(!p||p.projectID!==fixed.projectID||p.authVersion!=='v2.197.0'||p.assuranceMode!=='highest-current-aal/v1'||p.singleSession!==false||p.totpVerify!==true||!duration(p.timeboxSeconds)||!duration(p.inactivitySeconds)||!fixed.policyReader.isCurrent(p))throw Error('Current original policy required');return p;
 }
 function original(row:Record<string,unknown>){
  const p=row.payload as Payload,s=row.signature;
  if(!p||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.requestID!==fixed.requestID||p.homeID!==fixed.homeID||!actors.includes(p.userID)||![p.requestID,p.homeID,p.userID,p.sessionID].every(uuid)||p.aal!=='aal2'||p.proofDomain!==SCOPED_SHARED_CONSENT_DOMAIN||typeof p.authStateDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||!Number.isSafeInteger(p.authenticatedAt)||p.authenticatedAt<=0||!Number.isSafeInteger(p.expiresAt)||p.expiresAt!==p.authenticatedAt+600000||typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw Error('Independent original family proof required');
  const signed=createHmac('sha256',secret).update('OuchiMaintenance/original-scoped-consent/v1\n'+canonical(p)).digest('hex');
  if(!timingSafeEqual(Buffer.from(signed,'hex'),Buffer.from(s,'hex')))throw Error('Original family signature mismatch');return {payload:p,signature:s};
 }
 async function origin(actor:string,tx:Tx){
  tx.signal.throwIfAborted();const rows=(await tx.query(INITIAL_HOUSEHOLD_ORIGIN_SQL,args(actor))).rows;tx.signal.throwIfAborted();
  if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='existing_token,origin_epoch,origin_signature,payload,plan_digest,revoked_at,signature,token_hash')throw Error('Private household original required');
  const row=rows[0],proof=original(row);if(proof.payload.userID!==actor||row.plan_digest!==digest)throw Error('Foreign household original');return {row,...proof};
 }
 async function current(actor:string,tx:Tx){
  await pin(tx);const first=await origin(actor,tx),policy=await settings(tx);
  const rows=(await tx.query(INITIAL_FAMILY_CURRENT_SQL,[...args(actor),policy.timeboxSeconds,policy.inactivitySeconds])).rows;tx.signal.throwIfAborted();
  if(!fixed.policyReader.isCurrent(policy)||rows.length!==1)throw Error('Current original epoch identity required');
  const r=rows[0],checkedAt=Number(r.checked_at),p=first.payload;
  if(Object.keys(r).sort().join(',')!=='auth_state_digest,authenticated_at,checked_at,epoch_id'||!uuid(r.epoch_id)||r.auth_state_digest!==p.authStateDigest||Number(r.authenticated_at)!==p.authenticatedAt||!Number.isSafeInteger(checkedAt)||checkedAt<=0||checkedAt>clock()||clock()-checkedAt>=60000||p.expiresAt<=clock())throw Error('Original Auth/enrollment binding changed');
  return {...first,epochID:String(r.epoch_id),checkedAt,policy};
 }
 function household(record:Awaited<ReturnType<typeof origin>>,at:number,requireLive=true){
  const {row,payload:p,signature}=record,token=row.existing_token;
  if(typeof token!=='string'||token.length>8192||row.origin_signature!==signature||!uuid(row.origin_epoch)||row.token_hash!==hash(token)||(requireLive&&row.revoked_at!==null))throw Error('Unbound legacy household proof refused');
  const parts=token.split('.');if(parts.length!==2||parts.some(v=>!/^[A-Za-z0-9_-]+$/.test(v)))throw Error('Invalid original household proof');
  const body=Buffer.from(parts[0],'base64url'),sig=Buffer.from(parts[1],'base64url'),expected=createHmac('sha256',householdKey).update(householdDomain+'\n'+parts[0]).digest();
  if(body.toString('base64url')!==parts[0]||sig.toString('base64url')!==parts[1]||sig.length!==expected.length||!timingSafeEqual(sig,expected))throw Error('Household signature mismatch');
  const c=JSON.parse(body.toString('utf8'));
  if(Object.keys(c).sort().join(',')!=='acceptedAt,actorID,authVerifiedAt,expiresAt,planDigest,purpose,role'||c.purpose!==householdDomain||c.planDigest!==digest||c.actorID!==p.userID||c.role!==(p.userID===scope.userID?'owner':'successor')||c.authVerifiedAt!==p.authenticatedAt||!Number.isSafeInteger(c.acceptedAt)||c.acceptedAt<p.authenticatedAt||c.acceptedAt>at||c.expiresAt!==c.acceptedAt+900000||c.expiresAt<=at||p.expiresAt<=at)throw Error('Household proof is not the same original');return c;
 }
 const identityValue=(c:Awaited<ReturnType<typeof current>>)=>Object.freeze({userID:c.payload.userID,epochID:c.epochID,sessionID:c.payload.sessionID,aal:'aal2' as const,authenticatedAt:c.payload.authenticatedAt,checkedAt:c.checkedAt,authStateDigest:c.payload.authStateDigest,proofDomain:c.payload.proofDomain});
 const fingerprint=(c:Awaited<ReturnType<typeof current>>)=>JSON.stringify([c.signature,c.epochID,c.row.existing_token,c.payload]);
 async function inventoryIdentity(bearer:string,tx:Tx,signal:AbortSignal){
  signal.throwIfAborted();await pin(tx);const issued=await prepared.issue(bearer,tx),c=await current(issued.payload.userID,tx);household(c,clock());
  if(c.row.origin_epoch!==c.epochID)throw Error('Household epoch changed');
  const actors=checks.get(tx)??new Map<string,string>(),key=fingerprint(c),prior=actors.get(c.payload.userID);
  if(prior!==undefined&&prior!==key)throw Error('Initial identity changed');
  if(prior===undefined){tx.beforeCommit('initial-family:'+fixed.requestID+':'+fixed.homeID+':'+c.payload.userID,async()=>{try{const final=await current(c.payload.userID,tx);household(final,clock());return fingerprint(final)===key;}catch{return false;}});actors.set(c.payload.userID,key);checks.set(tx,actors);}
  return identityValue(c);
 }
 async function verifyInventoryActor(tx:Tx,c:Record<string,unknown>,signal:AbortSignal){
  try{signal.throwIfAborted();if(c.purpose!=='OuchiMaintenance/family-attachment-inventory/v2'||typeof c.actorID!=='string'||!actors.includes(c.actorID))return false;
   const live=await current(c.actorID,tx);household(live,clock());return live.row.origin_epoch===live.epochID&&c.epochID===live.epochID&&c.sessionID===live.payload.sessionID&&c.aal==='aal2'&&c.authStateDigest===live.payload.authStateDigest&&c.authenticatedAt===live.payload.authenticatedAt;
  }catch{return false;}
 }
 async function verifyHouseholdOrigins(tx:Tx){try{for(const actor of actors){const c=await current(actor,tx);household(c,clock());if(c.row.origin_epoch!==c.epochID)return false;}return true;}catch{return false;}}
 async function verifyCommittedOrigins(tx:Tx,inputScope:Record<string,unknown>,signal:AbortSignal){
  try{signal.throwIfAborted();if(inputScope.requestID!==fixed.requestID||inputScope.homeID!==fixed.homeID)return false;
   const rows=(await tx.query(INITIAL_FAMILY_ACTIVATION_SQL,frame)).rows;if(rows.length!==1)return false;
   const r=rows[0],at=Number(r.activated_at_ms);if(!Number.isSafeInteger(at)||at<=0||at>clock()||!Array.isArray(r.household_consents)||!Array.isArray(r.inventory_consents)||r.household_consents.length!==2||r.inventory_consents.length!==2)return false;
   for(const actor of actors){const c=await origin(actor,tx);household(c,at,false);
    const hh=r.household_consents.filter((v:Record<string,unknown>)=>v.actor_id===actor&&v.token===c.row.existing_token&&v.revoked_at===null);
    const inv=r.inventory_consents.filter((v:Record<string,unknown>)=>v.actorID===actor&&v.revokedAt===null);if(hh.length!==1||inv.length!==1)return false;
    // The mandatory base inventory verifier authenticates this exact token
    // before this additional cross-domain original correspondence is checked.
    const v=JSON.parse(Buffer.from(String(inv[0].token).split('.')[0],'base64url').toString('utf8'));
    if(v.sessionID!==c.payload.sessionID||v.epochID!==c.row.origin_epoch||v.authStateDigest!==c.payload.authStateDigest||v.authenticatedAt!==c.payload.authenticatedAt||v.aal!=='aal2')return false;
   }signal.throwIfAborted();return true;
  }catch{return false;}
 }
 return Object.freeze({transaction,inventoryIdentity,verifyInventoryActor,verifyHouseholdOrigins,verifyCommittedOrigins,
  identifyActor:async(bearer:string,signal:AbortSignal)=>{const r=await fixed.getUser(bearer,signal);signal.throwIfAborted();return !r.error&&r.data.user&&actors.includes(r.data.user.id)?r.data.user.id:null;},
  async issueHousehold(bearer:string,signal:AbortSignal){
   try{return await transaction(async tx=>{
    const issued=await prepared.issue(bearer,tx),c=await current(issued.payload.userID,tx);let token=c.row.existing_token;
    if(token!==null){household(c,clock());if(c.row.origin_epoch!==c.epochID)throw Error('Original household epoch mismatch');}
    else{const p={purpose:householdDomain,planDigest:digest,actorID:c.payload.userID,role:c.payload.userID===scope.userID?'owner':'successor',acceptedAt:c.checkedAt,authVerifiedAt:c.payload.authenticatedAt,expiresAt:c.checkedAt+900000};const body=Buffer.from(JSON.stringify(p)).toString('base64url');token=body+'.'+createHmac('sha256',householdKey).update(householdDomain+'\n'+body).digest('base64url');}
    if((await tx.query(INITIAL_HOUSEHOLD_RECORD_SQL,[...args(c.payload.userID),token,c.signature,c.epochID,c.policy.timeboxSeconds,c.policy.inactivitySeconds])).rows[0]?.ok!==true)throw Error('Atomic original household provenance required');
    const saved=await current(c.payload.userID,tx),claim=household(saved,clock()),key=fingerprint(saved);
    tx.beforeCommit('initial-household:'+fixed.requestID+':'+fixed.homeID+':'+c.payload.userID,async()=>{try{const last=await current(c.payload.userID,tx);household(last,clock());return fingerprint(last)===key;}catch{return false;}});
    return {status:'accepted',expiresAt:claim.expiresAt};
   },signal);}catch{return {status:'unconfirmed'};}
  },
  createInventoryConsent(options:Parameters<typeof createFamilyAttachmentInventoryConsent>[0]){
   const base=createFamilyAttachmentInventoryConsent({...options,store:{...options.store,transaction},identifyActor:async(bearer:string,signal:AbortSignal)=>{const r=await fixed.getUser(bearer,signal);signal.throwIfAborted();return !r.error&&r.data.user&&actors.includes(r.data.user.id)?r.data.user.id:null;},verifyIdentity:inventoryIdentity,verifyActor:verifyInventoryActor,currentAuthority:async(...args)=>await verifyHouseholdOrigins(args[0])&&await options.currentAuthority(...args)});
   return Object.freeze({...base,authorizeCommittedActivation:async(tx:Tx,s:Record<string,unknown>,signal:AbortSignal)=>await base.authorizeCommittedActivation(tx,s,signal)&&await verifyCommittedOrigins(tx,s,signal)});
  }
 });
}
