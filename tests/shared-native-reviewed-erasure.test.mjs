import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSharedNativeReviewedErasure,SHARED_NATIVE_STAGE_SQL,SHARED_NATIVE_CLEANUP_SQL} from '../lib/shared-native-reviewed-erasure.mjs';
import {deletionStages,normalizeSharedDeletionScope} from '../lib/shared-deletion-protocol.mjs';
function fixture(){
 const scope=normalizeSharedDeletionScope({protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()},{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]});
 const fixed={...scope};delete fixed.leaseToken;const prefix=deletionStages(scope).slice(0,6),receipts=Object.fromEntries(prefix.map(stage=>[stage,{...fixed,durable:true,stage,...(stage==='handoff-family'?{familyCoverageDigest:'b'.repeat(64)}:{})}]));
 const state={before:true,sealed:false,pid:19,xid:'25',phaseFalse:null,calls:[],receipts},hooks=new Map(),nativeLease=randomUUID(),signal=AbortSignal.timeout(5000);
 const tx={signal,beforeCommit:(key,check)=>hooks.set(key,check),query:async(sql,args)=>{
  if(sql.includes('select scope,status,user_id,lease_token'))return {rows:[{scope:fixed,status:'processing',user_id:scope.userID,lease_token:scope.leaseToken,live:true,receipts:state.receipts}]};
  if(sql==='select pg_backend_pid() as pid,txid_current()::text as xid')return {rows:[{pid:state.pid,xid:state.xid}]};
  assert.ok([SHARED_NATIVE_STAGE_SQL,SHARED_NATIVE_CLEANUP_SQL].includes(sql));assert.deepEqual(args.slice(0,2),[JSON.stringify(scope),nativeLease]);
  state.calls.push({sql,phase:args[2]});if(args[2]==='markComplete')state.sealed=true;
  return {rows:[{confirmed:args[2]!==state.phaseFalse}]};
 }};
 const options={scope,nativeLease,verifyBefore:async()=>state.before,verifySealed:async()=>state.sealed};
 return {scope,state,tx,options,hooks,port:createSharedNativeReviewedErasure(options),commit:async()=>{for(const fn of hooks.values())assert.equal(await fn(),true);}};
}
test('records -> review metadata -> management -> closure parent -> identity/seal use same transaction and exact separate RPC',async()=>{
 const f=fixture();assert.equal(await f.port.erase(f.scope,f.tx),true);await f.commit();
 assert.deepEqual(f.state.calls.map(x=>x.phase),['eraseRecords','eraseDeviceRegistrations','eraseReviewedMetadata','eraseManagementClaims','eraseClosureMetadata','captureReceiptSessions','eraseIdentity','markComplete']);
 assert.deepEqual(f.state.calls.filter(x=>x.sql===SHARED_NATIVE_CLEANUP_SQL).map(x=>x.phase),['eraseReviewedMetadata','eraseManagementClaims','eraseClosureMetadata']);
});
test('cleanup false cannot be caught and committed as a completed native stage',async()=>{
 const f=fixture();f.state.phaseFalse='eraseManagementClaims';await assert.rejects(f.port.erase(f.scope,f.tx),/unconfirmed/);await assert.rejects(f.commit());assert.equal(f.state.calls.some(x=>x.phase==='markComplete'),false);
});
test('independent current/seal callbacks remain required and late loss poisons owning COMMIT',async()=>{
 const f=fixture();assert.throws(()=>createSharedNativeReviewedErasure({...f.options,verifyBefore:undefined}),/independent/);
 await f.port.erase(f.scope,f.tx);f.state.sealed=false;await assert.rejects(f.commit());
});
test('wrong root scope or incomplete typed prerequisite refuses before cleanup RPC',async()=>{
 const f=fixture();await assert.rejects(f.port.erase({...f.scope,requestID:randomUUID()},f.tx),/Foreign/);assert.equal(f.state.calls.length,0);
 const g=fixture();delete g.state.receipts['verify:kakei'];await assert.rejects(g.port.erase(g.scope,g.tx),/receipt/);assert.equal(g.state.calls.length,0);
});
test('physical transaction replacement or a second execution cannot reuse prior approval',async()=>{
 const f=fixture();await f.port.erase(f.scope,f.tx);f.state.pid++;await assert.rejects(f.commit());
 const g=fixture();await g.port.erase(g.scope,g.tx);await assert.rejects(g.port.erase(g.scope,g.tx),/already used/);await assert.rejects(g.commit());
});
