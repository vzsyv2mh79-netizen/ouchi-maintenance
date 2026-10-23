import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const states=new WeakMap();
/** Dormant SQL-only post-handoff inventory boundary. The provider must verify
 * original complete family targets/completions, other-app obligations, sessions
 * and writer coverage on this same checked connection. It is mandatory and
 * repeated before COMMIT; no Storage side effect, role, route or connection is
 * created. The canonical SQL keeps its refusal while other family members
 * remain in an owned home. Existing captured inventory is never widened.
 */
export async function captureSharedMaintenanceInventory(tx,value,nativeValue,verifyCurrentGates){
 if(!tx||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal)||typeof verifyCurrentGates!=='function')throw Error('Checked capture transaction and current gates required');
 let state=states.get(tx);const signal=tx.signal;
 try{
  const scope=normalizeSharedDeletionScope(value),native=Object.freeze({...nativeValue});
  const app=scope.apps.find(a=>a.app==='ouchi-maintenance');
  if(!app||Object.keys(native).sort().join(',')!=='epochID,leaseToken,requestID,userID'||!Object.values(native).every(uuid)
   ||native.requestID!==app.requestID||native.epochID!==app.scopeID||native.userID!==scope.userID||native.leaseToken===scope.leaseToken)throw Error('Exact capture shared/native mapping required');
  const key=JSON.stringify([scope,native]);
  if(state&&(state.key!==key||state.verify!==verifyCurrentGates||state.failed))throw Error('Capture transaction changed or failed');
  if(!state){state={key,verify:verifyCurrentGates,failed:false,registered:false,ready:false};states.set(tx,state);}
  const original=state,args=[scope,native.leaseToken];
  const query=async sql=>{signal.throwIfAborted();const r=await tx.query(sql,args);signal.throwIfAborted();return r.rows[0];};
  const current=async captured=>{
   if(original.failed||await original.verify(tx,scope,native,signal)!==true)throw Error('Current family capture gates required');
   const row=await query(captured?'select maintenance_private.shared_native_attachment_scope_is_current($1::jsonb,$2::uuid) current':'select maintenance_private.shared_native_capture_scope_is_current($1::jsonb,$2::uuid) current');
   if(row?.current!==true)throw Error('Current exact capture authority required');
   return true;
  };
  original.ready=false;
  if(!original.registered){
   tx.beforeCommit('shared-capture:'+native.requestID,async()=>{
    try{return original.ready&&!original.failed&&await current(true)===true&&!signal.aborted;}catch{original.failed=true;return false;}
   });original.registered=true;
  }
  await current(false);
  if((await query('select maintenance_private.capture_shared_native_deletion_objects($1::jsonb,$2::uuid) captured'))?.captured!==true)throw Error('Canonical capture unconfirmed');
  await current(true);original.ready=true;return true;
 }catch(error){if(state)state.failed=true;throw error;}
}
