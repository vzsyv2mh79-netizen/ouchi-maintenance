import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {preNativeLogoutModule} from './fixtures/scoped-shared-consent-module.mjs';
import {runWithTransactionCommitChecks} from '../lib/transaction-commit-checks.mjs';

const {createPreNativeAfterLogoutConsent:create,PRE_NATIVE_LOGOUT_CONSENT_SQL:sql}=preNativeLogoutModule;
const domain='OuchiMaintenance/scoped-shared-consent-auth/v1';
function fixture(){
 const key=randomBytes(32),actor=randomUUID();
 const options={key,requestID:randomUUID(),homeID:randomUUID(),rootLease:randomUUID(),nativeRequestID:randomUUID(),ownerEpoch:randomUUID(),nativeLease:randomUUID()};
 const authenticatedAt=Date.now()-3600000;
 const payload={requestID:options.requestID,homeID:options.homeID,userID:actor,sessionID:randomUUID(),aal:'aal2',authenticatedAt,authStateDigest:'a'.repeat(64),proofDomain:domain,expiresAt:authenticatedAt+600000};
 const signature=createHmac('sha256',key).update('OuchiMaintenance/original-scoped-consent/v1\n'+JSON.stringify(payload)).digest('hex');
 let rows=[{payload,signature,backend_pid:21,transaction_id:'30'}],live=true,callback=async()=>{};const calls=[];
 const verifyReadAuthority=async(tx,scope,signal)=>{assert.equal(signal,tx.signal);assert.equal(scope.actorID,actor);assert.equal(scope.requestID,options.requestID);assert.equal('key' in scope,false);await callback();return live;};
 const port=create({...options,verifyReadAuthority});
 const raw={query:async(query,args)=>{assert.equal(query,sql);assert.deepEqual(args,[options.requestID,options.homeID,actor,options.rootLease,options.nativeRequestID,options.ownerEpoch,options.nativeLease]);calls.push(query);return {rows};}};
 const run=work=>runWithTransactionCommitChecks(raw,new AbortController().signal,work);
 return {port,options,payload,signature,actor,run,raw,calls,verifyReadAuthority,set rows(v){rows=v;},set live(v){live=v;},set callback(v){callback=v;}};
}
test('expired original is historical only, immutable and unchanged through hook-free COMMIT readback',async()=>{
 const f=fixture();const expected={kind:'pre-native-after-logout-historical-consent-only',payload:f.payload,signature:f.signature};
 await f.run(async tx=>{
  const first=await f.port.read(f.actor,tx);assert.deepEqual(first,expected);assert.equal(Object.isFrozen(first.payload),true);
  assert.deepEqual(await f.port.read(f.actor,tx),first);
  tx.beforeCommit('historical-readback',async()=>{assert.deepEqual(await f.port.readSnapshot(f.actor,tx),first);return true;});
 });
 assert.ok(f.payload.expiresAt<Date.now());assert.ok(f.calls.length>=8);
});
test('current writer/read authority is mandatory and late failure refuses owning COMMIT',async()=>{
 const f=fixture();assert.throws(()=>create(f.options),/independent read authority/);
 await assert.rejects(f.run(async tx=>{assert.ok(await f.port.read(f.actor,tx));f.live=false;}),/Current transaction verification/);
});
test('callback cannot mutate the verified SQL object into another archival payload',async()=>{
 const f=fixture();f.callback=async()=>{f.payload.expiresAt++;};
 await assert.rejects(f.run(tx=>f.port.read(f.actor,tx)),/Historical frame changed/);
});
test('extra private data, wrong signature/domain or missing frame never becomes an original',async()=>{
 for(const kind of ['extra','signature','domain','missing']){
  const f=fixture();
  if(kind==='extra')f.rows=[{payload:f.payload,signature:f.signature,backend_pid:21,transaction_id:'30',rawAuth:'forbidden'}];
  if(kind==='signature')f.rows=[{payload:f.payload,signature:'b'.repeat(64),backend_pid:21,transaction_id:'30'}];
  if(kind==='domain')f.rows=[{payload:{...f.payload,proofDomain:'Kakei/scoped-owner-consent-auth-state/v1'},signature:f.signature,backend_pid:21,transaction_id:'30'}];
  if(kind==='missing'){f.rows=[];assert.equal(await f.run(tx=>f.port.read(f.actor,tx)),null);continue;}
  await assert.rejects(f.run(tx=>f.port.read(f.actor,tx)),/archival/);
 }
});
test('final independent readback is followed by exact same private frame and original',async()=>{
 const f=fixture();f.callback=async()=>{f.rows=[];};
 await assert.rejects(f.run(tx=>f.port.read(f.actor,tx)),/Historical frame changed/);
});
test('query-only contexts and cancellation cannot confirm historical read authority',async()=>{
 const f=fixture();await assert.rejects(f.port.read(f.actor,{query:f.raw.query,signal:new AbortController().signal}),/Pinned archival/);assert.equal(f.calls.length,0);
 const controller=new AbortController();controller.abort(Error('cancelled historical read'));
 await assert.rejects(runWithTransactionCommitChecks(f.raw,controller.signal,tx=>f.port.read(f.actor,tx)),/cancelled/);
});

test('physical transaction drift is refused again at owning COMMIT',async()=>{
 const f=fixture();await assert.rejects(f.run(async tx=>{await f.port.read(f.actor,tx);f.rows=[{payload:f.payload,signature:f.signature,backend_pid:22,transaction_id:'31'}];}),/Current transaction verification/);
});
