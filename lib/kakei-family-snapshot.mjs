import {createHash} from 'node:crypto';
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const kakeiFamilySnapshotDigest=value=>createHash('sha256').update('Kakei/retained-family-content/v1\n'+canonical(value)).digest('hex');
// Server-only, same pinned transaction as consent/transfer. Preserve every
// captured column except the household's server-managed update timestamp.
// Requester's own inputs are excluded because personal erasure removes them.
export async function captureKakeiFamilySnapshot(scope,householdID,tx){
 const home=(await tx.query("select to_jsonb(h)-'updated_at' as value from public.kb_households h where id=$1 for update",[householdID])).rows[0]?.value;
 if(!home)throw Error('Family snapshot unavailable');
 const members=(await tx.query('select to_jsonb(m) as value from public.kb_household_members m where household_id=$1 order by user_id for update',[householdID])).rows.map(r=>r.value);
 const records=(await tx.query('select to_jsonb(t) as value from public.kb_transactions t where household_id=$1 and created_by<>$2 order by id for update',[householdID,scope.userID])).rows.map(r=>r.value);
 return {home,members,records};
}
export function projectedKakeiHandoff(snapshot,scope,plan){
 const after=structuredClone(snapshot);after.home.owner_id=plan.successorID;
 for(const member of after.members){if(member.user_id===scope.userID)member.role='member';if(member.user_id===plan.successorID)member.role='owner';}
 return after;
}
export function retainedKakeiFamilySnapshot(snapshot,scope){
 const retained=structuredClone(snapshot);
 retained.members=retained.members.filter(member=>member.user_id!==scope.userID);
 return retained;
}
export function kakeiFamilyPlanDigests(snapshot,scope,plan){
 return {familySnapshotDigest:kakeiFamilySnapshotDigest(snapshot),
  retainedFamilySnapshotDigest:kakeiFamilySnapshotDigest(retainedKakeiFamilySnapshot(projectedKakeiHandoff(snapshot,scope,plan),scope))};
}
