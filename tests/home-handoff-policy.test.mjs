import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
const projectID='abcdefghijklmnopqrst',now=1791840000000;
const settings={sessions_timebox:0,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false};
const evidence=()=>({projectID,checkedAt:new Date(now).toISOString(),authVersion:'v2.196.0',allowLowAALSeconds:900});
const signal=()=>new AbortController().signal;
function reader(options={}) { return createHomeHandoffPolicyReader({projectID,accessToken:'synthetic-reviewed-credential',clock:()=>now,readEffectiveLowAAL:async()=>evidence(),fetcher:async()=>Response.json(settings),...options}); }
test('read-only fixed endpoint returns only required immutable policy fields',async()=>{
 const read=reader({fetcher:async(url,options)=>{
  assert.equal(url,'https://api.supabase.com/v1/projects/'+projectID+'/config/auth');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.authorization,'Bearer synthetic-reviewed-credential');
  return Response.json({...settings,smtp_pass:'synthetic-secret-must-not-leave-reader'});
 }});
 const result=await read(signal());assert.equal(result.allowLowAALSeconds,900);assert.equal(result.timeboxSeconds,null);assert.equal(Object.isFrozen(result),true);assert.equal('smtp_pass' in result,false);assert.equal('accessToken' in result,false);
});
test('missing low-AAL, wrong project, stale/future or unreviewed version never starts HTTP',async()=>{
 for(const patch of [{allowLowAALSeconds:undefined},{allowLowAALSeconds:0},{projectID:'zyxwvutsrqponmlkjihg'},{checkedAt:new Date(now-60000).toISOString()},{checkedAt:new Date(now+1).toISOString()},{authVersion:'v9.0.0'}]) {
  let calls=0;const read=reader({readEffectiveLowAAL:async()=>({...evidence(),...patch}),fetcher:async()=>{calls++;return Response.json(settings);}});
  assert.equal(await read(signal()),null);assert.equal(calls,0);
 }
});
test('explicit disabled low-AAL is distinct from absent configuration',async()=>{
 const read=reader({readEffectiveLowAAL:async()=>({...evidence(),allowLowAALSeconds:null})});assert.equal((await read(signal())).allowLowAALSeconds,null);
 for(const key of Object.keys(settings)) { const config={...settings};delete config[key];assert.equal(await reader({fetcher:async()=>Response.json(config)})(signal()),null); }
});
test('positive policy is snapshotted before HTTP and is not renewed by fetching config',async()=>{
 const original=evidence();let time=now;
 const read=reader({clock:()=>time,readEffectiveLowAAL:async()=>original,fetcher:async()=>{original.allowLowAALSeconds=null;original.checkedAt=new Date(now+500).toISOString();time=now+1000;return Response.json(settings);}});
 const result=await read(signal());assert.equal(result.allowLowAALSeconds,900);assert.equal(result.checkedAt,new Date(now).toISOString());
});
test('policy expiring during HTTP is discarded',async()=>{
 let time=now;const read=reader({clock:()=>time,fetcher:async()=>{time=now+60000;return Response.json(settings);}});assert.equal(await read(signal()),null);
});
test('redirect, non-200, oversized and malformed bodies fail closed',async()=>{
 const redirected=new Response('{}');Object.defineProperty(redirected,'redirected',{value:true});
 for(const response of [redirected,new Response('{}',{status:403}),new Response('x'.repeat(65537)),new Response('{broken')])assert.equal(await reader({fetcher:async()=>response})(signal()),null);
});
test('deadline bounds an uncooperative settings reader and an uncooperative fetch',async()=>{
 for(const options of [{readEffectiveLowAAL:async()=>new Promise(()=>{})},{fetcher:async()=>new Promise(()=>{})}]) {
  const start=Date.now();assert.equal(await reader({...options,timeoutMS:20})(signal()),null);assert.ok(Date.now()-start<1000);
 }
});
test('caller cancellation while body waits cancels reader and yields no policy',async()=>{
 const controller=new AbortController();let entered,cancelled=false;
 const ready=new Promise(resolve=>{entered=resolve;});
 const read=reader({fetcher:async()=>new Response(new ReadableStream({pull(){entered();},cancel(){cancelled=true;}}))});
 const pending=read(controller.signal);await ready;controller.abort();assert.equal(await pending,null);await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);
});
