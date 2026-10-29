import {createHash} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
const domain='Kakei/shared-family-handoff/v1';
export function kakeiFamilyPlanDigest(value,plan) {
 const s=normalizeSharedDeletionScope(value),app=s.apps.find(a=>a.app==='kakei');
 if(!app||!plan||plan.protocolVersion!==s.protocolVersion||plan.requestID!==s.requestID||plan.userID!==s.userID||plan.inventoryDigest!==s.inventoryDigest||plan.appRequestID!==app.requestID||plan.appScopeID!==app.scopeID||!plan.householdID||!plan.successorID||plan.successorID===s.userID||!Array.isArray(plan.memberIDs)||!Array.isArray(plan.familyRecordIDs))throw Error('Consent plan scope mismatch');
 const data={protocolVersion:s.protocolVersion,requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,
  appRequestID:app.requestID,appScopeID:app.scopeID,householdID:plan.householdID,successorID:plan.successorID,
  memberIDs:[...plan.memberIDs].sort(),familyRecordIDs:[...plan.familyRecordIDs].sort()};
 if(plan.familySnapshotDigest!==undefined){if(!/^[a-f0-9]{64}$/.test(plan.familySnapshotDigest))throw Error('Consent content digest invalid');data.familySnapshotDigest=plan.familySnapshotDigest;}
 if(plan.retainedFamilySnapshotDigest!==undefined){if(!/^[a-f0-9]{64}$/.test(plan.retainedFamilySnapshotDigest))throw Error('Consent retained digest invalid');data.retainedFamilySnapshotDigest=plan.retainedFamilySnapshotDigest;}
 return createHash('sha256').update(domain+'\n'+JSON.stringify(data)).digest('hex');
}
