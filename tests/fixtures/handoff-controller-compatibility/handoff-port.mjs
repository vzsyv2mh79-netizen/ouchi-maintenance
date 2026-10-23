import {createHash,randomUUID} from 'node:crypto';
import {handoffPlanDigest,createSignedHandoffConsentVerifier} from './handoff-consent.mjs';
import {hasFamilyAttachmentActivation,familyAttachmentActivationPrincipals,prepareFamilyAttachmentActivation,finishFamilyAttachmentActivation} from '../../../lib/family-attachment-activation.mjs';
export function canonical(value){return JSON.stringify(sort(value));}
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
export function snapshotDigest(v){return createHash('sha256').update(canonical(v)).digest('hex');}
/** Private trusted backend adapter only. The tx is a pinned connection.
 * No endpoint, controller grant, signing-key provisioning or verified Auth reader supplied.
 */
export function createHouseholdHandoffPort(key,activation){
 if(activation!==undefined&&!hasFamilyAttachmentActivation(activation))throw Error('Measured attachment activation required');
 const verify=createSignedHandoffConsentVerifier({key,loadRecords:async(s,p,tx)=>{
  const {rows}=await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.household_handoff_consents where home_id=$1 order by actor_id for update',[p.householdID]);
  return rows;
 }});
 return async(s,nativeLease,home,tx)=>{
  const ids=[s.userID];
  const hint=(await tx.query('select successor_id from maintenance_private.household_handoff_plans where home_id=$1',[home])).rows[0];
  if(!hint)throw Error('Plan absent');ids.push(hint.successor_id);
  if(activation)ids.push(...familyAttachmentActivationPrincipals(activation));
  for(const id of [...new Set(ids)].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
  const {rows:[b]}=await tx.query('select * from maintenance_private.household_stop_bindings where user_id=$1 for update',[s.userID]);
  const {rows:[p]}=await tx.query('select * from maintenance_private.household_handoff_plans where home_id=$1 for update',[home]);
  if(!b||!p||canonical(b.scope)!==canonical(s)||canonical(p.scope)!==canonical(s)||b.state!=='processing'||b.native_lease!==nativeLease||new Date(b.lease_until)<=new Date()
   ||p.owner_id!==s.userID||p.successor_id!==hint.successor_id||p.plan_digest!==handoffPlanDigest(s,p.plan)||snapshotDigest(p.snapshot)!==p.plan.familySnapshotDigest)throw Error('Handoff binding mismatch');
  // Freeze must precede the snapshot and be retained through the ownership change.
  const {rows:[hold]}=await tx.query('select * from maintenance_private.household_family_holds where home_id=$1 for update',[home]);
  if(!hold||hold.principal!==s.userID||canonical(hold.scope)!==canonical(s))throw Error('Family hold absent');
  const {rows:[receipt]}=await tx.query('select * from maintenance_private.household_handoff_receipts where home_id=$1 for update',[home]);
  if(receipt){
   const stable=x=>{const rest={...x};delete rest.leaseToken;return canonical(rest);};
   const {rows:[nowHome]}=await tx.query('select owner_id from public.homes where id=$1',[home]);
   const {rows:[nowFamily]}=await tx.query('select maintenance_private.household_family_snapshot($1) as value',[home]);
   if(stable(receipt.scope)!==stable(s)||receipt.successor_id!==p.successor_id||receipt.plan_digest!==p.plan_digest
    ||receipt.snapshot_digest!==p.plan.familySnapshotDigest||nowHome?.owner_id!==p.successor_id
    ||snapshotDigest(nowFamily.value)!==receipt.snapshot_digest)throw Error('Handoff receipt mismatch');
   return {homeID:home,successorID:p.successor_id,retained:true};
  }
  if(!await verify(s,p.plan,tx))throw Error('Signed dual consent unavailable');
  // Local review correction: a signed family consent is not a file custody or
  // quota-transfer proof. The composed private-writer fence must remain active
  // for all attachment writers; product_attachments has no product foreign key.
  // These parent locks also retain the exact family snapshot during mutation.
  await tx.query('select id from public.homes where id=$1 for update',[home]);
  await tx.query('select id from public.products where "homeId"=$1 order by id for update',[home]);
  const {rows:attachments}=await tx.query('select f.id from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by f.id for update of f',[home]);
  if(attachments.length&&!activation)throw Error('Attachment handoff required');
  const {rows:[current]}=await tx.query('select maintenance_private.household_family_snapshot($1) as value',[home]);
  if(canonical(current.value)!==canonical(p.snapshot))throw Error('Family snapshot changed');
  const {rows:proofs}=await tx.query('select token from maintenance_private.household_handoff_consents where home_id=$1 order by actor_id for update',[home]);
  // Claims were authenticated by verifier above; context expires before either consent.
  const expires=Math.min(Date.now()+5000,...proofs.map(x=>JSON.parse(Buffer.from(x.token.split('.')[0],'base64url').toString()).expiresAt));
  const token=randomUUID();
  await tx.query('insert into maintenance_private.household_handoff_contexts values($1,$2,$3,$4,$5::jsonb,$6,$7,pg_backend_pid(),txid_current(),$8)',[token,home,s.userID,p.successor_id,JSON.stringify(s),nativeLease,p.plan_digest,new Date(expires)]);
  await tx.query("select set_config('maintenance.handoff_context',$1,true)",[token]);
  if(activation)await prepareFamilyAttachmentActivation(activation,{scope:s,nativeLease,homeID:home,recipientID:p.successor_id,familySnapshotDigest:p.plan.familySnapshotDigest,token},tx);
  const updated=await tx.query('update public.homes set owner_id=$1 where id=$2 and owner_id=$3 returning id',[p.successor_id,home,s.userID]);
  if(updated.rowCount!==1)throw Error('Exact ownership update failed');
  await tx.query('update maintenance_private.household_write_routes set owner_id=$1 where home_id=$2',[p.successor_id,home]);
  if(activation)await finishFamilyAttachmentActivation(activation,tx);
  const {rows:[after]}=await tx.query('select maintenance_private.household_family_snapshot($1) as value',[home]);
  if(canonical(after.value)!==canonical(p.snapshot))throw Error('Family changed during handoff');
  await tx.query('insert into maintenance_private.household_handoff_receipts(home_id,scope,successor_id,plan_digest,snapshot_digest) values($1,$2::jsonb,$3,$4,$5)',[home,JSON.stringify(s),p.successor_id,p.plan_digest,p.plan.familySnapshotDigest]);
  return {homeID:home,successorID:p.successor_id,retained:true};
 };
}
