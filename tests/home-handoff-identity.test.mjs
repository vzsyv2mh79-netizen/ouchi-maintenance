import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
import {HomeHandoffAdditionalVerificationRequired} from '../lib/home-handoff-handler.mjs';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const {createHomeHandoffIdentityVerifier,createHomeHandoffInventoryIdentityVerifier,createHomeHandoffInventoryActorVerifier,HOME_HANDOFF_AUTH_STATE_SQL,HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,HOME_HANDOFF_AUTH_USER_PIN_SQL,HOME_HANDOFF_AUTH_SESSION_PIN_SQL,HOME_HANDOFF_AUTH_FACTOR_PIN_SQL,HOME_HANDOFF_ENROLLMENT_PIN_SQL}=await import(url(compile('lib/home-handoff-identity.ts').replace("'./verified-app-session'",JSON.stringify(url(compile('lib/verified-app-session.ts')))).replace("'./home-handoff-handler.mjs'",JSON.stringify(import.meta.resolve('../lib/home-handoff-handler.mjs')))));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',projectID='abcdefghijklmnopqrst';
const token=claims=>'e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:4102444800,...claims})).toString('base64url')+'.c2ln';
function fixture({claims={aal:'aal2'},row={},onQuery=()=>{},authUser=user}={}) {
 let clock=Date.now();const checkedAt=new Date(clock).toISOString();
 const policyReader=createHomeHandoffPolicyReader({projectID,accessToken:'synthetic',clock:()=>clock,readEffectiveLowAAL:async()=>({projectID,checkedAt,authVersion:'v2.196.0',allowLowAALSeconds:900}),fetcher:async()=>Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false})});
 const signal=new AbortController().signal,calls=[];
 const options={projectID,policyReader,getUser:async(bearer,s)=>{assert.equal(bearer,token(claims));assert.equal(s,signal);calls.push('auth');return {data:{user:{id:authUser}},error:null};}};
 const verify=createHomeHandoffIdentityVerifier(options);
 const tx={signal,query:async(sql,args)=>{assert.match(sql,/auth\.sessions/);assert.deepEqual(args,[session,user,null,null]);calls.push('sql');onQuery(()=>{clock=Date.parse(checkedAt)+60000;});return {rows:[{verified_at:Date.now(),epoch_id:epoch,session_aal:'aal2',has_verified_factor:true,session_current:true,...row}]};}};
 return {verify,tx,calls,bearer:token(claims),options};
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


function pinned({claims,row={},supported=true,pin=()=>{}}={}){
 const f=fixture({claims:claims??{aal:'aal1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]},row:{has_verified_factor:false,session_aal:'aal1',...row}});
 const original=f.tx.query;let stage=0;
 f.tx.query=async(sql,args)=>{
  if(sql===HOME_HANDOFF_AUTH_STATE_SQL){f.calls.push('auth-state');return {rows:[{auth_state:{session:'synthetic',factors:[]}}]};}
  if(sql===HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL){f.calls.push('constraints');return {rows:[{supported}]};}
  if(sql===HOME_HANDOFF_AUTH_USER_PIN_SQL){assert.deepEqual(args,[user]);f.calls.push('user-lock');stage++;return pin(stage)??{rows:[{id:user}]};}
  if(sql===HOME_HANDOFF_AUTH_SESSION_PIN_SQL){assert.deepEqual(args,[session,user]);f.calls.push('session-lock');stage++;return pin(stage)??{rows:[{id:session}]};}
  if(sql===HOME_HANDOFF_AUTH_FACTOR_PIN_SQL){assert.deepEqual(args,[user]);f.calls.push('factor-lock');stage++;return pin(stage)??{rows:[]};}
  if(sql===HOME_HANDOFF_ENROLLMENT_PIN_SQL){assert.deepEqual(args,[user,session]);f.calls.push('enrollment-lock');stage++;return pin(stage)??{rows:[{epoch_id:epoch}]};}
  return original(sql,args);
 };
 f.verify=createHomeHandoffInventoryIdentityVerifier(f.options);return f;
}

test('inventory identity pins user/session/factors/enrollment then reverifies exact bearer and preserves signed AMR time',async()=>{
 const timestamp=Math.floor(Date.now()/1000)-20;
 const f=pinned({claims:{aal:'aal1',amr:[{method:'password',timestamp}]}});
 const result=await f.verify(f.bearer,f.tx);
 assert.equal(result.userID,user);assert.equal(result.sessionID,session);assert.equal(result.epochID,epoch);
 assert.equal(result.authenticatedAt,timestamp*1000);assert.ok(result.checkedAt>result.authenticatedAt);assert.equal(result.aal,'aal1');
 assert.deepEqual(f.calls,['auth','sql','constraints','user-lock','session-lock','factor-lock','enrollment-lock','auth','sql','auth-state']);
});

test('fresh getUser cannot replace missing, stale, future, ambiguous or metadata-only recent authentication',async()=>{
 const now=Math.floor(Date.now()/1000);
 for(const amr of [undefined,[],[{method:'password',timestamp:now-601}],[{method:'password',timestamp:now+60}],[{method:'oauth',timestamp:now}],[{method:'password',timestamp:String(now)}],[{method:'password',timestamp:now},{method:'password',timestamp:now}]]){
  const f=pinned({claims:{aal:'aal1',amr,user_metadata:{amr:[{method:'password',timestamp:now}]}}});assert.equal(await f.verify(f.bearer,f.tx),null);
 }
});

test('verified factors require recent TOTP AMR rather than fresh password alone',async()=>{
 const timestamp=Math.floor(Date.now()/1000);
 for(const amr of [[{method:'password',timestamp}],[{method:'totp',timestamp:timestamp-601}]]){
  const f=pinned({claims:{aal:'aal2',amr},row:{session_aal:'aal2',has_verified_factor:true}});assert.equal(await f.verify(f.bearer,f.tx),null);
 }
 const f=pinned({claims:{aal:'aal2',amr:[{method:'password',timestamp:timestamp-2000},{method:'totp',timestamp}]},row:{session_aal:'aal2',has_verified_factor:true}});
 assert.equal((await f.verify(f.bearer,f.tx)).authenticatedAt,timestamp*1000);
});

test('unsupported Auth foreign keys and disappearance during pinning refuse inventory identity',async()=>{
 const unsupported=pinned({supported:false});await assert.rejects(unsupported.verify(unsupported.bearer,unsupported.tx),/pin constraints unavailable/);
 assert.deepEqual(unsupported.calls,['auth','sql','constraints']);
 for(const lost of [1,2,4]){const f=pinned({pin:stage=>stage===lost?{rows:[]}:undefined});assert.equal(await f.verify(f.bearer,f.tx),null);assert.equal(f.calls.filter(c=>c==='auth').length,1);}
});

test('session authority lost after pinning is rechecked before inventory identity is returned',async()=>{
 const f=pinned();
 // Inject authority loss in the final policy read, after every lock.
 const query=f.tx.query;let reads=0;
 f.tx.query=async(sql,args)=>{const result=await query(sql,args);if(sql.includes('as session_current')&&++reads===2)result.rows[0].session_current=false;return result;};
 assert.equal(await f.verify(f.bearer,f.tx),null);
});


function actorClaim(overrides={}){
 const now=Date.now();return {purpose:'OuchiMaintenance/family-attachment-inventory/v2',bindingDigest:'a'.repeat(64),authStateDigest:createHash('sha256').update('OuchiMaintenance/inventory-auth-state/v1\n'+JSON.stringify({session:'synthetic',factors:[]})).digest('hex'),actorID:user,sessionID:session,epochID:epoch,aal:'aal1',authenticatedAt:now-10000,checkedAt:now-1000,acceptedAt:now-500,expiresAt:now-500+900000,...overrides};
}
test('signed-claim worker callback pins current session/factors/enrollment and never substitutes getUser freshness',async()=>{
 const f=pinned();const verify=createHomeHandoffInventoryActorVerifier(f.options);
 assert.equal(await verify(f.tx,actorClaim(),f.tx.signal),true);
 assert.deepEqual(f.calls,['constraints','user-lock','session-lock','factor-lock','enrollment-lock','sql','auth-state']);
});
test('worker refuses stale authentication, foreign enrollment, invalid scope/purpose and expired claims',async()=>{
 for(const change of [{authenticatedAt:Date.now()-600001},{epochID:user},{sessionID:'invalid'},{aal:'aal2'},{purpose:'client-flag'},{bindingDigest:'x'},{checkedAt:Date.now()+60000},{expiresAt:Date.now()-1}]){
  const f=pinned();assert.equal(await createHomeHandoffInventoryActorVerifier(f.options)(f.tx,actorClaim(change),f.tx.signal),false);
 }
});
test('worker checks current assurance, authority after locking and current policy deadline',async()=>{
 const f=pinned({row:{has_verified_factor:true,session_aal:'aal2'}});const verify=createHomeHandoffInventoryActorVerifier(f.options);
 assert.equal(await verify(f.tx,actorClaim(),f.tx.signal),false);
 assert.equal(await verify(f.tx,actorClaim({aal:'aal2'}),f.tx.signal),true);
 const expired=pinned();const query=expired.tx.query;
 expired.tx.query=async(sql,args)=>{const result=await query(sql,args);if(sql.includes('as session_current'))result.rows[0].session_current=false;return result;};
 assert.equal(await createHomeHandoffInventoryActorVerifier(expired.options)(expired.tx,actorClaim(),expired.tx.signal),false);
});
test('worker refuses unsupported schema, a mismatched signal and cancellation during locking',async()=>{
 const unsupported=pinned({supported:false});assert.equal(await createHomeHandoffInventoryActorVerifier(unsupported.options)(unsupported.tx,actorClaim(),unsupported.tx.signal),false);
 const f=pinned();assert.equal(await createHomeHandoffInventoryActorVerifier(f.options)(f.tx,actorClaim(),new AbortController().signal),false);
 const c=new AbortController();const query=f.tx.query;f.tx.signal=c.signal;f.tx.query=async(sql,args)=>{const result=await query(sql,args);if(sql===HOME_HANDOFF_AUTH_USER_PIN_SQL)c.abort();return result;};
 assert.equal(await createHomeHandoffInventoryActorVerifier(f.options)(f.tx,actorClaim(),c.signal),false);
});


test('worker refuses a changed factor set or credentials despite preserved AAL2 and current policy',async()=>{
 const f=pinned({row:{has_verified_factor:true,session_aal:'aal2'}});const original=f.tx.query;
 f.tx.query=async(sql,args)=>sql===HOME_HANDOFF_AUTH_STATE_SQL?{rows:[{auth_state:{session:'synthetic',factors:[{id:'replacement',status:'verified'}]}}]}:original(sql,args);
 assert.equal(await createHomeHandoffInventoryActorVerifier(f.options)(f.tx,actorClaim({aal:'aal2'}),f.tx.signal),false);
});
