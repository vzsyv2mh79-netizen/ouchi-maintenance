import {createHash} from 'node:crypto';
import {normalizeFamilyAttachmentPlan} from './family-attachment-handoff.mjs';
import {familyAttachmentInventoryDigest as digest} from './family-attachment-journal.mjs';

const json=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>digest(a)===digest(b);
const stable=scope=>{const value={...scope};delete value.nativeLease;return value;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';

/** Backend-only initial absence and durable reserved-journal readback. No mutation, source
 * deletion or completion evidence. The required authorization provider verifies
 * both inventory-bound consents/current Auth on this same pinned transaction.
 * Readback uses durable receipts, not an expired activation GUC/proof or a client
 * flag. It still requires the current native/controller lease and retained freeze.
 * Missing or partial evidence throws; callers must keep the outcome pending.
 */
export function createFamilyAttachmentStatus({transaction,authorize}){
 if(typeof transaction!=='function'||typeof authorize!=='function')throw Error('Trusted readback provider required');
 return async(input,raw,signal)=>{
  if(!(signal instanceof AbortSignal))throw Error('Cancellation required');signal.throwIfAborted();
  const scope=freeze(structuredClone(input));
  // The orchestrator supplies its normalized immutable plan; derive paths again
  // rather than trusting supplied destinations. Direct raw callers still pass
  // through the original strict normalizer.
  const normalized=raw?.files?.some(f=>Object.hasOwn(f,'destination'));
  const plan=normalizeFamilyAttachmentPlan(normalized?{...raw,files:raw.files.map(f=>{const copy={...f};delete copy.destination;return copy;})}:raw);
  if(normalized&&!same(raw,plan))throw Error('Foreign readback destination');
  if(![scope?.requestID,scope?.homeID,scope?.userID,scope?.ownerEpoch,scope?.nativeRequestID,scope?.nativeLease].every(uuid)
   ||scope.requestID!==plan.requestID||scope.homeID!==plan.homeID||scope.userID!==plan.ownerID||scope.ownerEpoch!==plan.ownerEpoch
   ||scope.controllerScope?.requestID!==scope.requestID||scope.controllerScope?.userID!==scope.userID
   ||!scope.controllerScope.apps?.some(a=>a.app==='ouchi-maintenance'&&a.requestID===scope.nativeRequestID&&a.scopeID===scope.ownerEpoch))throw Error('Foreign readback scope');
  return transaction(async tx=>{
   for(const id of [...new Set([plan.ownerID,plan.recipientID,...plan.files.map(f=>f.source.userID)])].sort()){
    await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);signal.throwIfAborted();
   }
   await tx.query('select id from public.homes where id=$1 for update',[plan.homeID]);
   await tx.query('select id from maintenance_private.account_deletion_requests where id=$1 for update',[scope.nativeRequestID]);
   async function inventory(){
    const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[plan.homeID])).rows;
    const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[plan.homeID])).rows;
    const files=(await tx.query('select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by f.id for update of f',[plan.homeID])).rows;
    const writes=(await tx.query('select a.* from maintenance_private.attachment_write_attempts a join maintenance_private.product_attachments f on f.id=a.attachment_id join public.products p on p.id=f.product_id where p."homeId"=$1 and f.state<>\'removed\' order by a.attachment_id for update of a',[plan.homeID])).rows;
    return json({members,products,files,writes});
   }
   const {rows:[savedJournal]}=await tx.query('select * from maintenance_private.family_attachment_journals where request_id=$1 and home_id=$2 for update',[plan.requestID,plan.homeID]);
   const absent=!savedJournal;
   let journal=savedJournal;
   if(absent){
    // No persisted journal is not sufficient evidence of an initial operation.
    // Capture the entire still-original frozen inventory and authorize it too.
    const original=await inventory();
    if(!original.members.some(m=>m.user_id===plan.recipientID)||original.files.length!==plan.files.length||original.writes.length!==plan.files.length)throw Error('Complete initial inventory required');
    for(const file of plan.files){
     const row=original.files.find(r=>r.id===file.id),write=original.writes.find(r=>r.attachment_id===file.id);
     if(!row||row.user_id!==file.source.userID||row.app_epoch_id!==file.source.epoch||row.object_path!==file.source.path
      ||Number(row.size_bytes)!==file.size||row.mime!==file.mime||row.sha256!==file.sha256||row.state!=='stored'||!row.write_tracking
      ||row.captured_owner_id!==plan.ownerID||!write||write.state!=='settled'||!write.settled_at
      ||write.uploader_id!==row.user_id||write.app_epoch_id!==row.app_epoch_id||write.owner_id!==plan.ownerID)throw Error('Original initial inventory required');
    }
    journal={scope,plan,state:'planned',plan_digest:digest(plan),inventory:original,inventory_digest:digest(original)};
   }
   if(journal.state!=='planned'||!same(stable(journal.scope),stable(scope))||!same(journal.plan,plan)
    ||journal.plan_digest!==digest(plan)||journal.inventory_digest!==digest(journal.inventory))throw Error('Original readback journal required');
   async function authority(){
    signal.throwIfAborted();
    const {rows:[row]}=await tx.query(`select exists(
     select 1 from maintenance_private.account_deletion_requests d
     join maintenance_private.app_epochs e on e.user_id=d.user_id and e.epoch_id=d.app_epoch_id
     join maintenance_private.household_stop_bindings b on b.user_id=d.user_id
     join maintenance_private.household_family_holds h on h.principal=d.user_id and h.home_id=$5
     join maintenance_private.household_principal_fences f on f.user_id=d.user_id
     where d.id=$1 and d.user_id=$2 and d.app_epoch_id=$3 and d.lease_token=$4
     and d.state='running' and d.lease_until>clock_timestamp()
     and b.native_lease=$4 and b.state='processing' and b.lease_until>clock_timestamp()
     and b.scope=$6::jsonb and h.scope=$6::jsonb and f.stopped
     and exists(select 1 from maintenance_private.app_epochs re join maintenance_private.account_access a using(user_id)
      where re.user_id=$7 and re.epoch_id=$8 and re.enabled and a.enabled)
     and not exists(select 1 from maintenance_private.account_deletion_requests where user_id=$7 and state<>'complete')
    ) as current`,[scope.nativeRequestID,scope.userID,scope.ownerEpoch,scope.nativeLease,scope.homeID,JSON.stringify(scope.controllerScope),plan.recipientID,plan.recipientEpoch]);
    signal.throwIfAborted();if(row?.current!==true)throw Error('Current readback authority required');
   }
   async function consent(){
    await authority();
    if(await authorize(tx,scope,plan,freeze(json(journal.inventory)),journal.inventory_digest,signal,freeze(json(journal.scope)))!==true)throw Error('Signed readback inventory consent required');
    await authority();
   }
   await consent();
   async function evidence(){
   const {rows:[attachment]}=await tx.query('select * from maintenance_private.family_attachment_activation_receipts where request_id=$1 and home_id=$2 for update',[plan.requestID,plan.homeID]);
   const {rows:[household]}=await tx.query('select * from maintenance_private.household_handoff_receipts where home_id=$1 for update',[plan.homeID]);
   const {rows:[parent]}=await tx.query('select * from maintenance_private.household_handoff_plans where home_id=$1 for update',[plan.homeID]);
   const {rows:[home]}=await tx.query('select owner_id from public.homes where id=$1',[plan.homeID]);
   const {rows:[family]}=await tx.query('select maintenance_private.household_family_snapshot($1) as value',[plan.homeID]);
   if(!parent||!same(parent.scope,scope.controllerScope)||parent.successor_id!==plan.recipientID||parent.owner_id!==plan.ownerID
    ||digest(parent.snapshot)!==plan.snapshotDigest||!same(family?.value,parent.snapshot))throw Error('Retained readback family required');
   const {members,products,files,writes}=await inventory();
   const consents=(await tx.query('select * from maintenance_private.household_handoff_consents where home_id=$1 order by actor_id for update',[plan.homeID])).rows;
   if(consents.length!==2||consents.some(c=>c.revoked_at)||!consents.some(c=>c.actor_id===plan.ownerID)||!consents.some(c=>c.actor_id===plan.recipientID))throw Error('Retained family consent required');
   const expected=json(journal.inventory),activated=Boolean(attachment);
   if(absent&&(attachment||household))throw Error('Initial absence cannot hide an activation receipt');
   if(activated){
    for(const file of plan.files){
     Object.assign(expected.files.find(row=>row.id===file.id),{user_id:file.destination.userID,app_epoch_id:file.destination.epoch,object_path:file.destination.path,captured_owner_id:plan.recipientID});
     Object.assign(expected.writes.find(row=>row.attachment_id===file.id),{uploader_id:file.destination.userID,app_epoch_id:file.destination.epoch,owner_id:plan.recipientID});
    }
    if(!household||!same(household.scope,scope.controllerScope)||household.successor_id!==plan.recipientID
     ||household.plan_digest!==parent.plan_digest||household.snapshot_digest!==plan.snapshotDigest
     ||attachment.plan_digest!==journal.plan_digest||attachment.inventory_digest!==journal.inventory_digest
     ||attachment.expected_inventory_digest!==digest(expected))throw Error('Matching durable activation receipts required');
    const {rows:contexts}=await tx.query('select * from maintenance_private.family_attachment_activation_contexts where request_id=$1 and home_id=$2',[plan.requestID,plan.homeID]);
    if(!contexts.some(c=>same(stable(c.scope),stable(scope))&&c.plan_digest===journal.plan_digest&&c.inventory_digest===journal.inventory_digest
     &&c.expected_inventory_digest===digest(expected)&&same(c.consents,json(consents))))throw Error('Retained activation consent required');
   }else if(household)throw Error('Partial activation receipts refused');
   if(home?.owner_id!==(activated?plan.recipientID:plan.ownerID)||!same(json({members,products,files,writes}),expected))throw Error('Exact readback inventory required');
   const {rows:quota}=await tx.query('select * from maintenance_private.family_attachment_quota where request_id=$1 and home_id=$2 order by attachment_id for update',[plan.requestID,plan.homeID]);
   const moved=plan.files.filter(f=>f.source.path!==f.destination.path);
   if(absent&&quota.length)throw Error('Initial absence cannot hide receiver quota');
   if(!absent&&(quota.length!==moved.length||moved.some(f=>!quota.some(q=>q.attachment_id===f.id&&q.recipient_id===plan.recipientID&&q.recipient_epoch===plan.recipientEpoch&&Number(q.size_bytes)===f.size&&q.state===(activated?'consumed':'reserved')))))throw Error('Exact readback quota required');
   const {rows:routes}=await tx.query('select kind,object_id,owner_id from maintenance_private.household_write_routes where home_id=$1 order by kind,object_id',[plan.homeID]);
   const tasks=(await tx.query('select x.id from public.maintenance_tasks x join public.products p on p.id=x."productId" where p."homeId"=$1 order by x.id',[plan.homeID])).rows;
   const wanted=[{kind:'homes',object_id:plan.homeID},...products.map(p=>({kind:'products',object_id:p.id})),...tasks.map(p=>({kind:'maintenance_tasks',object_id:p.id}))].map(r=>({...r,owner_id:activated?plan.recipientID:plan.ownerID})).sort((a,b)=>a.kind.localeCompare(b.kind)||a.object_id.localeCompare(b.object_id));
   if(!same(routes,wanted))throw Error('Complete readback routes required');
    // Re-read presence after awaits: an operation cannot become absent by
    // returning partial evidence or by a concurrent journal mutation.
    const {rows:[nowJournal]}=await tx.query('select * from maintenance_private.family_attachment_journals where request_id=$1 and home_id=$2 for update',[plan.requestID,plan.homeID]);
    if(absent?Boolean(nowJournal):!same(nowJournal,savedJournal))throw Error('Journal presence changed during readback');
    return activated;
   }
   const activated=await evidence();
   await consent();
   if(activated!==await evidence())throw Error('Readback changed after authorization');
   await authority();signal.throwIfAborted();
   return freeze({state:absent?'absent':activated?'activated':'prepared',planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')});
  },signal);
 };
}
