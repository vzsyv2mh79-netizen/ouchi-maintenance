import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {createOuchiFamilyPreparationGeneration} from './ouchi-family-preparation-generation.mjs';
import {createOuchiFamilyNativePreparation} from './ouchi-family-native-preparation.mjs';
export const RETENTION_INSPECT_SQL='select * from maintenance_private.inspect_generation_retention($1::uuid,$2::jsonb,$3::uuid,$4::jsonb)';
export const RETENTION_RECORD_SQL='select maintenance_private.record_generation_retention_certificate($1::uuid,$2::jsonb,$3::uuid,$4::jsonb,$5::jsonb,$6::text) as ok';
export const RETENTION_READ_SQL='select * from maintenance_private.read_generation_retention_certificate($1::uuid,$2::jsonb,$3::uuid,$4::jsonb)';
export const RETENTION_ADMIT_SQL='select maintenance_private.admit_generation_retention($1::uuid,$2::jsonb,$3::uuid,$4::jsonb) as ok';
export const RETENTION_VERIFY_SQL='select * from maintenance_private.verify_generation_retention_admission($1::uuid,$2::jsonb,$3::uuid,$4::jsonb)';
export const RETENTION_DOMAIN='OuchiMaintenance/generation-retention-check/v1';
const fields=['domain','generationID','requestID','nativeID','targetDigest','policyVersion','checkedAt','confirmedUntil','receiptLifetimeSeconds','evidenceDigest'];
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const canonical=p=>JSON.stringify(Object.fromEntries(fields.map(k=>[k,p[k]])));
/** Dedicated checker issuance + exact generation native admission. Server policy
 * and ALL other retained evidence are mandatory independent ports, never client
 * flags, defaults or policy creation. Cancel remains the exact unused-prep undo
 * even if an old policy later expires/revokes; it never renews checker evidence. */
export function createGenerationRetentionAdmission(options){
 const fixed={...options},scope=normalizeSharedDeletionScope(fixed.scope),text=JSON.stringify(scope);
 if(!(fixed.key instanceof Uint8Array)||fixed.key.length<32||typeof fixed.readApprovedPolicy!=='function'||typeof fixed.verifyOtherEvidence!=='function')throw Error('Independent checker key/approved policy/all evidence required');
 const reservation=createOuchiFamilyPreparationGeneration(fixed),native=createOuchiFamilyNativePreparation(fixed),secret=Buffer.from(fixed.key),clock=fixed.clock??Date.now;
 const homes=fixed.homes.map(h=>({...h})).sort((a,b)=>a.homeID.localeCompare(b.homeID));
 const args=[fixed.generationID,text,fixed.nativeLease,JSON.stringify(homes)],nativeID=scope.apps.find(x=>x.app==='ouchi-maintenance')?.requestID;
 const sameScope=v=>JSON.stringify(normalizeSharedDeletionScope(v))===text;
 const checked=tx=>{if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked retention transaction required');tx.signal.throwIfAborted();};
 const sign=p=>createHmac('sha256',secret).update(RETENTION_DOMAIN+'\n'+canonical(p)).digest('hex');
 const pin=r=>r&&Number.isSafeInteger(r.backend_pid)&&r.backend_pid>0&&typeof r.transaction_id==='string'&&/^[1-9][0-9]*$/.test(r.transaction_id)?{pid:r.backend_pid,xid:r.transaction_id}:null;
 const same=(a,b)=>!!a&&!!b&&a.pid===b.pid&&a.xid===b.xid;
 async function policy(tx){const raw=await fixed.readApprovedPolicy(scope,tx,tx.signal);tx.signal.throwIfAborted();if(!raw||Object.keys(raw).sort().join(',')!=='confirmedUntil,evidenceDigest,policyVersion,receiptLifetimeSeconds'||typeof raw.policyVersion!=='string'||!raw.policyVersion.length||raw.policyVersion.length>128||!iso(raw.confirmedUntil)||Date.parse(raw.confirmedUntil)<=clock()||!Number.isSafeInteger(raw.receiptLifetimeSeconds)||raw.receiptLifetimeSeconds<1||raw.receiptLifetimeSeconds>2592000||!hex(raw.evidenceDigest))throw Error('Adopted finite retention policy unavailable');return Object.freeze({...raw});}
 function validate(row){const p=row.payload,s=row.signature;if(!p||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.domain!==RETENTION_DOMAIN||p.generationID!==fixed.generationID||p.requestID!==scope.requestID||p.nativeID!==nativeID||!hex(p.targetDigest)||typeof p.policyVersion!=='string'||!p.policyVersion.length||p.policyVersion.length>128||!iso(p.checkedAt)||!iso(p.confirmedUntil)||Date.parse(p.checkedAt)>clock()||Date.parse(p.confirmedUntil)<=clock()||Date.parse(p.confirmedUntil)>Date.parse(p.checkedAt)+3600000||!Number.isSafeInteger(p.receiptLifetimeSeconds)||p.receiptLifetimeSeconds<1||p.receiptLifetimeSeconds>2592000||!hex(p.evidenceDigest)||!hex(s)||!timingSafeEqual(Buffer.from(s,'hex'),Buffer.from(sign(p),'hex')))throw Error('Exact signed generation retention certificate required');return {payload:Object.freeze({...p}),signature:s};}
 async function read(tx){const rows=(await tx.query(RETENTION_READ_SQL,args)).rows;tx.signal.throwIfAborted();if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='backend_pid,payload,signature,transaction_id')return null;const p=pin(rows[0]);return p?{...validate(rows[0]),pin:p}:null;}
 const policyMatches=(p,c)=>p.policyVersion===c.policyVersion&&p.confirmedUntil===c.confirmedUntil&&p.receiptLifetimeSeconds===c.receiptLifetimeSeconds&&p.evidenceDigest===c.evidenceDigest;
 async function current(tx){checked(tx);const first=await read(tx);if(!first)throw Error('Independent retention certificate unavailable');const p=await policy(tx);if(!policyMatches(p,first.payload)||await fixed.verifyOtherEvidence(scope,first.payload,tx,tx.signal)!==true)throw Error('Retained evidence or policy unconfirmed');const finalPolicy=await policy(tx),last=await read(tx);if(!last||last.signature!==first.signature||!same(first.pin,last.pin)||!policyMatches(finalPolicy,last.payload))throw Error('Retention evidence changed');return last;}
 async function verify(tx){const c=await current(tx),rows=(await tx.query(RETENTION_VERIFY_SQL,args)).rows;tx.signal.throwIfAborted();return rows.length===1&&Object.keys(rows[0]).sort().join(',')==='backend_pid,ok,transaction_id'&&rows[0].ok===true&&same(c.pin,pin(rows[0]))&&same(c.pin,(await current(tx)).pin);}
 const used=new WeakMap();
 function register(tx,kind,check){checked(tx);if(used.has(tx)){used.get(tx).valid=false;throw Error('Retention operation already used');}const state={valid:false};used.set(tx,state);tx.beforeCommit('generation-retention:'+fixed.generationID+':'+kind,async()=>{if(!state.valid)return false;try{return await check();}catch{return false;}});return state;}
 return Object.freeze({reserve:reservation.reserve,cancelRequested:native.cancelRequested,
  async issueCertificate(value,tx){if(!sameScope(value))throw Error('Foreign retention scope');let expected=null,initialPin=null;const state=register(tx,'checker',async()=>{const c=await current(tx),rows=(await tx.query(RETENTION_INSPECT_SQL,args)).rows;return !!expected&&c.signature===expected.signature&&rows.length===1&&rows[0].target_digest===c.payload.targetDigest&&same(c.pin,pin(rows[0]))&&same(initialPin,c.pin);});
   const rows=(await tx.query(RETENTION_INSPECT_SQL,args)).rows;if(rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='backend_pid,checked_at,target_digest,transaction_id'||!iso(rows[0].checked_at)||!hex(rows[0].target_digest)||!pin(rows[0]))throw Error('Actual reserved target required before checker issuance');
   initialPin=pin(rows[0]);const p=await policy(tx),existing=await read(tx);let payload,signature;
   if(existing){payload=existing.payload;signature=existing.signature;if(payload.targetDigest!==rows[0].target_digest||!policyMatches(p,payload))throw Error('Original checker certificate cannot be renewed');}
   else{payload={domain:RETENTION_DOMAIN,generationID:fixed.generationID,requestID:scope.requestID,nativeID,targetDigest:rows[0].target_digest,policyVersion:p.policyVersion,checkedAt:rows[0].checked_at,confirmedUntil:p.confirmedUntil,receiptLifetimeSeconds:p.receiptLifetimeSeconds,evidenceDigest:p.evidenceDigest};signature=sign(payload);
    if(await fixed.verifyOtherEvidence(scope,payload,tx,tx.signal)!==true)throw Error('All retained evidence required');const result=(await tx.query(RETENTION_RECORD_SQL,[...args,payload,signature])).rows;if(result.length!==1||result[0].ok!==true)throw Error('Dedicated checker certificate record unconfirmed');}
   expected=await current(tx);if(expected.signature!==signature||!same(initialPin,expected.pin))throw Error('Exact checker certificate readback required');state.valid=true;return Object.freeze({policyVersion:payload.policyVersion,confirmedUntil:payload.confirmedUntil});
  },
  async prepare(value,tx){if(!sameScope(value))throw Error('Foreign retention scope');const state=register(tx,'native',()=>verify(tx));await current(tx);await native.prepare(value,tx);const rows=(await tx.query(RETENTION_ADMIT_SQL,args)).rows;if(rows.length!==1||rows[0].ok!==true||!await verify(tx))throw Error('Formal native retention admission unconfirmed');state.valid=true;return true;},
  async verifyCurrent(value,tx){if(!sameScope(value))return false;return verify(tx);}
 });
}
