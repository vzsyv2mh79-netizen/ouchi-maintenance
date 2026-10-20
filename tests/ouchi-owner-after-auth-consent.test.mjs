import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {ownerAfterAuthModule as m} from './fixtures/scoped-shared-consent-module.mjs';
import {normalizeSharedDeletionScope} from '../lib/shared-deletion-protocol.mjs';
function fixture(){
 const scope=normalizeSharedDeletionScope({protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]});
 const key=randomBytes(32),nativeLease=randomUUID(),past=Date.now()-3600000;
 const payload={domain:'OuchiMaintenance/owner-only-original/v1',scope,userID:scope.userID,nativeLease,sessionID:randomUUID(),epochID:scope.apps[0].scopeID,aal:'aal2',passwordAt:past-1000,authenticatedAt:past,authStateDigest:'b'.repeat(64),expiresAt:past-1000+600000};
 const row={payload:structuredClone(payload),signature:createHmac('sha256',key).update(payload.domain+'\n'+JSON.stringify(payload)).digest('hex'),backend_pid:19,transaction_id:'25'};
 const state={row,authority:true,recreation:true,reads:0,returnRows:()=>[state.row],verify:async()=>state.authority};
 const controller=new AbortController(),hooks=new Map();
 const tx={signal:controller.signal,beforeCommit:(name,fn)=>{assert.equal(hooks.has(name),false);hooks.set(name,fn);},query:async(sql,args)=>{
  assert.equal(sql,m.OUCHI_OWNER_AFTER_AUTH_SQL);assert.deepEqual(args,[scope.requestID,scope.leaseToken,JSON.stringify(scope),nativeLease]);state.reads++;return {rows:state.returnRows()};
 }};
 const options={key,scope,completionLease:nativeLease,verifyAuthRecreationFence:async(t,s,signal)=>{assert.equal(t,tx);assert.deepEqual(s,scope);assert.equal(signal,controller.signal);return state.recreation;},verifyReadAuthority:async(t,s,signal)=>{assert.equal(t,tx);assert.deepEqual(s,scope);assert.equal(signal,controller.signal);return state.verify();}};
 return {scope,key,nativeLease,payload,state,controller,hooks,tx,options,reader:m.createOuchiOwnerAfterAuthConsent(options),commit:async()=>{for(const hook of hooks.values())if(await hook()!==true)throw Error('COMMIT refused');}};
}
test('expired original is preserved as owner-only history, with independent readback and owning COMMIT',async()=>{
 const f=fixture(),original=structuredClone(f.state.row);
 const result=await f.reader.read(f.tx);assert.equal(result.kind,'owner-only-post-auth-processing-history');assert.ok(result.payload.expiresAt<Date.now());
 assert.deepEqual(result.payload,f.payload);assert.equal(result.signature,original.signature);assert.ok(Object.isFrozen(result.payload.scope.apps));
 await f.commit();assert.deepEqual(f.state.row,original);assert.equal(f.hooks.size,1);
 assert.ok(await f.reader.readSnapshot(f.tx));assert.equal(f.hooks.size,1,'Hook-free final verifier cannot register another hook');
});
test('independent read authority is mandatory and never defaults to success',async()=>{
 const f=fixture();assert.throws(()=>m.createOuchiOwnerAfterAuthConsent({...f.options,verifyReadAuthority:undefined}),/authority/);
 f.state.authority=false;await assert.rejects(f.reader.read(f.tx),/authority/);await assert.rejects(f.commit(),/COMMIT refused/);
 f.state.authority=true;await assert.rejects(f.reader.read(f.tx),/Previously refused/);
});
test('SQL absence cannot be caught and committed as positive read authority',async()=>{
 const f=fixture();f.state.returnRows=()=>[];assert.equal(await f.reader.read(f.tx),null);await assert.rejects(f.commit(),/COMMIT refused/);
});
test('wrong HMAC, epoch, domain, extra payload/private data and malformed physical frame refuse',async()=>{
 for(const fault of ['signature','epoch','domain','extra','private','pid','xid']){
  const f=fixture();
  if(fault==='signature')f.state.row.signature='0'.repeat(64);
  if(fault==='epoch')f.state.row.payload.epochID=randomUUID();
  if(fault==='domain')f.state.row.payload.domain='OtherApp/owner-only-original/v1';
  if(fault==='extra')f.state.row.payload.extra=true;
  if(fault==='private')f.state.row.password='forbidden';
  if(fault==='pid')f.state.row.backend_pid='19';
  if(fault==='xid')f.state.row.transaction_id='0';
  await assert.rejects(f.reader.read(f.tx),undefined,fault);await assert.rejects(f.commit(),/COMMIT refused/);
 }
});
test('mutable SQL row cannot rewrite the independently verified original during callback',async()=>{
 const f=fixture();f.state.verify=async()=>{f.state.row.payload.expiresAt++;return true;};
 await assert.rejects(f.reader.read(f.tx),/frame changed/);await assert.rejects(f.commit(),/COMMIT refused/);
});
test('late authority loss or physical drift refuses the owning COMMIT',async()=>{
 for(const fault of ['authority','pid','xid','cancel','absence']){
  const f=fixture();assert.ok(await f.reader.read(f.tx));
  if(fault==='authority')f.state.authority=false;
  if(fault==='pid')f.state.row.backend_pid++;
  if(fault==='xid')f.state.row.transaction_id='26';
  if(fault==='cancel')f.controller.abort();
  if(fault==='absence')f.state.returnRows=()=>[];
  await assert.rejects(f.commit(),/COMMIT refused/,fault);
 }
});
test('query-only and cancelled contexts never receive historical authority',async()=>{
 const f=fixture();await assert.rejects(f.reader.readSnapshot({signal:f.tx.signal,query:f.tx.query}),/Checked owning/);
 f.controller.abort();await assert.rejects(f.reader.read(f.tx));
});

test('independent Auth recreation/reenrollment exclusion is mandatory, separate and fresh at COMMIT',async()=>{
 const f=fixture();assert.throws(()=>m.createOuchiOwnerAfterAuthConsent({...f.options,verifyAuthRecreationFence:undefined}),/authority/);
 assert.ok(await f.reader.read(f.tx));f.state.recreation=false;await assert.rejects(f.commit(),/COMMIT refused/);
 const absent=fixture();absent.state.recreation=false;await assert.rejects(absent.reader.read(absent.tx),/recreation/);await assert.rejects(absent.commit(),/COMMIT refused/);
});
test('Auth exclusion is read again after current inventory and writer checks',async()=>{
 const f=fixture();f.state.verify=async()=>{f.state.recreation=false;return true;};
 await assert.rejects(f.reader.read(f.tx),/recreation/);await assert.rejects(f.commit(),/COMMIT refused/);
});
