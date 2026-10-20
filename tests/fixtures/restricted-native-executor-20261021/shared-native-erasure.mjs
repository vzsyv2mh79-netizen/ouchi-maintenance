import {normalizeSharedDeletionScope} from './shared-deletion.mjs';
import {requireDeletionPrerequisites} from './shared-deletion-journal.mjs';

export const SHARED_NATIVE_STAGE_SQL='select maintenance_private.execute_shared_native_stage($1::jsonb,$2::uuid,$3::text) as confirmed';
const phases=Object.freeze(['eraseRecords','eraseDeviceRegistrations','captureReceiptSessions','eraseIdentity','markComplete']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Dormant owning-transaction port. Only the fixed private RPC is used; never
 * raw canonical erasers or an owner connection. verifyBefore must independently
 * pin actual session absence, family checkpoint/fences and retained bytes.
 * verifySealed must read the exact native completion/original family evidence.
 * No database, default verifier, grant, endpoint or completion receipt supplied.
 */
export function createSharedNativeErasure({scope,nativeLease,verifyBefore,verifySealed}){
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
   const rows=(await tx.query(SHARED_NATIVE_STAGE_SQL,[JSON.stringify(fixed),nativeLease,phase])).rows;
   if(tx.signal.aborted||rows?.length!==1||Object.keys(rows[0]).join(',')!=='confirmed'||rows[0].confirmed!==true)throw Error('Native durable phase unconfirmed');
  }
  if(await verifySealed(fixed,tx)!==true||!matches(state.pin,await frame(tx)))throw Error('Native sealed readback unconfirmed');
  state.valid=true;return true;
 }});
}
