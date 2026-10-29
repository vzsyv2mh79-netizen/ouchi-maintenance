import {createHmac,timingSafeEqual} from 'node:crypto';
import {createScopedSharedConsentIdentityVerifier,SCOPED_SHARED_CONSENT_AUTH_SQL,SCOPED_SHARED_CONSENT_DOMAIN} from './scoped-shared-consent-identity';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
type IdentityOptions=Parameters<typeof createScopedSharedConsentIdentityVerifier>[0];
type Tx=Parameters<ReturnType<typeof createScopedSharedConsentIdentityVerifier>>[1];
type Options=Omit<IdentityOptions,'requestID'|'homeID'>&{key:Uint8Array;scope:unknown;generationID:string;homes:{homeID:string;successorID:string}[];verifyNoDispatch:(scope:unknown,tx:Tx,signal:AbortSignal)=>Promise<boolean>};
export const GENERATION_FAMILY_AUTH_SQL='select * from maintenance_private.generation_family_auth($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::bigint,$10::uuid)';
export const GENERATION_FAMILY_RECORD_SQL='select maintenance_private.record_generation_family_original($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text,$8::bigint,$9::bigint) as ok';
export const GENERATION_FAMILY_READ_SQL='select * from maintenance_private.read_generation_family_original($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6::bigint)';
export const GENERATION_FAMILY_FRAME_SQL='select * from maintenance_private.generation_family_original_frame($1::uuid,$2::jsonb,$3::uuid,$4::jsonb)';
export const GENERATION_FAMILY_CLAIM_SQL='select * from maintenance_private.generation_family_bound_claim_frame($1::uuid,$2::jsonb,$3::uuid,$4::jsonb)';
export const GENERATION_FAMILY_ORIGINAL_DOMAIN='OuchiMaintenance/family-generation-original/v1';
const fields=['domain','requestID','generationID','homeID','userID','epochID','sessionID','aal','authenticatedAt','authStateDigest','proofDomain','expiresAt'] as const;
type Payload={domain:string;requestID:string;generationID:string;homeID:string;userID:string;epochID:string;sessionID:string;aal:'aal2';authenticatedAt:number;authStateDigest:string;proofDomain:string;expiresAt:number};
type Proof={payload:Readonly<Payload>;signature:string};
const canonical=(p:Payload)=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000';
const duration=(x:unknown)=>x===null||(Number.isSafeInteger(x)&&Number(x)>0&&Number(x)<=315360000);
/** Disabled fixed-generation originals and claim port. It never hands off,
 * captures canonical inventory, logs out or erases anything. New signatures
 * cannot be relabeled legacy originals; real strict Auth and current policy
 * are checked around actual immutable issuance and formal root claim. */
export function createGenerationFamilyOriginals(options:Options){
 const input={...options};
 const s=normalizeSharedDeletionScope(input.scope),text=JSON.stringify(s),generationID=input.generationID,nativeLease=input.nativeLease;
 if(!uuid(generationID)||!uuid(nativeLease)||nativeLease===s.leaseToken||!(input.key instanceof Uint8Array)||input.key.length<32||!Array.isArray(input.homes)||!input.homes.length||input.homes.length>100||typeof input.verifyNoDispatch!=='function')throw Error('Exact generation originals and independent coverage required');
 const homes=input.homes.map(h=>{if(!h||Object.keys(h).sort().join(',')!=='homeID,successorID'||!uuid(h.homeID)||!uuid(h.successorID)||h.successorID===s.userID)throw Error('Complete family targets required');return Object.freeze({...h});}).sort((a,b)=>a.homeID.localeCompare(b.homeID));
 if(new Set(homes.map(h=>h.homeID)).size!==homes.length)throw Error('Duplicate original home');
 const roster=JSON.stringify(homes),secret=Buffer.from(input.key),clock=input.clock??Date.now;
 const ports=new Map(homes.map(h=>[h.homeID,createScopedSharedConsentIdentityVerifier({projectID:input.projectID,requestID:s.requestID,homeID:h.homeID,nativeLease,policyReader:input.policyReader,getUser:input.getUser,clock})]));
 const matches=(v:unknown)=>{try{return JSON.stringify(normalizeSharedDeletionScope(v))===text;}catch{return false;}};
 const checked=(tx:Tx)=>{if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked original transaction required');tx.signal.throwIfAborted();};
 const args=[generationID,text,nativeLease,roster];
 const sign=(p:Payload)=>createHmac('sha256',secret).update(GENERATION_FAMILY_ORIGINAL_DOMAIN+'\n'+canonical(p)).digest('hex');
 const allowed=(homeID:string,actor:string)=>homes.some(h=>h.homeID===homeID&&(actor===s.userID||actor===h.successorID));
 async function policy(tx:Tx){const p=await input.policyReader(tx.signal);tx.signal.throwIfAborted();if(!p||p.projectID!==input.projectID||p.authVersion!=='v2.197.0'||p.assuranceMode!=='highest-current-aal/v1'||p.singleSession!==false||p.totpVerify!==true||!duration(p.timeboxSeconds)||!duration(p.inactivitySeconds)||!input.policyReader.isCurrent(p))throw Error('Current original Auth policy required');return p;}
 async function frame(tx:Tx,phase:'requested'|'processing'|'either',claim=false){checked(tx);const rows=(await tx.query(claim?GENERATION_FAMILY_CLAIM_SQL:GENERATION_FAMILY_FRAME_SQL,args)).rows;tx.signal.throwIfAborted();const r=rows[0];if(rows.length!==1||Object.keys(r).sort().join(',')!=='backend_pid,status,transaction_id'||(phase==='either'?!['requested','processing'].includes(String(r.status)):r.status!==phase)||!Number.isSafeInteger(r.backend_pid)||Number(r.backend_pid)<=0||typeof r.transaction_id!=='string'||!/^[1-9][0-9]*$/.test(r.transaction_id))return null;return {pid:Number(r.backend_pid),xid:r.transaction_id};}
 const same=(a:{pid:number;xid:string}|null,b:{pid:number;xid:string}|null)=>!!a&&!!b&&a.pid===b.pid&&a.xid===b.xid;
 function validate(row:Record<string,unknown>,homeID:string,actor:string):Proof{
  const p=row.payload as Payload,sig=row.signature;
  if(Object.keys(row).sort().join(',')!=='payload,signature'||!p||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.domain!==GENERATION_FAMILY_ORIGINAL_DOMAIN||p.requestID!==s.requestID||p.generationID!==generationID||p.homeID!==homeID||p.userID!==actor||!allowed(homeID,actor)||![p.requestID,p.generationID,p.homeID,p.userID,p.epochID,p.sessionID].every(uuid)||p.aal!=='aal2'||p.proofDomain!==SCOPED_SHARED_CONSENT_DOMAIN||!/^[a-f0-9]{64}$/.test(p.authStateDigest)||!Number.isSafeInteger(p.authenticatedAt)||p.authenticatedAt<=0||p.authenticatedAt>clock()||p.expiresAt!==p.authenticatedAt+600000||p.expiresAt<=clock()||typeof sig!=='string'||!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(sign(p),'hex')))throw Error('Independent exact generation original required');
  return Object.freeze({payload:Object.freeze({...p}),signature:sig});
 }
 async function read(homeID:string,actor:string,tx:Tx){checked(tx);if(!allowed(homeID,actor))return null;const pin=await frame(tx,'either');if(!pin||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return null;const settings=await policy(tx);const rows=(await tx.query(GENERATION_FAMILY_READ_SQL,[generationID,homeID,actor,nativeLease,settings.timeboxSeconds,settings.inactivitySeconds])).rows;tx.signal.throwIfAborted();if(!input.policyReader.isCurrent(settings)||rows.length!==1||!same(pin,await frame(tx,'either'))||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return null;return validate(rows[0],homeID,actor);}
 async function identity(bearer:string,homeID:string,tx:Tx){const strict=ports.get(homeID);if(!strict)throw Error('Unknown generation home');let epoch:string|null=null;
  const value=await strict(bearer,{signal:tx.signal,beforeCommit:()=>{throw Error('Unexpected generation identity hook');},query:async(sql,values)=>{if(sql!==SCOPED_SHARED_CONSENT_AUTH_SQL)throw Error('Unexpected generation identity query');const result=await tx.query(GENERATION_FAMILY_AUTH_SQL,[...values,generationID]);const rows=result.rows;
   if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='auth_state_digest,authenticated_at,checked_at,epoch_id'||!uuid(rows[0].epoch_id))return {rows:[]};epoch=rows[0].epoch_id;return {rows:[{auth_state_digest:rows[0].auth_state_digest,authenticated_at:rows[0].authenticated_at,checked_at:rows[0].checked_at}]};}});
  return value&&epoch&&allowed(homeID,value.userID)?{...value,epochID:epoch}:null;
 }
 type Entry={homeID:string;actor:string;bearer:string;proof:Proof};
 const issues=new WeakMap<Tx,{failed:boolean;pin:{pid:number;xid:string}|null;entries:Map<string,Entry>}>();
 async function issue(bearer:string,homeID:string,tx:Tx){checked(tx);let state=issues.get(tx);if(!state){state={failed:false,pin:null,entries:new Map()};issues.set(tx,state);const current=state;tx.beforeCommit('generation-family-issue:'+generationID,async()=>{if(current.failed||!current.pin||!current.entries.size)return false;try{if(!same(current.pin,await frame(tx,'requested'))||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return false;for(const e of current.entries.values()){const i=await identity(e.bearer,e.homeID,tx),p=await read(e.homeID,e.actor,tx);if(!i||!p||i.epochID!==p.payload.epochID||i.sessionID!==p.payload.sessionID||i.authenticatedAt!==p.payload.authenticatedAt||i.authStateDigest!==p.payload.authStateDigest||p.signature!==e.proof.signature)return false;}return await input.verifyNoDispatch(s,tx,tx.signal)===true&&same(current.pin,await frame(tx,'requested'));}catch{return false;}});}
  if(state.failed)throw Error('Original issuance transaction poisoned');try{
   const pin=await frame(tx,'requested');if(!pin||state.pin&&!same(pin,state.pin)||await input.verifyNoDispatch(s,tx,tx.signal)!==true)throw Error('Exact requested original frame required');state.pin=pin;
   const i=await identity(bearer,homeID,tx);if(!i)throw Error('Real current generation AAL2 required');const settings=await policy(tx);
   const p:Payload={domain:GENERATION_FAMILY_ORIGINAL_DOMAIN,requestID:s.requestID,generationID,homeID,userID:i.userID,epochID:i.epochID,sessionID:i.sessionID,aal:'aal2',authenticatedAt:i.authenticatedAt,authStateDigest:i.authStateDigest,proofDomain:i.proofDomain,expiresAt:i.authenticatedAt+600000};
   const signature=sign(p);const result=await tx.query(GENERATION_FAMILY_RECORD_SQL,[generationID,homeID,i.userID,i.sessionID,nativeLease,p,signature,settings.timeboxSeconds,settings.inactivitySeconds]);if(result.rows.length!==1||result.rows[0].ok!==true||!input.policyReader.isCurrent(settings))throw Error('Requested-only immutable original issuance required');
   const saved=await read(homeID,i.userID,tx);if(!saved||saved.signature!==signature||canonical(saved.payload)!==canonical(p))throw Error('Exact original readback required');state.entries.set(homeID+':'+i.userID,{homeID,actor:i.userID,bearer,proof:saved});return saved;
  }catch(e){state.failed=true;throw e;}
 }
 async function fingerprint(tx:Tx){const out=[];for(const h of homes)for(const actor of [s.userID,h.successorID]){const p=await read(h.homeID,actor,tx);if(!p)return null;out.push([h.homeID,actor,p.signature,p.payload]);}return JSON.stringify(out);}
 const caps=new WeakMap<object,{tx:Tx;pin:{pid:number;xid:string};fingerprint:string}>();
 return Object.freeze({issue,readOriginal:read,
  async requested(value:unknown,tx:Tx){if(!matches(value))return null;const pin=await frame(tx,'requested',true);if(!pin||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return null;const f=await fingerprint(tx);if(f===null||!same(pin,await frame(tx,'requested',true))||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return null;const cap=Object.freeze({kind:'generation-family-original-capability' as const});caps.set(cap,{tx,pin,fingerprint:f});return cap;},
  async adopted(value:unknown,cap:unknown,tx:Tx){if(!matches(value)||!cap||typeof cap!=='object')return false;const first=caps.get(cap);if(!first||first.tx!==tx||!same(first.pin,await frame(tx,'processing',true))||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return false;return await fingerprint(tx)===first.fingerprint&&same(first.pin,await frame(tx,'processing',true))&&await input.verifyNoDispatch(s,tx,tx.signal)===true;},
  async verifyProcessingOriginal(value:unknown,tx:Tx){if(!matches(value))return false;const pin=await frame(tx,'processing',true);if(!pin||await input.verifyNoDispatch(s,tx,tx.signal)!==true)return false;return await fingerprint(tx)!==null&&same(pin,await frame(tx,'processing',true))&&await input.verifyNoDispatch(s,tx,tx.signal)===true;}
 });
}
