import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/web-enrollment-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readOrEnrollWebAccount:run}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const account='11111111-1111-4111-8111-111111111111',sessionID='22222222-2222-4222-8222-222222222222',epochID='33333333-3333-4333-8333-333333333333',requestID='44444444-4444-4444-8444-444444444444';
const token='e30.'+Buffer.from(JSON.stringify({sub:account,session_id:sessionID,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
const reply=(url,value)=>{const r=Response.json(value,{headers:{'cache-control':'no-store'}});Object.defineProperty(r,'url',{value:String(url)});return r;};
function fixture(mode='ok'){
 let current={account,token},writes=0,reads=0,enrolled=false;const signal=new AbortController();
 const options={account,session:async()=>current,signal:signal.signal,origin:'https://example.invalid',fetcher:async(url,init)=>{
  assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,'Bearer '+token);
  if(init.method==='POST'){
   writes++;assert.deepEqual(JSON.parse(init.body),{confirmation:'ENROLL_OUCHI_MAINTENANCE',password:'synthetic',requestID});enrolled=true;
   if(mode==='lost')throw Error('Lost acknowledgement');if(mode==='logout')current=null;if(mode==='cancel')signal.abort();
   return reply(url,{userID:account,sessionID,epochID:mode==='wrong-receipt'?null:epochID,requestID});
  }
  reads++;return reply(url,{userID:account,sessionID:mode==='wrong-session'?requestID:sessionID,epochID:enrolled?(mode==='changed-epoch'?requestID:epochID):null,enrolled});
 }};return {options,consent:{password:'synthetic',requestID},counts:()=>({writes,reads})};
}
test('free explicit Web registration checks exact receipt and readback; absent read never writes',async()=>{
 const f=fixture();assert.equal((await run(f.options)).enrolled,false);assert.equal(f.counts().writes,0);
 const result=await run({...f.options,consent:f.consent});assert.deepEqual(result,{userID:account,sessionID,epochID,enrolled:true});assert.ok(Object.isFrozen(result));assert.deepEqual(f.counts(),{writes:1,reads:2});
});
test('lost acknowledgement reads status without duplicate purchase/registration; altered identities and cancellation cannot confirm',async()=>{
 const f=fixture('lost');await assert.rejects(()=>run({...f.options,consent:f.consent}));assert.equal((await run(f.options)).enrolled,true);assert.equal(f.counts().writes,1);
 for(const mode of ['wrong-receipt','wrong-session','changed-epoch','logout','cancel']){const f=fixture(mode);await assert.rejects(()=>run({...f.options,consent:f.consent}),undefined,mode);assert.equal(f.counts().writes,1);}
});
