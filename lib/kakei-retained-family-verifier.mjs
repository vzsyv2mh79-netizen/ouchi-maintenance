import {kakeiFamilyPlanDigest} from './kakei-family-plan-digest.mjs';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {familyAttachmentInventoryDigest as digest} from './family-attachment-journal.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilySnapshotDigest,retainedKakeiFamilySnapshot} from './kakei-family-snapshot.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const same=(a,b)=>digest(a)===digest(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const setSame=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&new Set(b).size===b.length&&same([...a].sort(),[...b].sort());
/** Read-only verifier for Kakei's retained family contribution, not a transfer.
 * verifyCommittedPlan must cryptographically verify both original scoped proofs
 * against a durable immutable transfer checkpoint. Current owner is the successor:
 * never retry an owner-before-transfer mutation to recover a lost reply.
 * verifyWriteFences must independently check Kakei's CURRENT complete writer/app
 * coverage on this SAME private pinned transaction. Missing evidence stays false.
 * No credentials, role grants, routes, transfer, erasure or defaults are provided.
 */
export function createKakeiRetainedFamilyVerifier({verifyCommittedPlan,verifyWriteFences,verifyFrozenCoverage}){
 if([verifyCommittedPlan,verifyWriteFences,verifyFrozenCoverage].some(f=>typeof f!=='function'))throw Error('Trusted Kakei family evidence providers required');
 return async(tx,value,signal)=>{
  try{
   if(!(signal instanceof AbortSignal)||typeof tx?.query!=='function')return false;
   const scope=normalizeSharedDeletionScope(value),app=scope.apps.find(a=>a.app==='kakei');if(!app)return false;
   const fixed={...scope};delete fixed.leaseToken;
   async function current(){
    signal.throwIfAborted();
    const r=(await tx.query('select *,lease_until>clock_timestamp() as live from private.kb_shared_deletion_journal where request_id=$1 for update',[scope.requestID])).rows[0];
    signal.throwIfAborted();
    if(r?.status!=='processing'||r.user_id!==scope.userID||r.lease_token!==scope.leaseToken||r.live!==true||!same(r.scope,fixed))return false;
    if(await verifyWriteFences(tx,scope,signal)!==true)return false;signal.throwIfAborted();
    const after=(await tx.query("select exists(select 1 from private.kb_shared_deletion_journal where request_id=$1 and user_id=$2 and status='processing' and lease_token=$3 and lease_until>clock_timestamp() and scope=$4::jsonb) as live",[scope.requestID,scope.userID,scope.leaseToken,JSON.stringify(fixed)])).rows[0];
    signal.throwIfAborted();return after?.live===true;
   }
   if(!await current())return false;
   const rows=freeze(structuredClone((await tx.query('select household_id,plan from private.kb_shared_handoff_plans where request_id=$1 order by household_id for update',[scope.requestID])).rows));
   signal.throwIfAborted();if(await verifyFrozenCoverage(tx,scope,freeze(rows.map(r=>r.plan)),signal)!==true)return false;
   if(rows.length>100||new Set(rows.map(r=>r.household_id)).size!==rows.length)return false;
   if((await tx.query('select h.id from public.kb_households h where h.owner_id=$1 and exists(select 1 from public.kb_household_members m where m.household_id=h.id and m.user_id<>$1) order by h.id for update',[scope.userID])).rows.length)return false;
   for(const row of rows){
    const p=row.plan;
    if(!p||p.protocolVersion!==scope.protocolVersion||p.requestID!==scope.requestID||p.userID!==scope.userID||p.inventoryDigest!==scope.inventoryDigest
     ||p.appRequestID!==app.requestID||p.appScopeID!==app.scopeID||p.householdID!==row.household_id||![p.householdID,p.successorID].every(uuid)||p.successorID===scope.userID
     ||!Array.isArray(p.memberIDs)||!Array.isArray(p.familyRecordIDs)||!p.memberIDs.every(uuid)||!p.familyRecordIDs.every(uuid)
     ||new Set(p.memberIDs).size!==p.memberIDs.length||new Set(p.familyRecordIDs).size!==p.familyRecordIDs.length
     ||!/^[a-f0-9]{64}$/.test(p.familySnapshotDigest)||!p.memberIDs.includes(scope.userID)||!p.memberIDs.includes(p.successorID)||!/^[a-f0-9]{64}$/.test(p.retainedFamilySnapshotDigest))return false;
    if(await verifyCommittedPlan(tx,scope,p,signal)!==true)return false;signal.throwIfAborted();
    const snapshot=await captureKakeiFamilySnapshot(scope,p.householdID,tx);signal.throwIfAborted();
    if(snapshot.home.owner_id!==p.successorID||!snapshot.members.some(m=>m.user_id===p.successorID&&m.role==='owner')
     ||snapshot.members.some(m=>m.user_id===scope.userID&&m.role!=='member')
     ||!setSame(snapshot.members.filter(m=>m.user_id!==scope.userID).map(m=>m.user_id),p.memberIDs.filter(id=>id!==scope.userID))
     ||!setSame(snapshot.records.map(r=>r.id),p.familyRecordIDs)
     ||kakeiFamilySnapshotDigest(retainedKakeiFamilySnapshot(snapshot,scope))!==p.retainedFamilySnapshotDigest)return false;
    if(await verifyCommittedPlan(tx,scope,p,signal)!==true||!await current())return false;
   }
   signal.throwIfAborted();
   if(await verifyFrozenCoverage(tx,scope,freeze(rows.map(r=>r.plan)),signal)!==true)return false;
   return await current();
  }catch{return false;}
 };
}

/** Connects the independently supplied Kakei completion reader. It never calls
 * complete/transfer, discovers a signing key or accepts a client receipt object.
 */
export function bindKakeiCommittedFamilyVerifier({completion,verifyWriteFences,verifyFrozenCoverage}){
 if(typeof completion?.read!=='function')throw Error('Private Kakei completion reader required');
 return createKakeiRetainedFamilyVerifier({verifyWriteFences,verifyFrozenCoverage,verifyCommittedPlan:async(tx,scope,plan,signal)=>{
  signal.throwIfAborted();const receipt=await completion.read(scope,plan,tx);signal.throwIfAborted();
  return receipt?.durable===true&&receipt.requestID===scope.requestID&&receipt.householdID===plan.householdID
   &&receipt.planDigest===kakeiFamilyPlanDigest(scope,plan)
   &&receipt.retainedFamilySnapshotDigest===plan.retainedFamilySnapshotDigest;
 }});
}
