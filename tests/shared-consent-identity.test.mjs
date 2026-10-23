import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const urls=new Map();
function moduleURL(name){
 if(urls.has(name))return urls.get(name);
 let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,file)=>'from '+JSON.stringify(file.endsWith('.mjs')?import.meta.resolve('../lib/'+file):moduleURL(file)));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(name,url);return url;
}
const {createSharedConsentIdentityVerifier,SHARED_CONSENT_SESSION_SQL}=await import(moduleURL('shared-consent-identity'));
const {HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL:constraints,HOME_HANDOFF_AUTH_USER_PIN_SQL:userPin,HOME_HANDOFF_AUTH_SESSION_PIN_SQL:sessionPin,HOME_HANDOFF_AUTH_FACTOR_PIN_SQL:factorPin,HOME_HANDOFF_AUTH_STATE_SQL:stateSQL}=await import(moduleURL('home-handoff-identity'));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',projectID='abcdefghijklmnopqrst';
function fixture({claims={},row={},authUser=user,authority=()=>true,onQuery=()=>{},policyChange={}}={}){
 const controller=new AbortController(),calls=[];
 const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:4102444800,aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-10}],...claims})).toString('base64url')+'.c2ln';
 let current=true;
 const policy={projectID,assuranceMode:'highest-current-aal/v1',singleSession:false,timeboxSeconds:null,inactivitySeconds:null,totpVerify:true,phoneVerify:false,webAuthnVerify:false,...policyChange};
 const policyReader=Object.assign(async()=>{calls.push('policy');return policy;},{isCurrent:p=>p===policy&&current});
 const options={projectID,policyReader,getUser:async(bearer,signal)=>{assert.equal(bearer,token);assert.equal(signal,controller.signal);calls.push('auth');return {data:{user:{id:authUser}},error:null};},
 verifyReadAuthority:async identity=>{assert.deepEqual(identity,{userID:user,sessionID:session});calls.push('authority');return authority(calls.filter(x=>x==='authority').length);}};
 const tx={signal:controller.signal,query:async(sql,args)=>{
  controller.signal.throwIfAborted();calls.push(sql);onQuery(sql,()=>{current=false;},controller);
  if(sql===constraints)return {rows:[{supported:true}]};
  if(sql===userPin){assert.deepEqual(args,[user]);return {rows:[{id:user}]};}
  if(sql===sessionPin){assert.deepEqual(args,[session,user]);return {rows:[{id:session}]};}
  if(sql===factorPin)return {rows:[]};
  if(sql===SHARED_CONSENT_SESSION_SQL)return {rows:[{checked_at:Date.now(),session_current:true,session_aal:'aal2',verified_totp:true,...row}]};
  if(sql===stateSQL)return {rows:[{auth_state:{user:{password:'synthetic'},session:{id:session},factors:[{id:'original'}]}}]};
  throw Error('Unexpected SQL; no application enrollment reader may be substituted');
 }};
 return {options,tx,token,calls,controller,verify:()=>createSharedConsentIdentityVerifier(options)(token,tx)};
}
test('private request authority and current pinned AAL2 remain usable without normal app enrollment',async()=>{
 const f=fixture(),value=await f.verify();
 assert.equal(value.userID,user);assert.equal(value.sessionID,session);assert.equal(value.aal,'aal2');
 assert.match(value.authStateDigest,/^[a-f0-9]{64}$/);
 assert.equal(value.authenticatedAt,JSON.parse(Buffer.from(f.token.split('.')[1],'base64url')).amr[0].timestamp*1000);
 assert.equal(f.calls.filter(x=>x==='auth').length,2);assert.equal(f.calls.filter(x=>x==='authority').length,3);
 assert.deepEqual(f.calls.filter(x=>![constraints,userPin,sessionPin,factorPin,SHARED_CONSENT_SESSION_SQL,stateSQL].includes(x)),['policy','auth','authority','policy','auth','authority','authority']);
 assert.equal(JSON.stringify(value).includes('synthetic'),false);
});
test('there is no default authority; denial before or after pins cannot return identity',async()=>{
 const f=fixture();assert.throws(()=>createSharedConsentIdentityVerifier({...f.options,verifyReadAuthority:undefined}),/authority reader required/);
 for(const rejectAt of [1,2,3]){const denied=fixture({authority:n=>n!==rejectAt});assert.equal(await denied.verify(),null);}
});
test('foreign or metadata-only claims stop before SQL',async()=>{
 for(const claims of [{sub:session},{session_id:undefined,user_metadata:{session_id:session}},{exp:1}]){
  const f=fixture({claims});assert.equal(await f.verify(),null);assert.equal(f.calls.some(x=>x.startsWith('select')),false);
 }
});
test('missing, stale, future, ambiguous or password-only AMR never substitutes current TOTP',async()=>{
 const timestamp=Math.floor(Date.now()/1000);
 for(const amr of [undefined,[],[{method:'password',timestamp}],[{method:'totp',timestamp:timestamp-601}],[{method:'totp',timestamp:timestamp+60}],[{method:'totp',timestamp},{method:'totp',timestamp}]]){
  assert.equal(await fixture({claims:{amr}}).verify(),null);
 }
 for(const claims of [{aal:'aal1'},{aal:undefined}])assert.equal(await fixture({claims}).verify(),null);
 for(const row of [{verified_totp:false},{session_current:false},{session_aal:'aal1'},{checked_at:NaN}])assert.equal(await fixture({row}).verify(),null);
});
test('unsupported, stale or changed policy is refused rather than refreshed from a default',async()=>{
 for(const policyChange of [{assuranceMode:undefined},{singleSession:true},{totpVerify:false},{timeboxSeconds:-1},{inactivitySeconds:NaN},{projectID:'different'}]){
  await assert.rejects(fixture({policyChange}).verify(),/policy unavailable/);
 }
 const expired=fixture({onQuery:(sql,expire)=>{if(sql===factorPin)expire();}});
 await assert.rejects(expired.verify(),/policy expired/);
});
test('Auth foreign-key guarantees and missing user/session rows remain mandatory',async()=>{
 const unsupported=fixture();const query=unsupported.tx.query;unsupported.tx.query=(sql,args)=>sql===constraints?Promise.resolve({rows:[{supported:false}]}):query(sql,args);
 await assert.rejects(unsupported.verify(),/pin constraints unavailable/);
 for(const lost of [userPin,sessionPin,SHARED_CONSENT_SESSION_SQL,stateSQL]){
  const f=fixture(),read=f.tx.query;f.tx.query=(sql,args)=>sql===lost?Promise.resolve({rows:[]}):read(sql,args);assert.equal(await f.verify(),null);
 }
});
test('credential or factor replacement changes the bound digest even with the same AAL2 bearer',async()=>{
 const f=fixture(),original=await f.verify(),query=f.tx.query;
 f.tx.query=(sql,args)=>sql===stateSQL?Promise.resolve({rows:[{auth_state:{user:{password:'changed'},session:{id:session},factors:[{id:'replacement'}]}}]}):query(sql,args);
 const changed=await f.verify();assert.notEqual(changed.authStateDigest,original.authStateDigest);assert.equal(changed.authenticatedAt,original.authenticatedAt);
});
test('abort during a lock wait cannot return identity or run the next query',async()=>{
 const f=fixture({onQuery:(sql,_,controller)=>{if(sql===userPin)controller.abort();}});
 await assert.rejects(f.verify(),{name:'AbortError'});assert.equal(f.calls.includes(sessionPin),false);
});
test('a mutable options object cannot replace the original authority reader during a lock wait',async()=>{
 const f=fixture({authority:n=>n===1});
 const verify=createSharedConsentIdentityVerifier(f.options),query=f.tx.query;
 f.tx.query=async(sql,args)=>{const value=await query(sql,args);if(sql===userPin)f.options.verifyReadAuthority=async()=>true;return value;};
 assert.equal(await verify(f.token,f.tx),null);
});
