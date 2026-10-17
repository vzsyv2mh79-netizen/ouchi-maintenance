import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID,randomBytes,createHash} from 'node:crypto';import ts from 'typescript';
const compiled=new Map();function compile(name){if(compiled.has(name))return compiled.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,n)=>'from '+JSON.stringify(compile(n)));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');compiled.set(name,url);return url;}
const {prepareWebClosureRead:prepare,recoverWebClosureRead:recover,listWebClosureReads:list,forgetExpiredWebClosureRead:forget,cleanupWebClosurePendingFiles:cleanup}=await import(compile('web-closure-read-client'));
const scope={account:'11111111-1111-4111-8111-111111111111',epochID:'22222222-2222-4222-8222-222222222222',submissionID:'33333333-3333-4333-8333-333333333333',requestID:'44444444-4444-4444-8444-444444444444'};
const hash=value=>createHash('sha256').update('Ouchi/closure-read/v1\n'+value).digest('hex');
function fixture(){
 const controller=new AbortController(),registered=new Map(),calls=[];let saved=null,current={account:scope.account,token:'synthetic-only'},mode='ok',prepares=0,expiry=new Date(Date.now()+3600000).toISOString(),state='running';
 const vault={read:async()=>saved,list:async account=>saved&&(!account||saved.account===account)?[Object.fromEntries(Object.entries(saved).filter(([name])=>name!=='token'))]:[],prepare:async(s,e)=>{prepares++;if(mode==='storage-failure')throw Error('unavailable');saved??=Object.freeze({...s,expiresAt:e,credentialID:randomUUID(),token:randomBytes(32).toString('base64url')});if(mode==='abort-after-save')controller.abort();return saved;},forgetExpired:async(meta,signal)=>{signal.throwIfAborted();assert.equal(meta.credentialID,saved.credentialID);assert.ok(Date.parse(meta.expiresAt)<=Date.now());saved=null;}};
 const options={expectedAccount:scope.account,session:async()=>current,signal:controller.signal,origin:'https://example.invalid',vault,fetcher:async(url,init)=>{
  const action=new URL(url).pathname.split('/').at(-1),body=JSON.parse(init.body);calls.push(action);
  assert.equal(new URL(url).search,'');assert.equal(init.method,'POST');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.equal(init.referrerPolicy,'no-referrer');
  assert.deepEqual([body.expectedEpochID,body.submissionID,body.requestID],[scope.epochID,scope.submissionID,scope.requestID]);
  const common={epochID:scope.epochID,submissionID:scope.submissionID,requestID:scope.requestID,...(action==='describe'?{}:{credentialID:body.credentialID})};
  const reply=(value,status=200)=>{const r=Response.json(value,{status,headers:{'cache-control':'no-store'}});Object.defineProperty(r,'url',{value:String(url)});return r;};
  if(action==='status')assert.equal(init.headers.Authorization,undefined);else assert.equal(init.headers.Authorization,'Bearer synthetic-only');
  if(action==='describe'){
   assert.equal(init.headers['X-Ouchi-Closure-Read'],undefined);if(mode==='switch-describe')current=null;
   if(mode==='window-unavailable')return reply({kind:'app-closure-read-unavailable/v1',...common,state:'unavailable'},404);
   return reply({kind:'app-closure-read-window/v1',...common,expiresAt:expiry});
  }
  assert.ok(saved,'Key must survive durable readback before any status/register');assert.equal(body.credentialID,saved.credentialID);assert.equal(hash(init.headers['X-Ouchi-Closure-Read']),hash(saved.token));
  if(action==='status'){
   if(mode==='status-error')return reply({error:'unavailable'},503);
   if(mode==='abort-status')controller.abort();if(mode==='switch-status')current=null;if(mode==='login-status')current={account:scope.account,token:'new-login'};
   if(mode==='corrupt-after-status')saved=Object.freeze({...saved,token:randomBytes(32).toString('base64url')});
   if(!registered.has(body.credentialID))return reply({kind:'app-closure-read-unavailable/v1',...common,state:'unavailable'},404);
   return reply({kind:'app-closure-read-status/v1',...common,state:mode==='wrong-state'?'review_required':state});
  }
  assert.equal(action,'register');assert.equal(body.expiresAt,saved.expiresAt);registered.set(saved.credentialID,{hash:hash(saved.token),expiresAt:saved.expiresAt});
  if(mode==='lost-register')throw Error('reply lost after commit');return reply({kind:'app-closure-read-registration/v1',...common,expiresAt:saved.expiresAt,registered:true});
 }};
 return {options,calls,registered,mode:v=>{mode=v;},expiry:v=>{expiry=v;},state:v=>{state=v;},logout:()=>{current=null;},saved:()=>saved,replace:v=>{saved=v;},prepares:()=>prepares,controller};
}
test('explicit setup saves original key and deadline before registration; public result never contains a token',async()=>{
 const f=fixture(),result=await prepare(f.options,scope);assert.deepEqual(f.calls,['describe','status','register']);assert.equal(f.prepares(),1);assert.equal(f.registered.size,1);assert.equal(result.status,null);assert.equal('token' in result.reference,false);assert.equal(result.reference.expiresAt,f.saved().expiresAt);
});
test('lost registration acknowledgement recovers same original key by status, then works without any Auth header after logout',async()=>{
 const f=fixture();f.mode('lost-register');await assert.rejects(()=>prepare(f.options,scope));const original=f.saved(),digest=hash(original.token);assert.equal(f.registered.size,1);
 f.mode('ok');const result=await prepare(f.options,scope);assert.equal(result.status.state,'running');assert.equal(f.prepares(),1);assert.equal(f.calls.filter(x=>x==='register').length,1);assert.equal(hash(f.saved().token),digest);assert.equal(f.saved().expiresAt,original.expiresAt);
 f.logout();f.state('complete');const options={...f.options,expectedAccount:null};assert.equal((await recover(options,result.reference)).state,'complete');assert.equal(f.calls.at(-1),'status');assert.equal((await list(options)).length,1);
});
test('status transport failure never registers a replacement; recover is status-only and unavailable is not completion',async()=>{
 const f=fixture();f.mode('status-error');await assert.rejects(()=>prepare(f.options,scope));const saved=f.saved();assert.equal(f.calls.includes('register'),false);assert.equal(f.prepares(),1);
 f.mode('ok');f.logout();assert.equal(await recover({...f.options,expectedAccount:null},saved),null);assert.equal(f.prepares(),1);assert.equal(f.registered.size,0);assert.equal(f.calls.filter(x=>x==='describe').length,1);
});
test('expired/unavailable/overlong windows and storage failures cannot send registration',async()=>{
 for(const mode of ['window-unavailable','storage-failure','switch-describe','abort-after-save']){const f=fixture();f.mode(mode);await assert.rejects(()=>prepare(f.options,scope),undefined,mode);assert.equal(f.registered.size,0);}
 for(const offset of [-1000,31*86400000]){const f=fixture();f.expiry(new Date(Date.now()+offset).toISOString());await assert.rejects(()=>prepare(f.options,scope));assert.equal(f.prepares(),0);}
 const f=fixture();const saved={...scope,credentialID:randomUUID(),expiresAt:new Date(Date.now()-1000).toISOString(),token:randomBytes(32).toString('base64url')};f.replace(saved);await assert.rejects(()=>prepare(f.options,scope));assert.equal(f.calls.length,0);assert.equal(f.prepares(),0);
});
test('account changes, cancellation, corrupted retained keys and wrong status cannot confirm',async()=>{
 for(const mode of ['abort-status','switch-status','corrupt-after-status']){const f=fixture();f.mode(mode);await assert.rejects(()=>prepare(f.options,scope),undefined,mode);assert.equal(f.registered.size,0);}
 const f=fixture();const r=await prepare(f.options,scope);f.mode('wrong-state');await assert.rejects(()=>recover(f.options,r.reference));
 await assert.rejects(()=>recover({...f.options,expectedAccount:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},r.reference));
 const calls=f.calls.length;f.controller.abort();await assert.rejects(()=>recover(f.options,r.reference));assert.equal(f.calls.length,calls);
});
test('explicit local forget requires expired exact metadata and does not issue any network request',async()=>{
 const f=fixture();const r=await prepare(f.options,scope);const calls=f.calls.length;await assert.rejects(()=>forget(f.options,r.reference));assert.equal(f.calls.length,calls);assert.ok(f.saved());
 const expired={...f.saved(),expiresAt:new Date(Date.now()-1000).toISOString()};f.replace(expired);await forget(f.options,expired);assert.equal(f.saved(),null);assert.equal(f.calls.length,calls);
});

test('local pending cleanup needs a fresh canonical complete and already absent Auth, retains original capability, and is repeatable',async()=>{
 const f=fixture(),r=await prepare(f.options,scope);let erased=0;
 const clearPending=async(account,epoch,signal,expiry)=>{signal.throwIfAborted();assert.equal(account,scope.account);assert.equal(epoch,scope.epochID);assert.equal(expiry,r.reference.expiresAt);erased++;};
 await assert.rejects(()=>cleanup({...f.options,clearPending},r.reference));assert.equal(erased,0);
 f.logout();const options={...f.options,expectedAccount:null,clearPending};
 for(const state of ['pending','running','failed']){f.state(state);await assert.rejects(()=>cleanup(options,r.reference));assert.equal(erased,0);}
 f.state('complete');f.mode('status-error');await assert.rejects(()=>cleanup(options,r.reference));assert.equal(erased,0);
 f.mode('ok');await cleanup(options,r.reference);await cleanup(options,r.reference);assert.equal(erased,2);assert.ok(f.saved());assert.equal(f.calls.filter(x=>x==='register').length,1);
});
test('cancelled, expired, unavailable or changed original credential cannot authorize pending cleanup; no cached completion is accepted',async()=>{
 for(const mode of ['status-error','corrupt-after-status','wrong-state','login-status','abort-status']){
  const f=fixture(),r=await prepare(f.options,scope);f.logout();f.state('complete');f.mode(mode);let erased=0;
  await assert.rejects(()=>cleanup({...f.options,expectedAccount:null,clearPending:async()=>{erased++;}},r.reference));assert.equal(erased,0);
 }
 const f=fixture(),r=await prepare(f.options,scope);f.logout();f.state('complete');f.registered.clear();let erased=0;
 const options={...f.options,expectedAccount:null,clearPending:async()=>{erased++;}};
 await assert.rejects(()=>cleanup(options,r.reference));assert.equal(erased,0);
 f.replace({...f.saved(),expiresAt:new Date(Date.now()-1000).toISOString()});await assert.rejects(()=>cleanup(options,r.reference));assert.equal(erased,0);
 f.controller.abort();await assert.rejects(()=>cleanup(options,r.reference));assert.equal(erased,0);
});
