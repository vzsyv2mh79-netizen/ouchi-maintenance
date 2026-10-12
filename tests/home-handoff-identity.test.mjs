import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
import {HomeHandoffAdditionalVerificationRequired} from '../lib/home-handoff-handler.mjs';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const {createHomeHandoffIdentityVerifier}=await import(url(compile('lib/home-handoff-identity.ts').replace("'./verified-app-session'",JSON.stringify(url(compile('lib/verified-app-session.ts')))).replace("'./home-handoff-handler.mjs'",JSON.stringify(import.meta.resolve('../lib/home-handoff-handler.mjs')))));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',projectID='abcdefghijklmnopqrst';
const token=claims=>'e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:4102444800,...claims})).toString('base64url')+'.c2ln';
function fixture({claims={aal:'aal2'},row={},onQuery=()=>{},authUser=user}={}) {
 let clock=Date.now();const checkedAt=new Date(clock).toISOString();
 const policyReader=createHomeHandoffPolicyReader({projectID,accessToken:'synthetic',clock:()=>clock,readEffectiveLowAAL:async()=>({projectID,checkedAt,authVersion:'v2.196.0',allowLowAALSeconds:900}),fetcher:async()=>Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false})});
 const signal=new AbortController().signal,calls=[];
 const verify=createHomeHandoffIdentityVerifier({projectID,policyReader,getUser:async(bearer,s)=>{assert.equal(bearer,token(claims));assert.equal(s,signal);calls.push('auth');return {data:{user:{id:authUser}},error:null};}});
 const tx={signal,query:async(sql,args)=>{assert.match(sql,/auth\.sessions/);assert.deepEqual(args,[session,user,null,null]);calls.push('sql');onQuery(()=>{clock=Date.parse(checkedAt)+60000;});return {rows:[{verified_at:Date.now(),epoch_id:epoch,session_aal:'aal2',has_verified_factor:true,session_current:true,...row}]};}};
 return {verify,tx,calls,bearer:token(claims)};
}
test('fresh exact bearer and policy bind live session and explicit app epoch',async()=>{
 const f=fixture();assert.deepEqual(await f.verify(f.bearer,f.tx),{userID:user,sessionID:session,epochID:epoch});assert.deepEqual(f.calls,['auth','sql']);
});
test('verified factor requires AAL2 in BOTH bearer and current session',async()=>{
 for(const data of [{claims:{aal:'aal1'}},{row:{session_aal:'aal1'}},{claims:{aal:'aal1',user_metadata:{aal:'aal2'}}}]){const f=fixture(data);await assert.rejects(f.verify(f.bearer,f.tx),HomeHandoffAdditionalVerificationRequired);}
});
test('missing, revoked, changed session and unbound epoch never become identity',async()=>{
 for(const row of [{session_current:false},{epoch_id:null},{epoch_id:'a'.repeat(36)},{epoch_id:'00000000-0000-0000-0000-000000000000'},{has_verified_factor:'true'},{session_aal:'aal3'},{verified_at:NaN}]){const f=fixture({row});assert.equal(await f.verify(f.bearer,f.tx),null);}
 const f=fixture({claims:{aal:'aal2'},row:{has_verified_factor:false,session_aal:'aal1'}});assert.equal(await f.verify(f.bearer,f.tx),null);
});
test('successful SQL after policy deadline is refused; mutable source cannot renew it',async()=>{
 const f=fixture({onQuery:expire=>expire()});await assert.rejects(f.verify(f.bearer,f.tx),/policy expired/);
});
test('foreign subject and metadata-only session stop before SQL',async()=>{
 for(const claims of [{aal:'aal2',sub:epoch},{aal:'aal2',session_id:null,user_metadata:{session_id:session}}]){const f=fixture({claims});assert.equal(await f.verify(f.bearer,f.tx),null);assert.deepEqual(f.calls,['auth']);}
});
test('missing AAL is low assurance; verified factors cannot use it',async()=>{
 const f=fixture({claims:{aal:undefined}});await assert.rejects(f.verify(f.bearer,f.tx),HomeHandoffAdditionalVerificationRequired);
 const allowed=fixture({claims:{aal:undefined},row:{has_verified_factor:false,session_aal:'aal1'}});
 assert.deepEqual(await allowed.verify(allowed.bearer,allowed.tx),{userID:user,sessionID:session,epochID:epoch});
});
test('cancellation during Auth prevents a subsequent database read',async()=>{
 const controller=new AbortController();let queried=false;
 const policy={projectID,singleSession:false,timeboxSeconds:null,inactivitySeconds:null,allowLowAALSeconds:900,totpVerify:true,phoneVerify:false,webAuthnVerify:false};
 const policyReader=Object.assign(async()=>policy,{isCurrent:()=>true});
 const verify=createHomeHandoffIdentityVerifier({projectID,policyReader,getUser:async()=>{controller.abort();return {data:{user:{id:user}},error:null};}});
 await assert.rejects(verify(token({aal:'aal2'}),{signal:controller.signal,query:async()=>{queried=true;return {rows:[]};}}),{name:'AbortError'});
 assert.equal(queried,false);
});
