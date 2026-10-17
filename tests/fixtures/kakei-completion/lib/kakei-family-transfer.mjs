import {requireDeletionPrerequisites,requireDeletionLease} from './shared-deletion-journal.mjs';
import {handoffPlanDigest} from './handoff-consent.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilySnapshotDigest,projectedKakeiHandoff,kakeiFamilyPlanDigests} from './kakei-family-snapshot.mjs';
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
/** Undeployed privileged worker port; never accepts JWT claims or client
 * authorization flags. Requires reviewed private context/trigger definitions.
 * verifyConsents locks and cryptographically verifies stored proofs in tx.
 * writeFences checks CURRENT app inventory/epochs and blocks every writer.
 * No direct client/service grants or endpoint are supplied by this module.
 */
export function createKakeiFamilyTransfer({verifyConsents,writeFences}) {
 if(typeof verifyConsents!=='function'||typeof writeFences!=='function')throw Error('Missing protected handoff ports');
 return async(value,requestedPlan,tx)=>{
  const s=await requireDeletionPrerequisites(tx,value,'handoff-family');
  const row=(await tx.query('select plan from private.kb_shared_handoff_plans where request_id=$1 and household_id=$2 for update',[s.requestID,requestedPlan.householdID])).rows[0];
  if(!row||handoffPlanDigest(s,row.plan)!==handoffPlanDigest(s,requestedPlan))throw Error('Handoff plan changed');
  const p=row.plan;
  if(!/^[a-f0-9]{64}$/.test(p.familySnapshotDigest)||!/^[a-f0-9]{64}$/.test(p.retainedFamilySnapshotDigest))throw Error('Handoff content digest missing');
  if(await writeFences(s,tx)!==true||await verifyConsents(s,p,tx)!==true)throw Error('Handoff authorization unconfirmed');
  const before=await captureKakeiFamilySnapshot(s,p.householdID,tx);
  if(kakeiFamilySnapshotDigest(before)!==p.familySnapshotDigest)throw Error('Handoff family content changed');
  if(kakeiFamilyPlanDigests(before,s,p).retainedFamilySnapshotDigest!==p.retainedFamilySnapshotDigest)throw Error('Handoff retained content plan changed');
  const house=(await tx.query('select owner_id from public.kb_households where id=$1 for update',[p.householdID])).rows[0];
  const members=(await tx.query('select user_id,role from public.kb_household_members where household_id=$1 order by user_id for update',[p.householdID])).rows;
  const records=(await tx.query('select id from public.kb_transactions where household_id=$1 and created_by<>$2 order by id for update',[p.householdID,s.userID])).rows.map(r=>r.id);
  if(house?.owner_id!==s.userID||!members.some(m=>m.user_id===s.userID&&m.role==='owner')||!members.some(m=>m.user_id===p.successorID&&m.role==='member')||!same(members.map(m=>m.user_id),p.memberIDs)||!same(records,p.familyRecordIDs))throw Error('Handoff family changed');
  await requireDeletionPrerequisites(tx,s,'handoff-family');
  if(await writeFences(s,tx)!==true)throw Error('Handoff write fence lost');
  await tx.query('insert into private.kb_shared_handoff_context(transaction_id,request_id,lease_token,household_id,owner_id,successor_id) values(txid_current(),$1,$2,$3,$4,$5)',[s.requestID,s.leaseToken,p.householdID,s.userID,p.successorID]);
  await tx.query('update public.kb_households set owner_id=$2 where id=$1',[p.householdID,p.successorID]);
  await tx.query("update public.kb_household_members set role=case when user_id=$2 then 'owner' else 'member' end where household_id=$1 and user_id in ($2,$3)",[p.householdID,p.successorID,s.userID]);
  await tx.query('delete from private.kb_shared_handoff_context where transaction_id=txid_current() and household_id=$1',[p.householdID]);
  await requireDeletionLease(tx,s);
  const after=(await tx.query('select owner_id from public.kb_households where id=$1',[p.householdID])).rows[0];
  const roles=(await tx.query('select user_id,role from public.kb_household_members where household_id=$1 order by user_id',[p.householdID])).rows;
  const kept=(await tx.query('select id from public.kb_transactions where household_id=$1 and created_by<>$2 order by id',[p.householdID,s.userID])).rows.map(r=>r.id);
  if(after?.owner_id!==p.successorID||!roles.some(m=>m.user_id===p.successorID&&m.role==='owner')||!roles.some(m=>m.user_id===s.userID&&m.role==='member')||!same(roles.map(m=>m.user_id),p.memberIDs)||!same(kept,p.familyRecordIDs))throw Error('Handoff readback failed');
  if(kakeiFamilySnapshotDigest(await captureKakeiFamilySnapshot(s,p.householdID,tx))!==kakeiFamilySnapshotDigest(projectedKakeiHandoff(before,s,p)))throw Error('Handoff content readback failed');
  return true;
 };
}
