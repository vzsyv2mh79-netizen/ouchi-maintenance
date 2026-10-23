import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeHandoffAuthVersionReader} from '../lib/home-handoff-auth-version.mjs';
import {createHomeHandoffPolicyReader} from '../lib/home-handoff-policy.mjs';
const projectID='abcdefghijklmnopqrst',now=1791840000000;
const healthy=()=>Response.json({name:'GoTrue',version:'v2.197.0',description:'synthetic'});
const make=(options={})=>createHomeHandoffAuthVersionReader({projectID,publishableKey:'sb_publishable_synthetic',clock:()=>now,fetcher:async()=>healthy(),...options});

test('fixed HTTPS public health read yields only immutable, issuer-owned fresh version evidence',async()=>{
 let time=now;const controller=new AbortController();
 const read=make({clock:()=>time,fetcher:async(url,options)=>{
  assert.equal(url,'https://'+projectID+'.supabase.co/auth/v1/health');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.deepEqual(options.headers,{apikey:'sb_publishable_synthetic',accept:'application/json'});
  return Response.json({name:'GoTrue',version:'v2.197.0',description:'synthetic',extra:'must not leave reader'});
 }});
 const record=await read(controller.signal);assert.deepEqual(record,{projectID,authVersion:'v2.197.0',checkedAt:new Date(now).toISOString()});
 assert.equal(Object.isFrozen(record),true);assert.equal(read.isCurrent(record),true);assert.equal(read.isCurrent({...record}),false);
 time=now+59999;assert.equal(read.isCurrent(record),true);time++;assert.equal(read.isCurrent(record),false);
 time=now-1;assert.equal(read.isCurrent(record),false);time=now;controller.abort();assert.equal(read.isCurrent(record),false);
});

test('no privileged/legacy keys, arbitrary hosts or implicit project configuration are accepted',()=>{
 for(const options of [{projectID:'abcdefghijklmnopqrst.evil'},{publishableKey:'sb_secret_synthetic'},{publishableKey:'synthetic.jwt.key'},{publishableKey:undefined},{timeoutMS:0},{timeoutMS:15001}])assert.throws(()=>make(options),/Explicit project/);
});

test('health redirects, wrong service/version, body MIME/encoding/length and wrong final URL fail closed',async()=>{
 const redirect=healthy();Object.defineProperty(redirect,'redirected',{value:true});
 const wrongURL=healthy();Object.defineProperty(wrongURL,'url',{value:'https://example.invalid/auth/v1/health'});
 const cases=[redirect,wrongURL,new Response('{}',{status:403}),Response.json({name:'other',version:'v2.197.0'}),Response.json({name:'GoTrue',version:'unknown'}),
  new Response('not json',{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'text/html'}}),
  new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),
  new Response(' '.repeat(8193),{headers:{'content-type':'application/json'}}),
  new Response('{}',{headers:{'content-type':'application/json','content-length':'8193'}}),
  new Response('{}',{headers:{'content-type':'application/json','content-length':'-1'}})];
 for(const response of cases)assert.equal(await make({fetcher:async()=>response})(AbortSignal.timeout(1000)),null);
});

test('timeout/cancellation bound stalled fetch and body, including disposal of a late response',async()=>{
 const keepAlive=setInterval(()=>{},1000);
 try{
  assert.equal(await make({timeoutMS:20,fetcher:()=>new Promise(()=>{})})(new AbortController().signal),null);
  let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});
  assert.equal(await make({timeoutMS:20,fetcher:async()=>new Response(body,{headers:{'content-type':'application/json'}})})(new AbortController().signal),null);
  assert.equal(cancelled,true);
  let resolve;let lateCancelled=false;
  const read=make({timeoutMS:20,fetcher:()=>new Promise(done=>{resolve=done;})});
  assert.equal(await read(new AbortController().signal),null);
  resolve(new Response(new ReadableStream({cancel(){lateCancelled=true;}}),{headers:{'content-type':'application/json'}}));
  await new Promise(done=>setImmediate(done));assert.equal(lateCancelled,true);
  let calls=0;const c=new AbortController();c.abort();assert.equal(await make({fetcher:async()=>{calls++;return healthy();}})(c.signal),null);assert.equal(calls,0);
 }finally{clearInterval(keepAlive);}
});

test('a live health version is not effective low-AAL policy or approval of an unreviewed version',async()=>{
 const signal=new AbortController().signal;const record=await make()(signal);
 let requests=0;
 const policy=source=>createHomeHandoffPolicyReader({projectID,accessToken:'synthetic_config_read_credential',clock:()=>now,readEffectiveLowAAL:source,fetcher:async()=>{requests++;return Response.json({sessions_timebox:0,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false});}});
 assert.equal(await policy(async()=>record)(signal),null);assert.equal(requests,0);
 const unknown=await make({fetcher:async()=>Response.json({name:'GoTrue',version:'v9.0.0'})})(signal);
 assert.equal(await policy(async()=>({...unknown,allowLowAALSeconds:null}))(signal),null);assert.equal(requests,0);
 // Explicit, independently supplied disabled setting can compose with reviewed
 // version evidence in this synthetic test; the production source remains open.
 const result=await policy(async()=>({...record,allowLowAALSeconds:null}))(signal);
 assert.equal(result.authVersion,'v2.197.0');assert.equal(result.allowLowAALSeconds,null);assert.equal(requests,1);
});
