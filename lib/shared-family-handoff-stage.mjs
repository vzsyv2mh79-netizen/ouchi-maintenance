import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
import {handoffFamilyAttachments,normalizeFamilyAttachmentPlan} from './family-attachment-handoff.mjs';
import {familyAttachmentInventoryDigest as digest} from './family-attachment-journal.mjs';

const same=(a,b)=>digest(a)===digest(b);
function targets(value,controller){
 if(!Array.isArray(value)||value.length>100)throw Error('Bounded frozen family coverage required');
 const app=controller.apps.find(a=>a.app==='ouchi-maintenance');
 const result=value.map(t=>{
  if(!t||!same(t.scope?.controllerScope,controller)||!app||t.scope.nativeRequestID!==app.requestID||t.scope.ownerEpoch!==app.scopeID)throw Error('Foreign family controller target');
  const raw=t.plan?.files?.some(f=>Object.hasOwn(f,'destination'))?{...t.plan,files:t.plan.files.map(({destination,...f})=>{void destination;return f;})}:t.plan;
  const plan=normalizeFamilyAttachmentPlan(raw);
  if(t.scope.requestID!==controller.requestID||t.scope.userID!==controller.userID||plan.requestID!==controller.requestID||plan.ownerID!==controller.userID||plan.homeID!==t.scope.homeID||plan.ownerEpoch!==app.scopeID)throw Error('Foreign frozen family plan');
  return {scope:structuredClone(t.scope),plan};
 }).sort((a,b)=>a.plan.homeID.localeCompare(b.plan.homeID));
 if(new Set(result.map(t=>t.plan.homeID)).size!==result.length)throw Error('Duplicate family target');return result;
}
function coverageFingerprint(list){
 return digest(list.map(({scope,plan})=>{
  const fixed={...scope,controllerScope:{...scope.controllerScope}};
  delete fixed.nativeLease;delete fixed.controllerScope.leaseToken;
  return {scope:fixed,plan};
 }));
}
function stageReceipt(r,scope,coverageDigest){
 return r?.durable===true&&r.protocolVersion===scope.protocolVersion&&r.stage==='handoff-family'
  &&r.requestID===scope.requestID&&r.userID===scope.userID&&r.inventoryDigest===scope.inventoryDigest
  &&r.familyCoverageDigest===coverageDigest&&same(r.apps,scope.apps);
}
/** Dormant handoff-family adapter for runSharedDeletion.perform. Never handles
 * app erasure, shared Auth removal or whole-account completion. Frozen coverage
 * must enumerate ALL family homes from the immutable controller inventory,
 * including an independently verified empty set. verifyOtherApps must separately
 * verify every other app family obligation before a global stage receipt.
 * No client targets/flags.
 * Store and verifier callbacks must use the SAME private pinned transaction;
 * record must enforce scope/lease/coverage/completion again in its SQL COMMIT.
 */
export function createSharedFamilyHandoffStage({transaction,verifyCurrentController,loadFrozenTargets,verifyFrozenCoverage,verifyCompletions,verifyOtherApps,portsForTarget,store}){
 if([transaction,verifyCurrentController,loadFrozenTargets,verifyFrozenCoverage,verifyCompletions,verifyOtherApps,portsForTarget].some(f=>typeof f!=='function')||!store||['record','read'].some(k=>typeof store[k]!=='function'))throw Error('Complete shared family stage providers required');
 async function current(tx,scope,signal){signal.throwIfAborted();if(await verifyCurrentController(tx,scope,signal)!==true)throw Error('Current shared controller required');signal.throwIfAborted();}
 async function coverage(tx,scope,signal){
  await current(tx,scope,signal);const list=targets(await loadFrozenTargets(tx,scope,signal),scope);
  if(await verifyFrozenCoverage(tx,scope,list,signal)!==true||await verifyOtherApps(tx,scope,signal)!==true)throw Error('Complete frozen family coverage unconfirmed');
  await current(tx,scope,signal);return list;
 }
 return async(value,signal)=>{
  if(!(signal instanceof AbortSignal))return null;
  try{
   const scope=normalizeSharedDeletionScope(value);signal.throwIfAborted();
   const list=await transaction(tx=>coverage(tx,scope,signal),signal),coverageDigest=coverageFingerprint(list);
   for(const target of list){
    signal.throwIfAborted();const ports=await portsForTarget(scope,target,signal);
    const result=await handoffFamilyAttachments(target.scope,ports,signal);
    if(result.state!=='complete'||result.homeID!==target.plan.homeID)return null;
   }
   return await transaction(async tx=>{
    if(typeof tx.beforeCommit!=='function')throw Error('Pinned shared family commit checks required');
    const fresh=await coverage(tx,scope,signal);
    if(coverageFingerprint(fresh)!==coverageDigest)throw Error('Frozen family coverage changed');
    if(await verifyCompletions(tx,scope,fresh,signal)!==true)throw Error('Every durable family completion required');
    signal.throwIfAborted();
    let receipt=await store.read(tx,scope,signal);
    if(receipt===null){
     await store.record(tx,scope,coverageDigest,signal);
     receipt=await store.read(tx,scope,signal);
    }
    if(!stageReceipt(receipt,scope,coverageDigest))throw Error('Exact shared family stage readback required');
    tx.beforeCommit('shared-family:'+coverageDigest,async()=>{
     const final=await coverage(tx,scope,signal);
     if(coverageFingerprint(final)!==coverageDigest||await verifyCompletions(tx,scope,final,signal)!==true)return false;
     return stageReceipt(await store.read(tx,scope,signal),scope,coverageDigest);
    });
    signal.throwIfAborted();return structuredClone(receipt);
   },signal);
  }catch{return null;}
 };
}
