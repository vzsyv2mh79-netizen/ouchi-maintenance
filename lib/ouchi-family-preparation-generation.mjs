import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
export const FAMILY_GENERATION_RESERVE_SQL='select maintenance_private.reserve_family_preparation_generation($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb) as ok';
export const FAMILY_GENERATION_CANCEL_SQL='select maintenance_private.cancel_family_preparation_generation($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb) as ok';
export const FAMILY_GENERATION_STATE_SQL='select * from maintenance_private.family_preparation_generation_state($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb,$6::text)';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(x);
/** Preparation-generation reservation only. It is NOT consent, native capture,
 * write-stop readiness or claim authority. Independent dispatch/remaining-writer
 * coverage is mandatory; legacy plans and files are deliberately refused. */
export function createOuchiFamilyPreparationGeneration({scope,generationID,nativeLease,homes,verifyNoDispatch}){
 const s=normalizeSharedDeletionScope(scope),serialized=JSON.stringify(s);
 if(!uuid(generationID)||!uuid(nativeLease)||nativeLease===s.leaseToken||!Array.isArray(homes)||!homes.length||typeof verifyNoDispatch!=='function')throw Error('Exact family generation and independent no-dispatch coverage required');
 const roster=homes.map(x=>{if(!x||Object.keys(x).sort().join(',')!=='homeID,successorID'||!uuid(x.homeID)||!uuid(x.successorID)||x.successorID===s.userID)throw Error('Exact family roster required');return {homeID:x.homeID,successorID:x.successorID};}).sort((a,b)=>a.homeID.localeCompare(b.homeID));
 if(new Set(roster.map(x=>x.homeID)).size!==roster.length)throw Error('Duplicate home');
 const args=[s.requestID,serialized,generationID,nativeLease,JSON.stringify(roster)],used=new WeakMap();
 const checked=tx=>{if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked owning transaction required');tx.signal.throwIfAborted();};
 const pin=async(tx,expected)=>{const {rows}=await tx.query(FAMILY_GENERATION_STATE_SQL,[...args,expected]);tx.signal.throwIfAborted();const r=rows[0];return rows.length===1&&Object.keys(r).sort().join(',')==='backend_pid,ok,transaction_id'&&r.ok===true&&Number.isSafeInteger(r.backend_pid)&&r.backend_pid>0&&typeof r.transaction_id==='string'&&/^[1-9][0-9]*$/.test(r.transaction_id)?{pid:r.backend_pid,xid:r.transaction_id}:null;};
 const same=(a,b)=>a&&b&&a.pid===b.pid&&a.xid===b.xid;
 const change=async(value,tx,cancel)=>{
  checked(tx);if(JSON.stringify(normalizeSharedDeletionScope(value))!==serialized)throw Error('Foreign generation scope');
  if(used.has(tx)){used.get(tx).valid=false;throw Error('Generation operation already used');}
  const state={valid:false,pin:null},expected=cancel?'cancelled':'reserved';used.set(tx,state);
  tx.beforeCommit('ouchi-family-generation:'+generationID,async()=>{if(!state.valid)return false;try{return !!same(state.pin,await pin(tx,expected))&&await verifyNoDispatch(s,tx,tx.signal)===true&&!!same(state.pin,await pin(tx,expected));}catch{return false;}});
  if(await verifyNoDispatch(s,tx,tx.signal)!==true)throw Error('Independent dispatch/writer admission unavailable');
  const {rows}=await tx.query(cancel?FAMILY_GENERATION_CANCEL_SQL:FAMILY_GENERATION_RESERVE_SQL,args);if(rows.length!==1||rows[0].ok!==true)throw Error('Family generation operation unconfirmed');
  state.pin=await pin(tx,expected);if(!state.pin||await verifyNoDispatch(s,tx,tx.signal)!==true||!same(state.pin,await pin(tx,expected)))throw Error('Family generation state changed');state.valid=true;return true;
 };
 return Object.freeze({reserve:(s,tx)=>change(s,tx,false),cancelRequested:(s,tx)=>change(s,tx,true)});
}
