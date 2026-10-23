import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createStrictHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
import {createHomeHandoffAuthVersionReader} from '../lib/home-handoff-auth-version.mjs';
import {HomeHandoffAdditionalVerificationRequired} from '../lib/home-handoff-handler.mjs';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const {createHomeHandoffIdentityVerifier}=await import(url(compile('lib/home-handoff-identity.ts').replace("'./verified-app-session'",JSON.stringify(url(compile('lib/verified-app-session.ts')))).replace("'./home-handoff-handler.mjs'",JSON.stringify(import.meta.resolve('../lib/home-handoff-handler.mjs')))));
const projectID='abcdefghijklmnopqrst',now=1791840000000;
const settings={sessions_timebox:0,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false};
function source(options={}){return createHomeHandoffAuthVersionReader({projectID,publishableKey:'sb_publishable_synthetic_only',clock:()=>now,fetcher:async()=>Response.json({name:'GoTrue',version:'v2.197.0'}),...options});}
function reader(options={}){return createStrictHomeHandoffPolicyReader({projectID,accessToken:'synthetic_config_read_only',clock:()=>now,authVersionReader:source(),fetcher:async()=>Response.json({...settings,smtp_pass:'never-output'}),...options});}
test('issued known Auth version and explicit Management config produce a highest-current policy without inventing disabled low-AAL',async()=>{
 let calls=0;const read=reader({fetcher:async(endpoint,options)=>{calls++;assert.equal(endpoint,'https://api.supabase.com/v1/projects/'+projectID+'/config/auth');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return Response.json({...settings,smtp_pass:'never-output'});}});
 const policy=await read(new AbortController().signal);
 assert.equal(policy.assuranceMode,'highest-current-aal/v1');assert.equal('allowLowAALSeconds' in policy,false);assert.equal('smtp_pass' in policy,false);assert.equal('accessToken' in policy,false);assert.equal(Object.isFrozen(policy),true);assert.equal(calls,1);assert.equal(read.isCurrent(policy),true);assert.equal(read.isCurrent({...policy}),false);
});
test('unknown version, foreign project, unissued or cancelled evidence cannot reach Management config',async()=>{
 const fake=Object.freeze({projectID,checkedAt:new Date(now).toISOString(),authVersion:'v2.197.0'});
 for(const version of [source({fetcher:async()=>Response.json({name:'GoTrue',version:'v9.0.0'})}),source({projectID:'aaaaaaaaaaaaaaaaaaaa'}),Object.assign(async()=>fake,{isCurrent:()=>false})]){
  let calls=0;const read=reader({authVersionReader:version,fetcher:async()=>{calls++;return Response.json(settings);}});
  assert.equal(await read(new AbortController().signal),null);assert.equal(calls,0);
 }
 const abort=new AbortController();abort.abort();let calls=0;
 assert.equal(await reader({fetcher:async()=>{calls++;return Response.json(settings);}})(abort.signal),null);assert.equal(calls,0);
});
test('missing actual session/MFA settings and expired policy do not inherit plan defaults or renew version timestamp',async()=>{
 for(const key of Object.keys(settings)){const partial={...settings};delete partial[key];assert.equal(await reader({fetcher:async()=>Response.json(partial)})(new AbortController().signal),null);}
 let clock=now;const read=reader({clock:()=>clock,fetcher:async()=>{clock=now+60000;return Response.json(settings);}});assert.equal(await read(new AbortController().signal),null);
});
test('paired verifier retains MFA assurance refusal and exact current-session equality with no low-AAL duration',async()=>{
 const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333';
 for(const [factor,bearerAAL,sessionAAL,allowed] of [[false,'aal1','aal1',true],[false,'aal2','aal2',true],[true,'aal2','aal2',true],[true,'aal1','aal1',false],[true,'aal1','aal2',false],[true,'aal2','aal1',false],[false,'aal2','aal1',false]]){
  const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:4102444800,aal:bearerAAL,user_metadata:{aal:'aal2'}})).toString('base64url')+'.synthetic';
  const policyReader=reader();
  const verify=createHomeHandoffIdentityVerifier({projectID,policyReader,getUser:async supplied=>{assert.equal(supplied,token);return {data:{user:{id:user}},error:null};}});
  const tx={signal:new AbortController().signal,query:async(sql,args)=>{assert.deepEqual(args,[session,user,null,null]);return {rows:[{verified_at:now,epoch_id:epoch,session_aal:sessionAAL,has_verified_factor:factor,session_current:true}]};}};
  if(allowed)assert.deepEqual(await verify(token,tx),{userID:user,sessionID:session,epochID:epoch});
  else if(factor)await assert.rejects(verify(token,tx),HomeHandoffAdditionalVerificationRequired);
  else assert.equal(await verify(token,tx),null);
 }
});
test('strict reader still bounds an uncooperative config fetch without issuing policy',async()=>{
 const timer=setTimeout(()=>{},200);
 try{const read=reader({timeoutMS:20,fetcher:()=>new Promise(()=>{})});assert.equal(await read(new AbortController().signal),null);}finally{clearTimeout(timer);}
});
test('a policy for a different assurance mode cannot reach original-bearer Auth verification',async()=>{
 const policy=await reader()(new AbortController().signal);let called=false;
 const policyReader=Object.assign(async()=>({...policy,assuranceMode:'allow-lower-aal/v1'}),{isCurrent:()=>true});
 const verify=createHomeHandoffIdentityVerifier({projectID,policyReader,getUser:async()=>{called=true;throw Error('Must not reach Auth');}});
 await assert.rejects(verify('synthetic',{signal:new AbortController().signal,query:async()=>({rows:[]})}),/policy unavailable/);
 assert.equal(called,false);
});
