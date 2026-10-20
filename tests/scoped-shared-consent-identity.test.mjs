import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedModule} from './fixtures/scoped-shared-consent-module.mjs';
const {createScopedSharedConsentIdentityVerifier:create,SCOPED_SHARED_CONSENT_AUTH_SQL:sql,SCOPED_SHARED_CONSENT_DOMAIN:domain}=scopedModule;
const projectID='hphifiqyypwyxkzfanod',requestID='11111111-1111-4111-8111-111111111111',homeID='22222222-2222-4222-8222-222222222222',nativeLease='33333333-3333-4333-8333-333333333333',user='44444444-4444-4444-8444-444444444444',session='55555555-5555-4555-8555-555555555555';
function fixture({claims={},row={},changePolicy={},onSQL=()=>{},onAuth=()=>{}}={}){
 let now=Date.now(),current=true,authCalls=0;const calls=[],abort=new AbortController();
 const totp=Math.floor(now/1000)-10;
 const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,iat:totp-5,exp:Math.floor(now/1000)+3600,aal:'aal2',iss:'https://'+projectID+'.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',is_anonymous:false,amr:[{method:'totp',timestamp:totp}],...claims})).toString('base64url')+'.c2ln';
 const policy={projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null,...changePolicy};
 const policyReader=Object.assign(async()=>policy,{isCurrent:p=>p===policy&&current});
 const options={projectID,requestID,homeID,nativeLease,policyReader,clock:()=>now,getUser:async(b,s)=>{assert.equal(b,token);assert.equal(s,abort.signal);onAuth(++authCalls,()=>{now+=600001;});return{data:{user:{id:user}},error:null};}};
 const tx={signal:abort.signal,beforeCommit:()=>{},query:async(q,args)=>{calls.push(q);assert.equal(q,sql);assert.deepEqual(args,[requestID,homeID,user,session,nativeLease,'aal2',totp*1000,null,null]);onSQL(()=>{current=false;},abort);return{rows:[{auth_state_digest:'a'.repeat(64),authenticated_at:totp*1000,checked_at:now,...row}]};}};
 return{options,tx,token,calls,run:()=>create(options)(token,tx),get authCalls(){return authCalls;}};
}
test('scoped identity uses only fixed private digest RPC and preserves its explicit proof domain',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.userID,user);assert.equal(r.sessionID,session);assert.equal(r.proofDomain,domain);assert.equal(f.authCalls,2);assert.deepEqual(f.calls,[sql]);assert.equal(JSON.stringify(r).includes('password'),false);
});
test('query-only transactions and unsupported strict policy cannot issue identity',async()=>{
 const f=fixture();assert.equal(await create(f.options)(f.token,{signal:f.tx.signal,query:f.tx.query}),null);assert.equal(f.authCalls,0);
 for(const changePolicy of [{totpVerify:false},{singleSession:true},{authVersion:'v2.999.0'},{assuranceMode:undefined},{timeboxSeconds:0},{inactivitySeconds:-1},{projectID:'foreign'}])assert.equal(await fixture({changePolicy}).run(),null);
});
test('low AAL, foreign issuer and invalid recent TOTP stop before private SQL',async()=>{
 const time=Math.floor(Date.now()/1000);
 for(const claims of [{aal:'aal1'},{iss:'https://example.invalid/auth/v1'},{is_anonymous:true},{role:'service_role'},{amr:[]},{amr:[{method:'password',timestamp:time}]},{amr:[{method:'totp',timestamp:time-601}]},{amr:[{method:'totp',timestamp:time+60}]},{amr:[{method:'totp',timestamp:time},{method:'totp',timestamp:time}]}]){
  const f=fixture({claims});assert.equal(await f.run(),null);assert.equal(f.calls.length,0);
 }
});
test('policy expiry or cancellation during locked RPC refuses without final Auth call',async()=>{
 for(const onSQL of [expire=>expire(),(_,controller)=>controller.abort()]){const f=fixture({onSQL});assert.equal(await f.run(),null);assert.equal(f.authCalls,1);}
});
test('raw or malformed RPC results and expired final read cannot escape the boundary',async()=>{
 for(const row of [{raw_auth_state:{secret:'must-not-leave'}},{auth_state_digest:'invalid'},{authenticated_at:1},{checked_at:1},{checked_at:NaN}])assert.equal(await fixture({row}).run(),null);
 const f=fixture({onAuth:(n,expire)=>{if(n===2)expire();}});assert.equal(await f.run(),null);
});

test('dedicated issuer registers an immutable current-digest COMMIT readback without rebinding original proof',async()=>{
 const row={},f=fixture({row}),checks=[];f.tx.beforeCommit=(key,check)=>{assert.match(key,/^scoped-consent:/);checks.push(check);};
 const identify=scopedModule.createScopedSharedConsentIssuerIdentity(f.options),first=await identify(f.token,f.tx);
 assert.ok(first);assert.equal(checks.length,1);assert.equal(await checks[0](),true);
 row.auth_state_digest='b'.repeat(64);
 assert.equal(await checks[0](),false);assert.equal(first.authStateDigest,'a'.repeat(64));assert.equal(first.proofDomain,domain);
});
