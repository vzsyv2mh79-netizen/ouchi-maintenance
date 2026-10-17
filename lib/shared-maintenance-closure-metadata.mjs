import {normalizeSharedDeletionScope,deletionStages} from './shared-deletion-protocol.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const states=new WeakMap();
const identitySQL='select pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as transaction_id';
function mapping(value,native){
 const shared=normalizeSharedDeletionScope(value),app=shared.apps.find(item=>item.app==='ouchi-maintenance');
 if(!native||Object.keys(native).sort().join(',')!=='epochID,leaseToken,requestID,userID'||!Object.values(native).every(uuid)
  ||!app||native.requestID!==app.requestID||native.userID!==shared.userID||native.epochID!==app.scopeID||native.leaseToken===shared.leaseToken)throw Error('Fixed shared/native mapping required');
 const fixedNative=Object.freeze({...native}),inventory={...shared};delete inventory.leaseToken;
 const stage='erase:ouchi-maintenance',required=deletionStages(shared).slice(0,deletionStages(shared).indexOf(stage));
 return {shared,native:fixedNative,inventory,required,key:JSON.stringify([shared,fixedNative])};
}
function assertIdentity(row,expected){
 if(!Number.isSafeInteger(row?.pid)||row.pid<=0||typeof row.transaction_id!=='string'||!/^\d+$/.test(row.transaction_id)
  ||(expected&&(row.pid!==expected.pid||row.transaction_id!==expected.transaction_id)))throw Error('Same pinned transaction required');
 return Object.freeze({pid:row.pid,transaction_id:row.transaction_id});
}
/** Partial backend integration for ports.atomic's native record/device/session/identity/completion SQL stages.
 * tx MUST be the shared journal's existing dedicated transaction, wrapped by
 * runWithTransactionCommitChecks before its owning COMMIT. No connection/RPC
 * client, credentials, grants, scheduler or defaults are created here.
 * work receives this SAME tx and must execute the reviewed native SQL stage on
 * it; do not pass storedDeletionDependencies or a network/Storage callback.
 * The owner must ROLLBACK every rejection. Other worker stages, fresh complete
 * writer/family/session coverage and retention adoption remain mandatory.
 * verifyCurrentGates is the independently reviewed READ-ONLY current gate
 * provider on this same tx, not a client flag or a prior-stage receipt. Reuse
 * the same provider across stages; there is deliberately no default approval.
 */
export async function withSharedMaintenanceClosureMetadata(tx,value,native,stage,work,verifyCurrentGates){
 if(!tx||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal)
  ||!['eraseRecords','eraseDeviceRegistrations','captureReceiptSessions','eraseIdentity','markComplete'].includes(stage)||typeof work!=='function'||typeof verifyCurrentGates!=='function')throw Error('Checked shared transaction, current gates and SQL stage required');
 let fixed;
 try{fixed=mapping(value,native);}catch(error){const prior=states.get(tx);if(prior)prior.failed=true;throw error;}
 const signal=tx.signal,args=[fixed.native.requestID,fixed.native.userID,fixed.native.epochID,fixed.native.leaseToken];
 signal.throwIfAborted();
 let state=states.get(tx);
 if(state&&(state.key!==fixed.key||state.failed||state.verify!==verifyCurrentGates)){state.failed=true;throw Error('Transaction scope/provider replacement or failed stage refused');}
 if(!state){state={key:fixed.key,verify:verifyCurrentGates,identity:assertIdentity((await tx.query(identitySQL)).rows[0]),completed:false,recordsAcknowledged:false,sessionsAcknowledged:false,identityAcknowledged:false,registered:false,failed:false};states.set(tx,state);}
 try{
 const sameConnection=async()=>{signal.throwIfAborted();assertIdentity((await tx.query(identitySQL)).rows[0],state.identity);};
 const pin=async(allowCompleted=false)=>{
  await sameConnection();
  // The shared journal owns this lock before invoking ports.atomic. Acquire it
  // again on the same transaction, then the participant and native-row locks.
  const journal=(await tx.query(`select j.scope=$4::jsonb as scope_matches,
   j.user_id=$2 and j.status='processing' and j.lease_token=$3 and j.lease_until>clock_timestamp() as live,
   not exists(select 1 from unnest($5::text[]) prior where j.receipts->prior->>'durable' is distinct from 'true'
    or j.receipts->prior->>'stage' is distinct from prior
    or (case when prior='handoff-family' then ((j.receipts->prior)-'durable'-'stage'-'familyCoverageDigest') else ((j.receipts->prior)-'durable'-'stage') end) is distinct from j.scope) as prerequisites,
   j.receipts->'handoff-family' as family_receipt,
   pg_catalog.to_regclass('maintenance_private.shared_family_stage_contexts') is not null as family_checkpoint_required
   from private.kb_shared_deletion_journal j where j.request_id=$1 for update`,
  [fixed.shared.requestID,fixed.shared.userID,fixed.shared.leaseToken,JSON.stringify(fixed.inventory),fixed.required])).rows[0];
  if(journal?.scope_matches!==true||journal.live!==true||journal.prerequisites!==true)throw Error('Current shared lease and prerequisites required');
  const family=journal.family_receipt;
  if(journal.family_checkpoint_required===true||Object.hasOwn(family??{},'familyCoverageDigest')){
   if(typeof family?.familyCoverageDigest!=='string'||!/^[a-f0-9]{64}$/.test(family.familyCoverageDigest))throw Error('Current verified family checkpoint required');
   const proof=(await tx.query(`select exists(select 1 from maintenance_private.shared_family_stage_contexts c
    where c.request_id=$1 and (c.scope-'leaseToken')=$2::jsonb
     and c.receipt=$3::jsonb and c.coverage_digest=$4) as verified`,
   [fixed.shared.requestID,JSON.stringify(fixed.inventory),JSON.stringify(family),family.familyCoverageDigest])).rows[0];
   if(proof?.verified!==true)throw Error('Current verified family checkpoint required');
  }
  await tx.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1::text))',[fixed.shared.userID]);
  const binding=(await tx.query(`select b.scope=$2::jsonb and b.native_lease=$3 and b.state='processing' and b.lease_until>clock_timestamp() and f.stopped as current
   from maintenance_private.household_stop_bindings b join maintenance_private.household_principal_fences f on f.user_id=b.user_id
   where b.user_id=$1 for update of b,f`,
  [fixed.shared.userID,JSON.stringify(fixed.shared),fixed.native.leaseToken])).rows[0];
  if(binding?.current!==true)throw Error('Current frozen native binding required');
  const row=(await tx.query(`select n.user_id=$2 and n.app_epoch_id=$3 as scope_matches,
   n.state='running' and n.lease_token=$4 and n.lease_until>clock_timestamp() as live,
   public.maintenance_deletion_completion_is_confirmed($1,$2,$3,$4) as completed
   from maintenance_private.account_deletion_requests n where n.id=$1 for update`,args)).rows[0];
  if(row?.scope_matches!==true||(!allowCompleted&&row.live!==true)||(allowCompleted&&row.live!==true&&row.completed!==true))throw Error('Current native lease required');
  await sameConnection();return row;
 };
 const current=async(allowCompleted=false)=>{
  await pin(allowCompleted);
  if(await state.verify(tx,fixed.shared,fixed.native,signal)!==true)throw Error('Current family/session/writer gates required');
  signal.throwIfAborted();return pin(allowCompleted);
 };
 const metadataAbsent=async()=>{
  const row=(await tx.query(`select not exists(select 1 from maintenance_private.account_closure_reviews where user_id=$1)
   and not exists(select 1 from maintenance_private.closure_reauth_markers where user_id=$1) as absent`,[fixed.native.userID])).rows[0];
  return row?.absent===true;
 };
 const devicesAbsent=async()=>{
  const row=(await tx.query(`select
   not exists(select 1 from public.maintenance_push_subscriptions where user_id=$1)
   and not exists(select 1 from public.maintenance_push_test_limits where user_id=$1)
   and not exists(select 1 from maintenance_private.native_notification_devices where user_id=$1)
   and not exists(select 1 from maintenance_private.native_delivery_identities where user_id=$1)
   and not exists(select 1 from maintenance_private.native_notification_jobs j
    join maintenance_private.private_writer_routes r on r.kind='device' and r.object_id=j.device_id
    where r.principal=$1) as absent`,[fixed.native.userID])).rows[0];
  return row?.absent===true;
 };
 if(!state.registered){
  tx.beforeCommit('shared-closure:'+fixed.shared.requestID+':'+fixed.native.leaseToken,async()=>{
   if(state.failed)return false;
   const row=await current(state.completed);
   const records=state.recordsAcknowledged?(await tx.query('select records_erased from maintenance_private.account_deletion_requests where id=$1',[fixed.native.requestID])).rows[0]?.records_erased===true:true;
   const checkpoints=(await tx.query('select receipt_sessions_captured,identity_erased from maintenance_private.account_deletion_requests where id=$1',[fixed.native.requestID])).rows[0];
   const identity=state.identityAcknowledged&&!state.completed?(await tx.query('select public.maintenance_deletion_identity_is_erased($1,$2,$3,$4) erased',args)).rows[0]?.erased===true:true;
   return records&&identity&&(!state.devicesAcknowledged||await devicesAbsent())&&(!state.sessionsAcknowledged||checkpoints?.receipt_sessions_captured===true)
    &&(!state.identityAcknowledged||checkpoints?.identity_erased===true)&&(!state.completed||row.completed===true)&&await metadataAbsent();
  });state.registered=true;
 }
 const first=await current(stage==='markComplete');
 if(first.completed===true)state.completed=true;
 if(first.completed===true){
  if(!await metadataAbsent())throw Error('Completed metadata absence unconfirmed');
  if(stage==='eraseDeviceRegistrations'){
   if(!await devicesAbsent())throw Error('Completed device registration absence unconfirmed');
   state.devicesAcknowledged=true;
  }
  return true; // Exact sealed completion readback; never renew or erase anew.
 }
 const erased=(await tx.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4) as erased',args)).rows[0];
 if(erased?.erased!==true||!await metadataAbsent())throw Error('Closure metadata erasure unconfirmed');
 signal.throwIfAborted();
 if(await work(tx,fixed.native)!==true)throw Error('Native SQL stage unconfirmed');
 const after=await current(stage==='markComplete');
 if(stage==='markComplete'){
  if(after.completed!==true)throw Error('Sealed native completion required');
  state.completed=true;
 }else if(stage==='eraseRecords'){
  if((await tx.query('select records_erased from maintenance_private.account_deletion_requests where id=$1',[fixed.native.requestID])).rows[0]?.records_erased!==true)throw Error('Native record erasure unconfirmed');
  state.recordsAcknowledged=true;
 }else if(stage==='eraseDeviceRegistrations'){
  if(!await devicesAbsent())throw Error('Native device registration absence unconfirmed');
  state.devicesAcknowledged=true;
 }else if(stage==='captureReceiptSessions'){
  if((await tx.query('select receipt_sessions_captured from maintenance_private.account_deletion_requests where id=$1',[fixed.native.requestID])).rows[0]?.receipt_sessions_captured!==true)throw Error('Native session snapshot unconfirmed');
  state.sessionsAcknowledged=true;
 }else{
  if((await tx.query('select public.maintenance_deletion_identity_is_erased($1,$2,$3,$4) erased',args)).rows[0]?.erased!==true)throw Error('Native identity erasure unconfirmed');
  state.identityAcknowledged=true;
 }
 if(!await metadataAbsent())throw Error('Closure metadata reappeared');
 signal.throwIfAborted();return true;
 }catch(error){state.failed=true;throw error;}
}
