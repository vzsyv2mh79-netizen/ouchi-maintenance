import {handoffPlanDigest} from './handoff-consent.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilyPlanDigests} from './kakei-family-snapshot.mjs';
// Trusted server DB adapter. Client/direct service grants are NOT provided.
export function createHandoffConsentStore(db) {
 async function lockedPlan(tx,requestID,householdID,actorID,requested=true) {
  const row=(await tx.query('select j.scope,j.status,p.plan from private.kb_shared_deletion_journal j join private.kb_shared_handoff_plans p on p.request_id=j.request_id where j.request_id=$1 and p.household_id=$2 for update of j,p',[requestID,householdID])).rows[0];
  if(!row||(requested&&row.status!=='requested')||!['requested','processing'].includes(row.status))return null;
  const scope={...row.scope,leaseToken:'00000000-0000-4000-8000-000000000001'},plan=row.plan;
  handoffPlanDigest(scope,plan);
  if(actorID!==scope.userID&&actorID!==plan.successorID)return null;
  return {scope,plan};
 }
 // Withdrawal only invalidates this actor's stored proof. It cannot issue a
 // proof or authorize transfer, and must remain possible after content drift.
 const revocationTarget=(tx,requestID,householdID,actorID)=>lockedPlan(tx,requestID,householdID,actorID,true);
 async function target(tx,requestID,householdID,actorID,requested=true) {
  const value=await lockedPlan(tx,requestID,householdID,actorID,requested);
  if(!value)return null;
  const {scope,plan}=value;
  const expected=kakeiFamilyPlanDigests(await captureKakeiFamilySnapshot(scope,householdID,tx),scope,plan);
  if(expected.familySnapshotDigest!==plan.familySnapshotDigest||expected.retainedFamilySnapshotDigest!==plan.retainedFamilySnapshotDigest)return null;
  const house=(await tx.query('select owner_id from kb_households where id=$1 for update',[householdID])).rows[0];
  const members=(await tx.query('select user_id from kb_household_members where household_id=$1 order by user_id for update',[householdID])).rows.map(m=>m.user_id);
  if(house?.owner_id!==scope.userID||!members.includes(scope.userID)||!members.includes(plan.successorID)||JSON.stringify(members)!==JSON.stringify([...plan.memberIDs].sort()))return null;
  const records=(await tx.query('select id from kb_transactions where household_id=$1 and created_by<>$2 order by id for update',[householdID,scope.userID])).rows.map(r=>r.id);
  if(JSON.stringify(records)!==JSON.stringify([...plan.familyRecordIDs].sort()))return null;
  return {scope,plan};
 }
 return {
  transaction:fn=>db.transaction(fn),target,revocationTarget,
  async listTargets(tx,actorID) {
   const rows=(await tx.query("select j.request_id,p.household_id from private.kb_shared_deletion_journal j join private.kb_shared_handoff_plans p on p.request_id=j.request_id where j.status='requested' and (j.user_id=$1 or p.plan->>'successorID'=$1::text) order by j.request_id,p.household_id limit 21",[actorID])).rows;
   if(rows.length>20)throw Error('Consent inbox exceeds reviewed bound');
   const targets=[];
   for(const row of rows){const value=await target(tx,row.request_id,row.household_id,actorID);if(!value)throw Error('Consent inbox changed');targets.push(value);}
   return targets;
  },
  async describe(tx,scope,plan) {
   const house=(await tx.query('select name from kb_households where id=$1',[plan.householdID])).rows[0];
   const members=(await tx.query('select user_id,display_name from kb_household_members where household_id=$1 and user_id in ($2,$3)',[plan.householdID,scope.userID,plan.successorID])).rows;
   const owner=members.find(m=>m.user_id===scope.userID),successor=members.find(m=>m.user_id===plan.successorID);
   if(!house||!owner||!successor)throw Error('Consent description changed');
   return {householdName:house.name,ownerName:owner.display_name,successorName:successor.display_name};
  },
  async existing(tx,scope,plan,actorID) {
   return (await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from private.kb_shared_handoff_proofs where request_id=$1 and household_id=$2 and actor_id=$3 for update',[scope.requestID,plan.householdID,actorID])).rows[0]??null;
  },
  async record(tx,scope,plan,actorID,token) {
   if(!await target(tx,scope.requestID,plan.householdID,actorID))throw Error('Consent target changed');
   await tx.query('insert into private.kb_shared_handoff_proofs(request_id,household_id,actor_id,token) values($1,$2,$3,$4)',[scope.requestID,plan.householdID,actorID,token]);
  },
  async revoke(tx,requestID,householdID,actorID) {
   if(!await revocationTarget(tx,requestID,householdID,actorID))return false;
   return (await tx.query('update private.kb_shared_handoff_proofs set revoked_at=coalesce(revoked_at,clock_timestamp()) where request_id=$1 and household_id=$2 and actor_id=$3 returning actor_id',[requestID,householdID,actorID])).rows.length===1;
  },
  async loadRecords(scope,plan,tx) {
   return (await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from private.kb_shared_handoff_proofs where request_id=$1 and household_id=$2 order by actor_id for update',[scope.requestID,plan.householdID])).rows;
  }
 };
}
