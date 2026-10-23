import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {ownerReadonlyTerminalModule as m} from './fixtures/scoped-shared-consent-module.mjs';
import {normalizeSharedDeletionScope} from '../lib/shared-deletion-protocol.mjs';
function fixture(){
 const scope=normalizeSharedDeletionScope({protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]});
 const key=randomBytes(32),nativeLease=randomUUID(),past=Date.now()-3600000;
 const payload={domain:'OuchiMaintenance/owner-only-original/v1',scope,userID:scope.userID,nativeLease,sessionID:randomUUID(),epochID:scope.apps[0].scopeID,aal:'aal2',passwordAt:past-1000,authenticatedAt:past,authStateDigest:'b'.repeat(64),expiresAt:past-1000+600000};
 const row={payload:structuredClone(payload),signature:createHmac('sha256',key).update(payload.domain+'\n'+JSON.stringify(payload)).digest('hex'),backend_pid:19,snapshot_id:'25:30:26,28',read_only:true};
 const state={rows:[row],count:0},controller=new AbortController();
 const tx={signal:controller.signal,query:async(sql,args)=>{assert.equal(sql,m.OUCHI_OWNER_READONLY_TERMINAL_SQL);assert.deepEqual(args,[scope.requestID,scope.leaseToken,JSON.stringify(scope),nativeLease]);state.count++;return {rows:state.rows};}};
 const options={key,scope,completionLease:nativeLease};return {scope,key,row,state,controller,tx,options,reader:m.createOuchiOwnerReadonlyTerminalProjection(options)};
}
test('read-only projection verifies expired historical HMAC once and exposes only minimal result',async()=>{
 const f=fixture(),before=structuredClone(f.row);assert.deepEqual(Object.keys(f.reader),['read']);
 assert.deepEqual(await f.reader.read(f.tx),{state:'complete',notification:'unconfirmed',retention:'unconfirmed'});
 assert.equal(f.state.count,1);assert.deepEqual(f.row,before);assert.equal('beforeCommit' in f.tx,false);
});
test('absence is unconfirmed, not an execution capability or inferred notification',async()=>{
 const f=fixture();f.state.rows=[];assert.deepEqual(await f.reader.read(f.tx),{state:'unconfirmed'});
});
test('strict private projection metadata refuses read-write or malformed snapshot and extra PII',async()=>{
 for(const fault of ['readonly','pid','snapshot','extra','two']){
  const f=fixture();if(fault==='readonly')f.row.read_only=false;if(fault==='pid')f.row.backend_pid='19';if(fault==='snapshot')f.row.snapshot_id='invalid';if(fault==='extra')f.row.secret='forbidden';if(fault==='two')f.state.rows=[f.row,f.row];
  await assert.rejects(f.reader.read(f.tx),undefined,fault);
 }
});
test('wrong HMAC, epoch, domain, expiry arithmetic or unsigned fields refuse',async()=>{
 for(const fault of ['signature','epoch','domain','expiry','extra']){
  const f=fixture();if(fault==='signature')f.row.signature='0'.repeat(64);if(fault==='epoch')f.row.payload.epochID=randomUUID();if(fault==='domain')f.row.payload.domain='other';if(fault==='expiry')f.row.payload.expiresAt++;if(fault==='extra')f.row.payload.extra=true;
  await assert.rejects(f.reader.read(f.tx),undefined,fault);
 }
});
test('missing transaction context and cancellation before or after query refuse',async()=>{
 const f=fixture();await assert.rejects(f.reader.read({query:f.tx.query}),/transaction/);f.controller.abort();await assert.rejects(f.reader.read(f.tx));assert.equal(f.state.count,0);
 const g=fixture();const query=g.tx.query;g.tx.query=async(...args)=>{const rows=await query(...args);g.controller.abort();return rows;};await assert.rejects(g.reader.read(g.tx));
});
test('fixed key is copied and scope/native mapping is validated before reading',async()=>{
 const f=fixture();f.key.fill(0);assert.equal((await f.reader.read(f.tx)).state,'complete');
 assert.throws(()=>m.createOuchiOwnerReadonlyTerminalProjection({...f.options,key:new Uint8Array(3)}));
 assert.throws(()=>m.createOuchiOwnerReadonlyTerminalProjection({...f.options,completionLease:f.scope.leaseToken}));
});
