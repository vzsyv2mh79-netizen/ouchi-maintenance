import {randomUUID} from 'node:crypto';
import {normalizeFamilyAttachmentPlan,requireFamilyAttachmentProof,familyAttachmentProofDeadline} from './family-attachment-handoff.mjs';
import {familyAttachmentInventoryDigest} from './family-attachment-journal.mjs';

const brands=new WeakMap();
const json=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>familyAttachmentInventoryDigest(a)===familyAttachmentInventoryDigest(b);
const stable=scope=>{const value={...scope};delete value.nativeLease;return value;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const get=brand=>{const record=brands.get(brand);if(!record)throw Error('Measured attachment activation required');record.signal.throwIfAborted();requireFamilyAttachmentProof(record.proof,record.scope,record.plan);return record;};

/** Backend-only brand. No route, default credentials or production grant. The
 * mandatory authorize callback must validate BOTH signed consents over the
 * immutable complete inventory and its current controller/native lease binding.
 * The existing household port separately verifies the signed family snapshot.
 * A JSON flag or injected client proof cannot create a measured activation.
 */
export function createFamilyAttachmentActivation({scope,plan,proof,signal,authorize}){
 if(!(signal instanceof AbortSignal)||typeof authorize!=='function')throw Error('Verified inventory authorization provider required');
 const record={scope:freeze(structuredClone(scope)),plan:normalizeFamilyAttachmentPlan(plan),proof,signal,authorize,prepared:new WeakMap()};
 requireFamilyAttachmentProof(proof,record.scope,record.plan);
 const brand=Object.freeze({});brands.set(brand,record);return brand;
}
export const hasFamilyAttachmentActivation=brand=>brands.has(brand);
export function familyAttachmentActivationPrincipals(brand){const r=get(brand);return [...new Set([r.plan.ownerID,r.plan.recipientID,...r.plan.files.map(f=>f.source.userID)])].sort();}
async function inventory(tx,home){
 const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[home])).rows;
 const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[home])).rows;
 const files=(await tx.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by f.id for update of f',[home])).rows;
 const writes=(await tx.query('select a.* from maintenance_private.attachment_write_attempts a join maintenance_private.product_attachments f on f.id=a.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by a.attachment_id for update of a',[home])).rows;
 return json({members,products,files,writes});
}
async function current(tx,r){
 get(r.brand);
 const {rows:[lease]}=await tx.query("select exists(select 1 from maintenance_private.account_deletion_requests d join maintenance_private.app_epochs e on e.user_id=d.user_id and e.epoch_id=d.app_epoch_id where d.id=$1 and d.user_id=$2 and d.app_epoch_id=$3 and d.lease_token=$4 and d.state='running' and d.lease_until>clock_timestamp()) as current",[r.scope.nativeRequestID,r.scope.userID,r.scope.ownerEpoch,r.scope.nativeLease]);
 if(lease?.current!==true)throw Error('Current native activation lease required');get(r.brand);
}
export async function prepareFamilyAttachmentActivation(brand,context,tx){
 const r=get(brand);r.brand=brand;
 if(!same(r.scope.controllerScope,context.scope)||r.scope.requestID!==context.scope.requestID||r.scope.homeID!==context.homeID||r.scope.userID!==context.scope.userID
  ||r.scope.nativeLease!==context.nativeLease||r.plan.ownerID!==context.scope.userID||r.plan.recipientID!==context.recipientID||r.plan.snapshotDigest!==context.familySnapshotDigest
  ||!context.scope.apps.some(a=>a.app==='ouchi-maintenance'&&a.requestID===r.scope.nativeRequestID&&a.scopeID===r.scope.ownerEpoch))throw Error('Foreign household activation');
 await tx.query('select id from maintenance_private.account_deletion_requests where id=$1 for update',[r.scope.nativeRequestID]);await current(tx,r);
 const {rows:[journal]}=await tx.query('select * from maintenance_private.family_attachment_journals where request_id=$1 and home_id=$2 for update',[r.plan.requestID,r.plan.homeID]);
 if(!journal||!same(stable(journal.scope),stable(r.scope))||!same(journal.plan,r.plan)||journal.plan_digest!==familyAttachmentInventoryDigest(r.plan)
  ||journal.inventory_digest!==familyAttachmentInventoryDigest(journal.inventory)||!same(await inventory(tx,r.plan.homeID),journal.inventory))throw Error('Original activation inventory changed');
 const {rows:quota}=await tx.query('select * from maintenance_private.family_attachment_quota where request_id=$1 and home_id=$2 order by attachment_id for update',[r.plan.requestID,r.plan.homeID]);
 const moved=r.plan.files.filter(f=>f.source.path!==f.destination.path);
 if(quota.length!==moved.length||moved.some(f=>!quota.some(q=>q.attachment_id===f.id&&q.recipient_id===r.plan.recipientID&&q.recipient_epoch===r.plan.recipientEpoch&&Number(q.size_bytes)===f.size&&q.state==='reserved')))throw Error('Exact receiver reservation required');
 if(await r.authorize(tx,r.scope,r.plan,freeze(json(journal.inventory)),journal.inventory_digest,r.signal,freeze(json(journal.scope)))!==true)throw Error('Signed complete inventory consent required');
 await current(tx,r);get(brand);
 const expected=json(journal.inventory);
 for(const f of r.plan.files){
  Object.assign(expected.files.find(row=>row.id===f.id),{user_id:f.destination.userID,app_epoch_id:f.destination.epoch,object_path:f.destination.path,captured_owner_id:r.plan.recipientID});
  Object.assign(expected.writes.find(row=>row.attachment_id===f.id),{uploader_id:f.destination.userID,app_epoch_id:f.destination.epoch,owner_id:r.plan.recipientID});
 }
 const token=randomUUID();
 await tx.query("insert into maintenance_private.family_attachment_activation_contexts(token,household_token,request_id,home_id,scope,plan_digest,inventory_digest,expected_inventory_digest,consents,backend_pid,transaction_id,expires_at) select $1,$2,$3,$4,$5::jsonb,$6,$7,$8,(select jsonb_agg(to_jsonb(x) order by actor_id) from maintenance_private.household_handoff_consents x where home_id=$4),pg_backend_pid(),txid_current(),least(expires_at,clock_timestamp()+interval '5 seconds',$9::timestamptz) from maintenance_private.household_handoff_contexts where token=$2",[token,context.token,r.plan.requestID,r.plan.homeID,JSON.stringify(r.scope),journal.plan_digest,journal.inventory_digest,familyAttachmentInventoryDigest(expected),familyAttachmentProofDeadline(r.proof,r.scope,r.plan)]);
 await tx.query("select set_config('maintenance.attachment_activation_context',$1,true)",[token]);
 const {rows:[valid]}=await tx.query('select maintenance_private.current_family_attachment_activation() as token');if(valid?.token!==token)throw Error('Private activation context unavailable');
 for(const f of r.plan.files){
  get(brand);
  await tx.query("insert into maintenance_private.family_attachment_activation_rows select $1,'product_attachments',id,to_jsonb(f),to_jsonb(f)||jsonb_build_object('user_id',$3::uuid,'app_epoch_id',$4::uuid,'captured_owner_id',$5::uuid,'object_path',$6::text) from maintenance_private.product_attachments f where id=$2",[token,f.id,f.destination.userID,f.destination.epoch,r.plan.recipientID,f.destination.path]);
  await tx.query("insert into maintenance_private.family_attachment_activation_rows select $1,'attachment_write_attempts',attachment_id,to_jsonb(a),to_jsonb(a)||jsonb_build_object('uploader_id',$3::uuid,'app_epoch_id',$4::uuid,'owner_id',$5::uuid) from maintenance_private.attachment_write_attempts a where attachment_id=$2",[token,f.id,f.destination.userID,f.destination.epoch,r.plan.recipientID]);
 }
 get(brand);
 await tx.query("update maintenance_private.family_attachment_quota set state='consumed' where request_id=$1 and home_id=$2 and state='reserved'",[r.plan.requestID,r.plan.homeID]);
 r.prepared.set(tx,{token,journal,expected});await current(tx,r);
}
export async function finishFamilyAttachmentActivation(brand,tx){
 const r=get(brand),prepared=r.prepared.get(tx);if(!prepared)throw Error('Pinned activation preparation required');
 await current(tx,r);
 for(const file of r.plan.files){
  get(brand);
  const updated=await tx.query('update maintenance_private.product_attachments set user_id=$2,app_epoch_id=$3,captured_owner_id=$4 where id=$1 returning id',[file.id,file.destination.userID,file.destination.epoch,r.plan.recipientID]);
  if(updated.rows.length!==1)throw Error('Exact file activation failed');
  await current(tx,r);
  const written=await tx.query('update maintenance_private.attachment_write_attempts set uploader_id=$2,app_epoch_id=$3,owner_id=$4 where attachment_id=$1 returning attachment_id',[file.id,file.destination.userID,file.destination.epoch,r.plan.recipientID]);
  if(written.rows.length!==1)throw Error('Exact write activation failed');
 }
 if(!same(await inventory(tx,r.plan.homeID),prepared.expected))throw Error('Activated inventory mismatch');
 // The post-mutation authorization provider must check retained consent/current
 // authority against the original inventory, not sign a new manifest implicitly.
 if(await r.authorize(tx,r.scope,r.plan,freeze(json(prepared.journal.inventory)),prepared.journal.inventory_digest,r.signal,freeze(json(prepared.journal.scope)))!==true)throw Error('Signed complete inventory consent required');
 await current(tx,r);get(brand);
 await tx.query('insert into maintenance_private.family_attachment_activation_receipts(request_id,home_id,plan_digest,inventory_digest,expected_inventory_digest) values($1,$2,$3,$4,$5)',[r.plan.requestID,r.plan.homeID,prepared.journal.plan_digest,prepared.journal.inventory_digest,familyAttachmentInventoryDigest(prepared.expected)]);
 await current(tx,r);get(brand);r.prepared.delete(tx);
}
