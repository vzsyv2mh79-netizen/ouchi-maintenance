import {createHash} from 'node:crypto';
import {normalizeFamilyAttachmentPlan} from './family-attachment-handoff.mjs';

const canonical=value=>JSON.stringify(sort(value));
function sort(value){
 if(Array.isArray(value))return value.map(sort);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
 return value;
}
export const familyAttachmentInventoryDigest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const stableScope=scope=>{const value={...scope};delete value.nativeLease;return canonical(value);};

/** Trusted backend preparation inventory only; NOT the orchestrator's prepare
 * port. authorize must, on the same pinned transaction, authenticate both signed
 * consents over this exact metadata/write inventory, current lease/epochs and
 * retained household/private-writer freeze. On replay authorize also receives
 * the original persisted scope as its final argument; both original and current
 * native request binding must belong to the same signed controller operation.
 * Parent row locks alone cannot fence
 * attachment inserts because product_attachments has no product foreign key.
 * No default credentials, production route, grant or consent verifier supplied.
 * record returns planned; reserve additionally holds exact receiver quota in
 * the same transaction. Neither stage authorizes activation, source removal or
 * account erasure. Those are separate, still-required transactions.
 */
export function createFamilyAttachmentJournal({transaction,authorize}){
 if(typeof transaction!=='function'||typeof authorize!=='function')throw Error('Pinned trusted journal provider required');
 function inputs(input,raw,signal){
  if(!(signal instanceof AbortSignal))throw Error('Cancellation required');signal.throwIfAborted();
  const scope=frozen(structuredClone(input));
  const plan=normalizeFamilyAttachmentPlan(raw);
  if(!scope||![scope.requestID,scope.homeID,scope.userID,scope.ownerEpoch,scope.nativeRequestID,scope.nativeLease].every(uuid)
   ||scope.requestID!==plan.requestID||scope.homeID!==plan.homeID||scope.userID!==plan.ownerID||scope.ownerEpoch!==plan.ownerEpoch)throw Error('Foreign journal scope');
  return {scope,plan};
 }
 async function currentLease(tx,scope,signal){
  signal.throwIfAborted();
  // Use the database wall clock, not transaction-start now() or a client clock.
  // The caller locked this exact request before reading the journal. A renewed
  // lease is accepted only if it was actually claimed on that same native job.
  const {rows:[row]}=await tx.query("select exists(select 1 from maintenance_private.account_deletion_requests r join maintenance_private.app_epochs e on e.user_id=r.user_id and e.epoch_id=r.app_epoch_id where r.id=$1 and r.user_id=$2 and r.app_epoch_id=$3 and r.lease_token=$4 and r.state='running' and r.lease_until>clock_timestamp()) as current",[scope.nativeRequestID,scope.userID,scope.ownerEpoch,scope.nativeLease]);
  signal.throwIfAborted();if(row?.current!==true)throw Error('Current native deletion lease required');
 }
 async function authority(tx,scope,plan,inventory,signal,originalScope=scope){
  await currentLease(tx,scope,signal);
  signal.throwIfAborted();
  if(await authorize(tx,scope,plan,inventory,familyAttachmentInventoryDigest(inventory),signal,originalScope)!==true)throw Error('Verified frozen inventory consent required');
  await currentLease(tx,scope,signal);
 }
 async function reserveQuota(tx,scope,plan,inventory,signal,originalScope=scope){
  const relocated=plan.files.filter(file=>file.source.path!==file.destination.path);
  const {rows:consumed}=await tx.query("select attachment_id from maintenance_private.family_attachment_quota where request_id=$1 and home_id=$2 and state<>'reserved' for update",[plan.requestID,plan.homeID]);
  if(consumed.length)throw Error('Activation receipt readback required');
  for(const file of relocated){
   signal.throwIfAborted();
   const {rows:[prior]}=await tx.query("select * from maintenance_private.family_attachment_quota where attachment_id=$1 and state='reserved' for update",[file.id]);
   if(prior){
    if(prior.request_id!==plan.requestID||prior.home_id!==plan.homeID||prior.recipient_id!==plan.recipientID||prior.recipient_epoch!==plan.recipientEpoch||Number(prior.size_bytes)!==file.size||prior.state!=='reserved')throw Error('Quota reservation conflict');
   }else{
    await tx.query('insert into maintenance_private.family_attachment_quota(request_id,home_id,attachment_id,recipient_id,recipient_epoch,size_bytes) values($1,$2,$3,$4,$5,$6)',[plan.requestID,plan.homeID,file.id,plan.recipientID,plan.recipientEpoch,file.size]);
   }
  }
  await authority(tx,scope,plan,inventory,signal,originalScope);
 }
 const record=(input,raw,signal,reserve=false)=>{
  const {scope,plan}=inputs(input,raw,signal);
  return transaction(async tx=>{
   signal.throwIfAborted();
   // All file uploaders participate in the same sorted principal lock order.
   for(const id of [...new Set([plan.ownerID,plan.recipientID,...plan.files.map(file=>file.source.userID)])].sort()){
    await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);signal.throwIfAborted();
   }
   await tx.query('select id from maintenance_private.account_deletion_requests where id=$1 for update',[scope.nativeRequestID]);
   await currentLease(tx,scope,signal);
   const {rows:[existing]}=await tx.query('select * from maintenance_private.family_attachment_journals where request_id=$1 and home_id=$2 for update',[plan.requestID,plan.homeID]);
   const planDigest=familyAttachmentInventoryDigest(plan);
   if(existing){
    if(stableScope(existing.scope)!==stableScope(scope)||canonical(existing.plan)!==canonical(plan)||existing.plan_digest!==planDigest
     ||familyAttachmentInventoryDigest(existing.inventory)!==existing.inventory_digest||existing.state!=='planned')throw Error('Journal conflict');
    // Readback remains evidence only; renewed authority is required even for an
    // idempotent replay. Never rewrite an original manifest to fit current rows.
    await authority(tx,scope,plan,frozen(existing.inventory),signal,frozen(existing.scope));
    if(reserve)await reserveQuota(tx,scope,plan,existing.inventory,signal,existing.scope);
    return frozen({state:reserve?'reserved':'planned',planDigest,inventoryDigest:existing.inventory_digest});
   }
   const {rows:[home]}=await tx.query('select owner_id from public.homes where id=$1 for update',[plan.homeID]);
   if(home?.owner_id!==plan.ownerID)throw Error('Original owner changed');
   const {rows:members}=await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[plan.homeID]);
   if(!members.some(row=>row.user_id===plan.recipientID))throw Error('Receiver membership unavailable');
   const {rows:[receiver]}=await tx.query('select e.epoch_id,e.enabled,a.enabled as account_enabled from maintenance_private.app_epochs e join maintenance_private.account_access a using(user_id) where e.user_id=$1 for update of e,a',[plan.recipientID]);
   if(!receiver?.enabled||!receiver.account_enabled||receiver.epoch_id!==plan.recipientEpoch)throw Error('Receiver enrollment changed');
   const {rows:closing}=await tx.query("select id from maintenance_private.account_deletion_requests where user_id=$1 and state<>'complete' order by id for update",[plan.recipientID]);
   if(closing.length)throw Error('Receiver retirement pending');
   const {rows:products}=await tx.query('select id from public.products where "homeId"=$1 order by id for update',[plan.homeID]);
   const {rows:files}=await tx.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by f.id for update of f',[plan.homeID]);
   if(files.length!==plan.files.length)throw Error('Incomplete file manifest');
   for(let i=0;i<files.length;i++){
    const row=files[i],file=plan.files[i];
    if(row.id!==file.id||row.user_id!==file.source.userID||row.app_epoch_id!==file.source.epoch||row.object_path!==file.source.path
     ||Number(row.size_bytes)!==file.size||row.mime!==file.mime||row.sha256!==file.sha256||row.state!=='stored'||!row.write_tracking
     ||row.captured_owner_id!==plan.ownerID)throw Error('Source metadata changed');
   }
   const {rows:writes}=await tx.query('select a.* from maintenance_private.attachment_write_attempts a join maintenance_private.product_attachments f on f.id=a.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by a.attachment_id for update of a',[plan.homeID]);
   for(const file of files){
    const write=writes.find(row=>row.attachment_id===file.id);
    if(!write||write.state!=='settled'||!write.settled_at||write.uploader_id!==file.user_id||write.app_epoch_id!==file.app_epoch_id||write.owner_id!==plan.ownerID)throw Error('Original write unsettled or changed');
   }
   // Convert driver Date/bigint representations into an immutable JSON snapshot.
   const inventory=frozen(JSON.parse(JSON.stringify({members,products,files,writes})));
   await authority(tx,scope,plan,inventory,signal);
   const inventoryDigest=familyAttachmentInventoryDigest(inventory);
   await tx.query('insert into maintenance_private.family_attachment_journals(request_id,home_id,scope,plan,plan_digest,inventory,inventory_digest) values($1,$2,$3::jsonb,$4::jsonb,$5,$6::jsonb,$7)',[plan.requestID,plan.homeID,JSON.stringify(scope),JSON.stringify(plan),planDigest,JSON.stringify(inventory),inventoryDigest]);
   // A cancellation/consent revocation during database I/O rolls back the insert.
   await authority(tx,scope,plan,inventory,signal);
   if(reserve)await reserveQuota(tx,scope,plan,inventory,signal);
   return frozen({state:reserve?'reserved':'planned',planDigest,inventoryDigest});
  },signal);
 };
 return Object.freeze({
  record:(input,raw,signal)=>record(input,raw,signal),
  reserve:(input,raw,signal)=>record(input,raw,signal,true),
  // Orchestrator prepare port. Derive every destination again and bind its wire
  // digest before atomically persisting the original inventory and full quota.
  // The return value is not a success acknowledgement: status must read back.
  prepare:(input,normalized,planDigest,signal)=>{
   const raw={...normalized,files:normalized?.files?.map(file=>{const copy={...file};delete copy.destination;return copy;})};
   const plan=normalizeFamilyAttachmentPlan(raw);
   if(canonical(normalized)!==canonical(plan)||createHash('sha256').update(JSON.stringify(plan)).digest('hex')!==planDigest)throw Error('Exact preparation plan required');
   return record(input,raw,signal,true);
  }
 });
}
