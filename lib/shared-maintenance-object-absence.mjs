import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const states=new WeakMap();
/** Disabled SQL acknowledgement only: never sends Storage requests.
 * The caller must first obtain definitive SDK NoSuchKey for this frozen object,
 * use one dedicated checked SQL transaction and roll back every rejection.
 * The private SQL capability independently enforces both leases, ordered shared
 * prerequisites, original object identity, quiet writers and Storage metadata
 * absence. Current cross-app family/session/writer gates are mandatory and
 * repeated before the owning COMMIT. No connection, grant or route is created.
 */
export async function confirmSharedMaintenanceObjectAbsence(tx,value,nativeValue,attachmentID,verifyCurrentGates){
 if(!tx||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal)||typeof verifyCurrentGates!=='function')throw Error('Checked transaction and current object gates required');
 const signal=tx.signal;let state=states.get(tx);
 try{
  const scope=normalizeSharedDeletionScope(value),native=Object.freeze({...nativeValue});
  const app=scope.apps.find(a=>a.app==='ouchi-maintenance');
  if(!app||Object.keys(native).sort().join(',')!=='epochID,leaseToken,requestID,userID'||!Object.values(native).every(uuid)||!uuid(attachmentID)
   ||native.requestID!==app.requestID||native.epochID!==app.scopeID||native.userID!==scope.userID||native.leaseToken===scope.leaseToken)throw Error('Exact object shared/native mapping required');
  const key=JSON.stringify([scope,native]);
  if(state&&(state.key!==key||state.verify!==verifyCurrentGates||state.failed))throw Error('Object transaction changed or failed');
  if(!state){state={key,verify:verifyCurrentGates,failed:false,objects:new Set()};states.set(tx,state);}
  const original=state,args=[scope,native.leaseToken,attachmentID];
  const query=async(sql,values)=>{signal.throwIfAborted();const result=await tx.query(sql,values);signal.throwIfAborted();return result;};
  const current=async()=>{
   if(original.failed||await original.verify(tx,scope,native,signal)!==true)throw Error('Current object scope gates required');
   const row=(await query('select maintenance_private.shared_native_attachment_scope_is_current($1::jsonb,$2::uuid) current',args.slice(0,2))).rows[0];
   if(row?.current!==true)throw Error('Current shared/native attachment scope required');
  };
  const confirmed=async()=>{await current();return (await query('select maintenance_private.shared_native_object_absence_is_confirmed($1::jsonb,$2::uuid,$3::uuid) confirmed',args)).rows[0]?.confirmed===true;};
  await current();
  const row=(await query('select maintenance_private.confirm_shared_native_object_absence($1::jsonb,$2::uuid,$3::uuid) confirmed',args)).rows[0];
  if(row?.confirmed!==true||await confirmed()!==true)throw Error('Durable exact object absence unconfirmed');
  if(!original.objects.has(attachmentID)){
   tx.beforeCommit('shared-object:'+native.requestID+':'+attachmentID,async()=>{
    try{return !original.failed&&await confirmed()===true&&!signal.aborted;}catch{original.failed=true;return false;}
   });original.objects.add(attachmentID);
  }
  return true;
 }catch(error){if(state)state.failed=true;throw error;}
}
