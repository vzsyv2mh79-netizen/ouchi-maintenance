import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {confirmSharedMaintenanceObjectAbsence as confirm} from '../lib/shared-maintenance-object-absence.mjs';
function fixture(){
 const user=randomUUID(),native={requestID:randomUUID(),userID:user,epochID:randomUUID(),leaseToken:randomUUID()};
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:user,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:native.requestID,scopeID:native.epochID}]};
 const controller=new AbortController(),checks=[],calls=[];let live=true,ack=true,allowed=true;
 const gates=async()=>allowed;
 const tx={signal:controller.signal,beforeCommit:(name,read)=>checks.push([name,read]),query:async(sql,args)=>{
  calls.push(sql);assert.deepEqual(args.slice(0,2),[scope,native.leaseToken]);
  return {rows:[sql.includes('scope_is_current')?{current:live}:{confirmed:ack}]};
 }};
 const id=randomUUID();
 return {scope,native,id,controller,checks,calls,tx,gates,confirm:()=>confirm(tx,scope,native,id,gates),expire:()=>{live=false;},lose:()=>{ack=false;},deny:()=>{allowed=false;}};
}
test('exact acknowledgement uses SQL only and repeats current gates and readback before commit',async()=>{
 const f=fixture();assert.equal(await f.confirm(),true);assert.equal(f.checks.length,1);assert.equal(await f.checks[0][1](),true);
 assert.equal(f.calls.filter(s=>s.includes('confirm_shared_native_object_absence')).length,1);
 f.expire();assert.equal(await f.checks[0][1](),false);
});
test('foreign native identity, equal leases, malformed object and absent gates do not acknowledge',async()=>{
 const f=fixture();
 for(const [n,id] of [[{...f.native,userID:randomUUID()},f.id],[{...f.native,leaseToken:f.scope.leaseToken},f.id],[f.native,'../../foreign']]){
  await assert.rejects(confirm(f.tx,f.scope,n,id,f.gates),/mapping|required/);
 }
 assert.equal(f.calls.length,0);
 await assert.rejects(confirm(f.tx,f.scope,f.native,f.id,undefined),/current object gates/);
});
test('current scope or gate denial occurs before the acknowledgement SQL',async()=>{
 for(const mode of ['scope','gate']){const f=fixture();if(mode==='scope')f.expire();else f.deny();await assert.rejects(f.confirm(),/Current/);assert.equal(f.calls.some(s=>s.includes('confirm_shared')),false);}
});
test('lost readback and swallowed later failures poison the existing commit check',async()=>{
 const f=fixture();await f.confirm();f.lose();await assert.rejects(f.confirm(),/unconfirmed/);assert.equal(await f.checks[0][1](),false);
});
test('provider replacement on the same transaction cannot replace the original check',async()=>{
 const f=fixture();await f.confirm();await assert.rejects(confirm(f.tx,f.scope,f.native,f.id,async()=>true),/changed or failed/);assert.equal(await f.checks[0][1](),false);
});
test('cancellation during SQL cannot return an acknowledgement',async()=>{
 const f=fixture(),query=f.tx.query;f.tx.query=async(...args)=>{const value=await query(...args);f.controller.abort();return value;};
 await assert.rejects(f.confirm(),{name:'AbortError'});assert.equal(f.checks.length,1);assert.equal(await f.checks[0][1](),false);
});

test('a lost first successful SQL acknowledgement cannot commit when caller swallows its rejection',async()=>{
 const f=fixture(),query=f.tx.query;f.tx.query=async(...args)=>{const result=await query(...args);if(args[0].includes('confirm_shared_native_object_absence'))throw Error('Successful statement reply lost');return result;};
 await assert.rejects(f.confirm());assert.equal(f.checks.length,1);assert.equal(await f.checks[0][1](),false);
});
