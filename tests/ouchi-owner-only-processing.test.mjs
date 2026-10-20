import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
import {ownerOnlyModule as m} from './fixtures/scoped-shared-consent-module.mjs';

function fixture(){
 const now=Date.now(),key=randomBytes(32),nativeLease=randomUUID();
 const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]};
 const payload={domain:'OuchiMaintenance/owner-only-original/v1',scope,userID:scope.userID,nativeLease,sessionID:randomUUID(),epochID:scope.apps[0].scopeID,aal:'aal2',passwordAt:now-2000,authenticatedAt:now-1000,authStateDigest:'b'.repeat(64),expiresAt:now-2000+600000};
 const original={payload,signature:createHmac('sha256',key).update(payload.domain+'\n'+JSON.stringify(payload)).digest('hex')};
 const state={status:'processing',pid:19,xid:'25',live:true,reads:0,frames:0,now,afterRead:()=>{},afterFrame:()=>{}};
 const controller=new AbortController(),hooks=[];
 const tx={signal:controller.signal,beforeCommit:(...args)=>hooks.push(args),query:async(sql)=>{
  if(sql===m.OUCHI_OWNER_FRAME_SQL){state.frames++;state.afterFrame();return {rows:[{status:state.status,backend_pid:state.pid,transaction_id:state.xid}]};}
  if(sql===m.OUCHI_OWNER_READ_SQL){state.reads++;state.afterRead();return {rows:[structuredClone(original)]};}
  if(sql===m.OUCHI_OWNER_AUTH_SQL)return {rows:[{auth_state_digest:'b'.repeat(64),checked_at:String(now),epoch_id:scope.apps[0].scopeID}]};
  throw Error('Only fixed read RPCs allowed');
 }};
 const projectID='hphifiqyypwyxkzfanod';
 const policyReader=Object.assign(async()=>({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>state.live});
 const options={key,scope,nativeLease,projectID,policyReader,getUser:async()=>{throw Error('No bearer reissuance allowed');},clock:()=>state.now};
 return {scope,original,state,controller,hooks,tx,options,port:m.createOuchiOwnerOnlyClaimPort(options)};
}
test('processing read is hook-free and preserves original signature and expiry for owning COMMIT reuse',async()=>{
 const f=fixture(),original=structuredClone(f.original);
 assert.equal(await f.port.verifyProcessingOriginal(f.scope,f.tx),true);
 assert.equal(await f.port.verifyProcessingOriginal(f.scope,f.tx),true);
 assert.deepEqual(f.hooks,[]);assert.deepEqual(f.original,original);
});
test('current start authority cannot become expired, historical or another app original',async()=>{
 for(const fault of ['expired','signature','domain','scope','requested']){
  const f=fixture();
  if(fault==='expired')f.port=m.createOuchiOwnerOnlyClaimPort({...f.options,clock:()=>Date.now()+600001});
  if(fault==='signature')f.original.signature='0'.repeat(64);
  if(fault==='domain')f.original.payload.domain='OtherApp/owner-only-original/v1';
  if(fault==='scope')f.original.payload.scope.inventoryDigest='f'.repeat(64);
  if(fault==='requested')f.state.status='requested';
  assert.equal(await f.port.verifyProcessingOriginal(f.scope,f.tx),false,fault);
 }
});
test('physical transaction drift, late policy loss and cancellation refuse processing',async()=>{
 for(const fault of ['pid','xid','status','policy','abort']){
  const f=fixture();f.state.afterRead=()=>{
   if(f.state.reads!==1)return;
   if(fault==='pid')f.state.pid++;
   if(fault==='xid')f.state.xid='26';
   if(fault==='status')f.state.status='requested';
   if(fault==='policy')f.state.live=false;
   if(fault==='abort')f.controller.abort();
  };
  assert.equal(await f.port.verifyProcessingOriginal(f.scope,f.tx),false,fault);
 }
});
test('a changed original between the two readbacks cannot pass even with an otherwise current frame',async()=>{
 const f=fixture();f.state.afterRead=()=>{if(f.state.reads===2)f.original.payload.authStateDigest='c'.repeat(64);};
 assert.equal(await f.port.verifyProcessingOriginal(f.scope,f.tx),false);
});
test('freshness lost during the final physical frame is refused without extending the original',async()=>{
 const f=fixture();const expiresAt=f.original.payload.expiresAt;
 f.state.afterFrame=()=>{if(f.state.frames===5)f.state.now=expiresAt;};
 assert.equal(await f.port.verifyProcessingOriginal(f.scope,f.tx),false);
 assert.equal(f.state.frames,5);assert.equal(f.original.payload.expiresAt,expiresAt);
});
