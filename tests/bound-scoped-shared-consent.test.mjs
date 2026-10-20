import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {scopedModule,boundScopedModule as m} from './fixtures/scoped-shared-consent-module.mjs';
const requestID='11111111-1111-4111-8111-111111111111',homeID='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333',session='44444444-4444-4444-8444-444444444444',nativeLease='55555555-5555-4555-8555-555555555555',rootLease='66666666-6666-4666-8666-666666666666',projectID='hphifiqyypwyxkzfanod';
function fixture(){
 let now=Date.now(),saved=null,authCalls=0,currentPolicy=true,rowsOverride=null;const checks=new Map(),calls=[];
 const authTime=(Math.floor(now/1000)-10)*1000;
 const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,iat:authTime/1000-5,exp:Math.floor(now/1000)+3600,aal:'aal2',iss:'https://'+projectID+'.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',is_anonymous:false,amr:[{method:'totp',timestamp:authTime/1000}]})).toString('base64url')+'.c2ln';
 const policy={projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null};
 const policyReader=Object.assign(async()=>policy,{isCurrent:p=>p===policy&&currentPolicy});
 const options={projectID,requestID,homeID,nativeLease,rootLease,key:randomBytes(32),policyReader,clock:()=>now,getUser:async()=>{authCalls++;return{data:{user:{id:user}},error:null};}};
 const state=()=>({auth_state_digest:'a'.repeat(64),authenticated_at:authTime,checked_at:now});
 const tx={signal:new AbortController().signal,beforeCommit:(key,check)=>{if(!checks.has(key))checks.set(key,check);},query:async(sql,args)=>{
  calls.push(sql);
  if(sql===scopedModule.SCOPED_SHARED_CONSENT_AUTH_SQL)return{rows:[state()]};
  if(sql===m.BOUND_CONSENT_RECORD_SQL){if(saved)throw Error('unique');saved={payload:structuredClone(args[5]),signature:args[6]};return{rows:[{recorded:true}]};}
  if(sql===m.BOUND_CONSENT_READ_SQL)return{rows:saved?[structuredClone(saved)]:[]};
  if(sql===m.BOUND_CONSENT_CURRENT_SQL)return{rows:rowsOverride??[state()]};
  throw Error('Unexpected SQL');
 }};
 const port=m.createBoundScopedSharedConsent(options);
 return{port,options,tx,token,checks,calls,policy,authTime,get saved(){return saved;},get authCalls(){return authCalls;},alter:fn=>fn(saved),advance:ms=>{now+=ms;},invalidate:()=>{currentPolicy=false;},override:r=>{rowsOverride=r;}};
}
test('original proof and session are signed once, copied privately, and replay cannot extend them',async()=>{
 const f=fixture(),first=await f.port.issue(f.token,f.tx),copy=structuredClone(first);
 f.advance(1000);assert.deepEqual(await f.port.issue(f.token,f.tx),copy);
 assert.equal(f.calls.filter(x=>x===m.BOUND_CONSENT_RECORD_SQL).length,1);
 assert.equal(first.payload.proofDomain,scopedModule.SCOPED_SHARED_CONSENT_DOMAIN);
 assert.equal(first.payload.expiresAt,f.authTime+600000);assert.equal(JSON.stringify(f.saved).includes(f.token),false);
 assert.equal(Object.isFrozen(first.payload),true);
});
test('worker current state uses private original binding and never calls Auth/user',async()=>{
 const f=fixture();await f.port.issue(f.token,f.tx);const auth=f.authCalls;f.calls.length=0;f.checks.clear();
 const current=await f.port.verifyCurrent(user,f.tx);assert.ok(current);assert.equal(f.authCalls,auth);
 assert.deepEqual(f.calls,[m.BOUND_CONSENT_READ_SQL,m.BOUND_CONSENT_CURRENT_SQL]);
 assert.equal(current.sessionID,session);assert.equal(await [...f.checks.values()][0](),true);
 f.override([{auth_state_digest:'b'.repeat(64),authenticated_at:f.authTime,checked_at:Date.now()}]);
 assert.equal(await [...f.checks.values()][0](),false);
});
test('policy drift and elapsed recent-auth window fail the worker COMMIT check',async()=>{
 for(const fail of [f=>f.invalidate(),f=>f.advance(600001)]){
  const f=fixture();await f.port.issue(f.token,f.tx);f.checks.clear();assert.ok(await f.port.verifyCurrent(user,f.tx));fail(f);
  assert.equal(await [...f.checks.values()][0](),false);
 }
});
test('malformed, forged or peer-domain custody cannot become current or historical evidence',async()=>{
 for(const alter of [p=>p.signature='0'.repeat(64),p=>p.payload.proofDomain='Kakei/scoped-consent-auth-state/v1',p=>p.payload.sessionID=requestID,p=>p.payload.extra='raw-auth',p=>p.payload.expiresAt+=1]){
  const f=fixture();await f.port.issue(f.token,f.tx);f.alter(alter);
  assert.equal(await f.port.verifyCurrent(user,f.tx),null);await assert.rejects(f.port.readHistorical(user,f.tx),/Original/);
 }
});
test('absent current session denies current identity but archival evidence remains distinctly historical',async()=>{
 const f=fixture();const original=await f.port.issue(f.token,f.tx);f.override([]);f.advance(600001);
 assert.equal(await f.port.verifyCurrent(user,f.tx),null);
 const h=await f.port.readHistorical(user,f.tx);assert.equal(h.kind,'historical-consent-only');assert.deepEqual(h.payload,original.payload);
 assert.equal('authenticated' in h,false);assert.equal('durable' in h,false);
});
test('missing original binding is never reconstructed by worker or historical read',async()=>{
 const f=fixture();assert.equal(await f.port.verifyCurrent(user,f.tx),null);assert.equal(await f.port.readHistorical(user,f.tx),null);assert.equal(f.authCalls,0);assert.equal(f.calls.includes(m.BOUND_CONSENT_RECORD_SQL),false);
});
test('aborted or query-only transactions cannot read custody or issue worker authority',async()=>{
 const f=fixture();await f.port.issue(f.token,f.tx);
 assert.equal(await f.port.verifyCurrent(user,{...f.tx,beforeCommit:undefined}),null);
 const c=new AbortController();c.abort();assert.equal(await f.port.verifyCurrent(user,{...f.tx,signal:c.signal}),null);
});
test('extra raw SQL data and a newly fabricated session never pass immutable worker checks',async()=>{
 const f=fixture();await f.port.issue(f.token,f.tx);
 f.override([{auth_state_digest:'a'.repeat(64),authenticated_at:f.authTime,checked_at:Date.now(),raw_user:{}}]);
 assert.equal(await f.port.verifyCurrent(user,f.tx),null);
 f.checks.clear();const h=await f.port.readHistorical(user,f.tx);
 await f.port.readHistorical(user,f.tx);f.alter(p=>{p.signature='f'.repeat(64);});
 assert.equal(await [...f.checks.values()][0](),false);assert.equal(h.payload.sessionID,session);
});

test('repeat stage reads register each hook once and hook-free readbacks work inside COMMIT checks',async()=>{
 const f=fixture();await f.port.issue(f.token,f.tx);f.checks.clear();
 const seen=new Set();const tx={...f.tx,beforeCommit:(key,check)=>{if(seen.has(key))throw Error('duplicate hook');seen.add(key);f.checks.set(key,check);}};
 assert.ok(await f.port.verifyCurrent(user,tx));assert.ok(await f.port.verifyCurrent(user,tx));
 assert.ok(await f.port.readHistorical(user,tx));assert.ok(await f.port.readHistorical(user,tx));assert.equal(seen.size,2);
 const checkTx={...tx,beforeCommit:()=>{throw Error('checking-phase registration refused');}};
 assert.ok(await f.port.readCurrent(user,checkTx));assert.equal((await f.port.readHistoricalSnapshot(user,checkTx)).kind,'historical-consent-only');
 for(const check of f.checks.values())assert.equal(await check(),true);
});
