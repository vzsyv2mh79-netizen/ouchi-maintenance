import {sharedFamilyCoverageDigest} from './shared-family-handoff-stage.mjs';
import {randomUUID} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {familyAttachmentInventoryDigest as digest} from './family-attachment-journal.mjs';

const fixed=s=>{const v={...normalizeSharedDeletionScope(s)};delete v.leaseToken;return v;};
const same=(a,b)=>digest(a)===digest(b);
/** Private pinned SQL checkpoint only; it never runs a remote handoff. A caller
 * must finish each durable home transfer OUTSIDE legacy journal.perform's outer
 * transaction, then use this store in the new stage's final transaction.
 * loadValidatedTargets must independently verify immutable frozen completeness,
 * every original signed family completion and all other-app family obligations.
 * It returns normalized trusted targets, never a client roster. No default
 * verifier, connection, credentials, provisioning or scheduler is provided.
 */
export function createSharedFamilyStageStore({loadValidatedTargets,verifyReadAuthority}){
 if([loadValidatedTargets,verifyReadAuthority].some(f=>typeof f!=='function'))throw Error('Trusted checkpoint verifiers required');
 async function frame(tx,value,signal,write=false){
  const scope=normalizeSharedDeletionScope(value);signal.throwIfAborted();
  if(await verifyReadAuthority(tx,scope,signal)!==true)throw Error('Scoped controller read authority required');
  const r=(await tx.query(`select *,lease_until>clock_timestamp() as lease_live from private.kb_shared_deletion_journal where request_id=$1 ${write?'for update':''}`,[scope.requestID])).rows[0];
  signal.throwIfAborted();
  if(!r||r.user_id!==scope.userID||!same(r.scope,fixed(scope)))throw Error('Exact controller journal required');
  if(write&&(r.status!=='processing'||r.lease_token!==scope.leaseToken||r.lease_live!==true))throw Error('Current controller checkpoint lease required');
  return {scope,row:r};
 }
 async function read(tx,value,signal){
  const {scope,row}=await frame(tx,value,signal);
  const receipt=row.receipts?.['handoff-family'];if(receipt===undefined)return null;
  const context=(await tx.query('select * from maintenance_private.shared_family_stage_contexts where request_id=$1',[scope.requestID])).rows[0];signal.throwIfAborted();
  if(!context||!same(fixed(context.scope),fixed(scope))||!same(context.receipt,receipt)||context.coverage_digest!==receipt.familyCoverageDigest)throw Error('Exact historical family checkpoint required');
  return structuredClone(receipt);
 }
 async function record(tx,value,coverageDigest,signal){
  if(typeof tx?.beforeCommit!=='function')throw Error('Pinned controller checkpoint commit checks required');
  if(typeof coverageDigest!=='string'||!/^[0-9a-f]{64}$/.test(coverageDigest))throw Error('Exact frozen coverage digest required');
  const {scope,row}=await frame(tx,value,signal,true);
  if(row.receipts?.['handoff-family']!==undefined){
   const existing=await read(tx,scope,signal);if(existing.familyCoverageDigest!==coverageDigest)throw Error('Immutable controller family checkpoint');return;
  }
  const targets=await loadValidatedTargets(tx,scope,coverageDigest,signal);signal.throwIfAborted();
  if(!Array.isArray(targets)||targets.length>100||sharedFamilyCoverageDigest(targets,scope)!==coverageDigest)throw Error('Validated complete frozen targets required');
  const receipt={durable:true,protocolVersion:scope.protocolVersion,kind:scope.kind,stage:'handoff-family',requestID:scope.requestID,userID:scope.userID,inventoryDigest:scope.inventoryDigest,apps:scope.apps,familyCoverageDigest:coverageDigest};
  const token=randomUUID();
  await tx.query(`insert into maintenance_private.shared_family_stage_contexts(token,request_id,scope,coverage_digest,targets,receipt,backend_pid,transaction_id,expires_at)
   values($1,$2,$3::jsonb,$4,$5::jsonb,$6::jsonb,pg_backend_pid(),txid_current(),clock_timestamp()+interval '5 seconds')`,[token,scope.requestID,JSON.stringify(scope),coverageDigest,JSON.stringify(targets),JSON.stringify(receipt)]);
  await tx.query("select set_config('maintenance.shared_family_stage_context',$1,true)",[token]);
  await tx.query("update private.kb_shared_deletion_journal set receipts=receipts||jsonb_build_object('handoff-family',$2::jsonb) where request_id=$1",[scope.requestID,JSON.stringify(receipt)]);
  if(!same(await read(tx,scope,signal),receipt))throw Error('Durable controller family readback required');
  tx.beforeCommit('shared-family-store:'+token,async()=>{
   await frame(tx,scope,signal,true);
   const current=await loadValidatedTargets(tx,scope,coverageDigest,signal);
   return same(current,targets)&&same(await read(tx,scope,signal),receipt);
  });
 }
 return Object.freeze({record,read});
}

/** Routes only the family phase outside legacy journal.perform's transaction.
 * All other phases keep their existing handlers and coverage checks. The read
 * hook must use this checkpoint's private store, never a legacy naked receipt.
 */
export function connectSharedFamilyStage({journal,familyStage,readFamilyReceipt,signal}){
 if(!journal||['readReceipt','verifyCoverage','leaseCurrent','perform'].some(k=>typeof journal[k]!=='function')||typeof familyStage!=='function'||typeof readFamilyReceipt!=='function'||!(signal instanceof AbortSignal))throw Error('Complete external family stage bridge required');
 return Object.freeze({
  readReceipt:(scope,stage)=>stage==='handoff-family'?readFamilyReceipt(scope,signal):journal.readReceipt(scope,stage),
  verifyCoverage:scope=>journal.verifyCoverage(scope),leaseCurrent:scope=>journal.leaseCurrent(scope),
  perform:(scope,stage)=>stage==='handoff-family'?familyStage(scope,signal):journal.perform(scope,stage)
 });
}
