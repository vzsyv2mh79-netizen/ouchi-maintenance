// Undeployed stage-zero adapter. Requires new protected SQL ports; no fallback
// to an existing generation, old receipt, claim, Auth erasure or lease renewal.
import {createHash} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {createOwningMaintenanceLock} from './controlled-owning-maintenance-lock.mjs';
import {PROTOCOL,REVISION} from './controlled-operating-state.mjs';
export const CONTROLLED_PREPARATION_PROVENANCE_SQL='select * from private.kb_read_controlled_generation_provenance($1::uuid,$2::jsonb)';
export const CONTROLLED_PREPARATION_ROOT_SQL='select scope,user_id,status,lease_token,lease_until,receipts,pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid from private.kb_shared_deletion_journal where request_id=$1 for update';
export const CONTROLLED_PREPARATION_RESERVE_SQL='select maintenance_private.reserve_controlled_family_preparation_generation($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb,$6::text) as ok';
export const CONTROLLED_PREPARATION_STATE_SQL='select * from maintenance_private.controlled_family_preparation_generation_state($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb,$6::text)';
const domain='Kakei/shared-retirement/controlled-generation/v1';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
const pin=r=>Number.isSafeInteger(r?.pid)&&r.pid>0&&typeof r.xid==='string'&&/^[1-9][0-9]*$/.test(r.xid);
const samePin=(a,b)=>a.pid===b.pid&&a.xid===b.xid;
export function createOuchiControlledFamilyPreparation({provenance,nativeLease,homes,expectedOperation,verifyNoDispatch}){
 if(!exact(provenance,'domain,generationID,scope,operation,digest')||provenance.domain!==domain||!uuid(provenance.generationID)||
  !exact(provenance.operation,'protocol,revision,epoch,manifest,boot')||provenance.operation.protocol!==PROTOCOL||provenance.operation.revision!==REVISION||
  !exact(expectedOperation,'protocol,revision,epoch,manifest,boot')||stable(expectedOperation)!==stable(provenance.operation)||
  !exact(provenance.scope,'protocolVersion,kind,requestID,userID,leaseToken,inventoryDigest,apps')||
  !Array.isArray(provenance.scope.apps)||provenance.scope.apps.some(a=>!exact(a,'app,requestID,scopeID')))throw Error('Exact bootstrap provenance and external operation required');
 const scope=normalizeSharedDeletionScope(provenance.scope),operation=Object.freeze({...expectedOperation});
 const body={domain,generationID:provenance.generationID,scope,operation};
 const digest=createHash('sha256').update(domain+'\n'+stable(body)).digest('hex');
 if(digest!==provenance.digest||!scope.apps.some(a=>a.app==='ouchi-maintenance')||!uuid(nativeLease)||nativeLease===scope.leaseToken||
  !Array.isArray(homes)||!homes.length||typeof verifyNoDispatch!=='function')throw Error('Verified preparation identity and writer coverage required');
 const expected=stable({...body,digest}),fixed={...scope};delete fixed.leaseToken;
 const roster=homes.map(h=>{if(!exact(h,'homeID,successorID')||!uuid(h.homeID)||!uuid(h.successorID)||h.successorID===scope.userID)throw Error('Exact enrolled family targets required');return {...h};}).sort((a,b)=>a.homeID.localeCompare(b.homeID));
 if(new Set(roster.map(h=>h.homeID)).size!==roster.length)throw Error('Duplicate family target');
 const maintenance=createOwningMaintenanceLock({epoch:operation.epoch,manifest:operation.manifest,expectedBoot:operation.boot});
 const args=[scope.requestID,JSON.stringify(scope),body.generationID,nativeLease,JSON.stringify(roster),digest],attempted=new WeakSet();
 async function inspect(tx,prior){
  tx.signal.throwIfAborted();if(!await maintenance.bind(tx))throw Error('Current operation unavailable');
  const proof=(await tx.query(CONTROLLED_PREPARATION_PROVENANCE_SQL,[body.generationID,JSON.stringify(scope)])).rows;
  if(proof.length!==1||!exact(proof[0],'provenance,producer_pid,producer_xid')||stable(proof[0].provenance)!==expected||
   !pin({pid:proof[0].producer_pid,xid:proof[0].producer_xid}))throw Error('Protected original provenance required');
  const roots=(await tx.query(CONTROLLED_PREPARATION_ROOT_SQL,[scope.requestID])).rows,r=roots[0];
  if(roots.length!==1||!pin(r)||stable(r.scope)!==stable(fixed)||r.user_id!==scope.userID||r.status!=='requested'||r.lease_token!==null||r.lease_until!==null||
   !exact(r.receipts,'')||r.xid===proof[0].producer_xid||prior&&(!samePin(r,prior)||prior.headerPID!==proof[0].producer_pid||prior.headerXID!==proof[0].producer_xid))throw Error('Prior committed provenance and requested root required');
  if(await verifyNoDispatch(scope,tx,tx.signal)!==true)throw Error('Independent dispatch coverage unavailable');
  tx.signal.throwIfAborted();return {pid:r.pid,xid:r.xid,headerPID:proof[0].producer_pid,headerXID:proof[0].producer_xid};
 }
 async function facts(tx,pinned){
  const rows=(await tx.query(CONTROLLED_PREPARATION_STATE_SQL,args)).rows,r=rows[0];
  if(rows.length!==1||!exact(r,'ok,pid,xid,provenance_digest,phase')||r.ok!==true||r.phase!=='reserved'||r.provenance_digest!==digest||!pin(r)||!samePin(r,pinned))throw Error('Exact controlled preparation facts required');
 }
 return Object.freeze({async reserve(tx){
  if(!(tx?.signal instanceof AbortSignal)||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||tx.signal.aborted)throw Error('Checked owning transaction required');
  if(attempted.has(tx))throw Error('Preparation already attempted');attempted.add(tx);
  let valid=false,pinned;
  tx.beforeCommit('controlled-family-preparation:'+body.generationID,async()=>{
   if(!valid)return false;
   try{await inspect(tx,pinned);await facts(tx,pinned);await inspect(tx,pinned);return true;}catch{valid=false;return false;}
  });
  pinned=await inspect(tx);
  const rows=(await tx.query(CONTROLLED_PREPARATION_RESERVE_SQL,args)).rows;
  if(rows.length!==1||rows[0].ok!==true)throw Error('Fresh controlled family reservation refused');
  await facts(tx,pinned);await inspect(tx,pinned);valid=true;
  // Tentative until owning COMMIT; neither durable nor a deletion receipt.
  return Object.freeze({kind:'controlled-family-preparation',generationID:body.generationID,provenanceDigest:digest,phase:'reserved'});
 }});
}
