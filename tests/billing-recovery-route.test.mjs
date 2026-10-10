import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const stubURL=url(`export let config=null,calls=0,state='idle',error=false;export function reset(c,s,e=false){config=c;state=s;error=e;calls=0;}export function billingConfiguration(){return config;}export async function dispatchNextBillingRecoveryJob(){calls++;if(error)throw Error('private provider detail');return {state};}`),stub=await import(stubURL);
const code=ts.transpileModule(readFileSync('app/api/cron/billing-recovery/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@/lib/billing-server'",JSON.stringify(stubURL));const {GET}=await import(url(code));
test('recovery route is authenticated, disabled by default and never accepts caller-selected scope',async()=>{
 const keys=['CRON_SECRET','BILLING_RECONCILIATION_WORKER_ENABLED'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const secret='synthetic-cron-fixture-only';
 const request=(token='Bearer '+secret,path='')=>new Request('https://example.invalid/api/cron/billing-recovery'+path,{headers:{authorization:token}});
 try{
  process.env.CRON_SECRET=secret;delete process.env.BILLING_RECONCILIATION_WORKER_ENABLED;stub.reset({environment:'Sandbox'},'complete');
  for(const token of ['wrong','Bearer wrong','Bearer '+secret+'x'])assert.equal((await GET(request(token))).status,401);
  assert.equal((await GET(request())).status,503);assert.equal(stub.calls,0);
  process.env.BILLING_RECONCILIATION_WORKER_ENABLED='true';assert.equal((await GET(request('Bearer '+secret,'?environment=Production'))).status,400);assert.equal(stub.calls,0);
  stub.reset(null,'complete');assert.equal((await GET(request())).status,503);assert.equal(stub.calls,0);
  for(const state of ['idle','queued','complete','retry_requested']){stub.reset({environment:'Sandbox'},state);const response=await GET(request());assert.equal(response.status,state==='retry_requested'?503:200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{state});assert.equal(stub.calls,1);}
  stub.reset({environment:'Sandbox'},'complete',true);const response=await GET(request());assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
 }finally{for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
