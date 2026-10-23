import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createGenerationRetentionAdmission,RETENTION_INSPECT_SQL,RETENTION_RECORD_SQL,RETENTION_READ_SQL} from '../lib/generation-retention-admission.mjs';
function fixture(){
 const now=Date.now(),scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]};
 const state={now,approved:true,evidence:true,pid:11,xid:'22',record:null,writeCount:0,policyReads:0,onPolicy:null},hooks=new Map();
 const policy={policyVersion:'synthetic-unit-not-adopted',confirmedUntil:new Date(now+300000).toISOString(),receiptLifetimeSeconds:120,evidenceDigest:'b'.repeat(64)};
 const options={scope,generationID:randomUUID(),nativeLease:randomUUID(),homes:[{homeID:randomUUID(),successorID:randomUUID()}],key:randomBytes(32),clock:()=>state.now,verifyNoDispatch:async()=>true,readApprovedPolicy:async()=>{state.policyReads++;if(state.onPolicy)state.onPolicy();return state.approved?{...policy}:null;},verifyOtherEvidence:async()=>state.evidence};
 const tx={signal:new AbortController().signal,beforeCommit:(k,f)=>hooks.set(k,f),query:async(sql,args)=>{
  const pin={backend_pid:state.pid,transaction_id:state.xid};
  if(sql===RETENTION_INSPECT_SQL)return {rows:[{target_digest:'c'.repeat(64),checked_at:new Date(now).toISOString(),...pin}]};
  if(sql===RETENTION_READ_SQL)return {rows:state.record?[{...structuredClone(state.record),...pin}]:[]};
  if(sql===RETENTION_RECORD_SQL){state.writeCount++;state.record={payload:structuredClone(args[4]),signature:args[5]};return {rows:[{ok:true}]};}
  throw Error('Unexpected SQL');
 }};
 return {state,options,scope,tx,policy,hooks,port:createGenerationRetentionAdmission(options),commit:async()=>{for(const f of hooks.values())assert.equal(await f(),true);}};
}
test('checker requires independent key, approved policy and all-evidence ports',()=>{const f=fixture();for(const name of ['key','readApprovedPolicy','verifyOtherEvidence'])assert.throws(()=>createGenerationRetentionAdmission({...f.options,[name]:null}),/Independent checker/);});
test('missing approval or any retained evidence cannot mint a certificate',async()=>{for(const field of ['approved','evidence']){const f=fixture();f.state[field]=false;await assert.rejects(f.port.issueCertificate(f.scope,f.tx));assert.equal(f.state.writeCount,0);await assert.rejects(f.commit());}});
test('original signed checker payload is immutable and issuing copy of key/options is retained',async()=>{const f=fixture();f.options.key.fill(0);f.options.scope={};f.options.homes.length=0;await f.port.issueCertificate(f.scope,f.tx);assert.equal(f.state.writeCount,1);assert.equal(f.state.record.payload.domain,'OuchiMaintenance/generation-retention-check/v1');await f.commit();});
test('wrong HMAC key and unexpected payload fields fail without overwrite',async()=>{for(const extra of [false,true]){const f=fixture();await f.port.issueCertificate(f.scope,f.tx);f.hooks.clear();const port=extra?f.port:createGenerationRetentionAdmission({...f.options,key:randomBytes(32)});if(extra)f.state.record.payload.extra=true;const tx={...f.tx};await assert.rejects(port.issueCertificate(f.scope,tx),/Exact signed generation/);assert.equal(f.state.writeCount,1);}});
test('policy lifetime must be finite integral and cannot exceed DB confirmation window',async()=>{for(const value of [null,0,-1,1.5,Infinity,2592001]){const f=fixture();f.policy.receiptLifetimeSeconds=value;await assert.rejects(f.port.issueCertificate(f.scope,f.tx));assert.equal(f.state.writeCount,0);}const f=fixture();f.policy.confirmedUntil=new Date(f.state.now+3600001).toISOString();await assert.rejects(f.port.issueCertificate(f.scope,f.tx),/Exact signed/);await assert.rejects(f.commit());});
test('late expiration, policy drift, physical connection or transaction change refuses COMMIT',async()=>{for(const field of ['expires','policy','pid','xid','evidence']){const f=fixture();await f.port.issueCertificate(f.scope,f.tx);if(field==='expires')f.state.now+=300001;if(field==='policy')f.policy.evidenceDigest='d'.repeat(64);if(field==='pid')f.state.pid++;if(field==='xid')f.state.xid='23';if(field==='evidence')f.state.evidence=false;await assert.rejects(f.commit());}});
test('deadline crossed during last policy read is rejected by final fresh read',async()=>{const f=fixture();f.state.onPolicy=()=>{if(f.state.policyReads===3)f.state.now+=300001;};await assert.rejects(f.port.issueCertificate(f.scope,f.tx));await assert.rejects(f.commit());});
test('caught repeated call cannot replace its first owning transaction guard',async()=>{const f=fixture();await f.port.issueCertificate(f.scope,f.tx);await assert.rejects(f.port.issueCertificate(f.scope,f.tx),/already used/);await assert.rejects(f.commit());});
test('foreign scope or transaction missing commit hooks cannot issue',async()=>{const f=fixture();await assert.rejects(f.port.issueCertificate({...f.scope,requestID:randomUUID()},f.tx),/Foreign/);await assert.rejects(f.port.issueCertificate(f.scope,{signal:f.tx.signal,query:f.tx.query}),/Checked/);assert.equal(f.state.writeCount,0);});
