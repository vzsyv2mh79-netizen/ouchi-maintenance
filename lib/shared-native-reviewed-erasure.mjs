import {normalizeSharedDeletionScope,deletionStages} from './shared-deletion-protocol.mjs';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
async function requireDeletionPrerequisites(tx,scope){
 const r=(await tx.query("select scope,status,user_id,lease_token,lease_until>clock_timestamp() as live,receipts from private.kb_shared_deletion_journal where request_id=$1 for update",[scope.requestID])).rows[0];
 const fixed={...scope};delete fixed.leaseToken;
 if(!r||r.status!=='processing'||r.user_id!==scope.userID||r.lease_token!==scope.leaseToken||r.live!==true||canonical(r.scope)!==canonical(fixed))throw Error('Exact native root required');
 const stages=deletionStages(scope),end=stages.indexOf('erase:ouchi-maintenance');
 for(const stage of stages.slice(0,end)){
  const proof=r.receipts[stage],base={...proof};delete base.durable;delete base.stage;
  if(stage==='handoff-family'){if(typeof base.familyCoverageDigest!=='string'||!/^[a-f0-9]{64}$/.test(base.familyCoverageDigest))throw Error('Exact family checkpoint required');delete base.familyCoverageDigest;}
  if(proof?.durable!==true||proof.stage!==stage||canonical(base)!==canonical(fixed))throw Error('Exact native prerequisite receipt required');
 }
}

export const SHARED_NATIVE_STAGE_SQL='select maintenance_private.execute_shared_native_stage($1::jsonb,$2::uuid,$3::text) as confirmed';
export const SHARED_NATIVE_CLEANUP_SQL='select maintenance_private.execute_shared_native_cleanup($1::jsonb,$2::uuid,$3::text) as confirmed';
const cleanupPhases=new Set(['eraseReviewedMetadata','eraseManagementClaims','eraseClosureMetadata']);
const phases=Object.freeze(['eraseRecords','eraseDeviceRegistrations','eraseReviewedMetadata','eraseManagementClaims','eraseClosureMetadata','captureReceiptSessions','eraseIdentity','markComplete']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Separate local candidate extending the fixed native port. Records/device
 * cleanup precedes reviewed metadata; review metadata precedes closure-parent
 * erasure; management claims precede native identity/completion. Canonical
 * user-wide erasers are permitted only when ALL their affected source rows
 * match this exact native request/epoch/review inventory; foreign epoch/request
 * data makes the entire owning transaction refuse/roll back, not expand scope.
 * Existing frozen executor is unchanged. No live role/migration/activation.
 * Dormant owning-transaction port. Only the fixed private RPC is used; never
 * raw canonical erasers or an owner connection. verifyBefore must independently
 * pin actual session absence, family checkpoint/fences and retained bytes.
 * verifySealed must read the exact native completion/original family evidence.
 * No database, default verifier, grant, endpoint or completion receipt supplied.
 */
export function createSharedNativeReviewedErasure({scope,nativeLease,verifyBefore,verifySealed}){
 const fixed=normalizeSharedDeletionScope(structuredClone(scope)),identity=JSON.stringify(fixed);
 if(!fixed.apps.some(a=>a.app==='ouchi-maintenance')||typeof nativeLease!=='string'||!uuid.test(nativeLease)||/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(nativeLease)||nativeLease.toLowerCase()===fixed.leaseToken.toLowerCase()||[verifyBefore,verifySealed].some(f=>typeof f!=='function'))throw Error('Fixed native mapping and independent gates required');
 const transactions=new WeakMap();
 async function frame(tx){
  await requireDeletionPrerequisites(tx,fixed,'erase:ouchi-maintenance');
  const rows=(await tx.query('select pg_backend_pid() as pid,txid_current()::text as xid')).rows;
  if(tx.signal.aborted||rows?.length!==1||!Number.isSafeInteger(rows[0].pid)||rows[0].pid<=0||typeof rows[0].xid!=='string'||!/^[1-9][0-9]*$/.test(rows[0].xid))throw Error('Pinned native transaction required');
  return rows[0];
 }
 const matches=(a,b)=>a?.pid===b?.pid&&a?.xid===b?.xid;
 return Object.freeze({async erase(value,tx){
  if(!(tx?.signal instanceof AbortSignal)||tx.signal.aborted||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function')throw Error('Checked native owning transaction required');
  const previous=transactions.get(tx);if(previous){previous.valid=false;throw Error('Native port already used in this transaction');}
  const state={valid:false,pin:null};transactions.set(tx,state);
  tx.beforeCommit('shared-native-erasure:'+fixed.requestID,async()=>state.valid&&matches(state.pin,await frame(tx))&&await verifySealed(fixed,tx)===true&&matches(state.pin,await frame(tx)));
  if(JSON.stringify(normalizeSharedDeletionScope(value))!==identity)throw Error('Foreign native scope refused');
  state.pin=await frame(tx);
  if(await verifyBefore(fixed,tx)!==true||!matches(state.pin,await frame(tx)))throw Error('Current native prerequisites unconfirmed');
  for(const phase of phases){
   if(!matches(state.pin,await frame(tx)))throw Error('Native transaction changed');
   const rows=(await tx.query(cleanupPhases.has(phase)?SHARED_NATIVE_CLEANUP_SQL:SHARED_NATIVE_STAGE_SQL,[JSON.stringify(fixed),nativeLease,phase])).rows;
   if(tx.signal.aborted||rows?.length!==1||Object.keys(rows[0]).join(',')!=='confirmed'||rows[0].confirmed!==true)throw Error('Native durable phase unconfirmed');
  }
  if(await verifySealed(fixed,tx)!==true||!matches(state.pin,await frame(tx)))throw Error('Native sealed readback unconfirmed');
  state.valid=true;return true;
 }});
}
