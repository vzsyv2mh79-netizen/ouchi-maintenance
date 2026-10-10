import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile = path => ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const purchaseAccount='33333333-3333-4333-8333-333333333333';
const userId='11111111-1111-4111-8111-111111111111',homeId='22222222-2222-4222-8222-222222222222';
const stub=url(`export async function verifiedPurchaseAccount(){return globalThis.reportHarness.account;}
export function billingConfiguration(){return globalThis.reportHarness.config;}
export function billingDatabase(){return {auth:{getUser:async()=>({data:{user:{id:'${userId}'}},error:null})},from:()=>({select:()=>({eq:()=>({eq:async()=>({data:globalThis.reportHarness.rows,error:null})})})})};}
export function createClient(url,key,options){globalThis.reportHarness.client={url,key,options};return {rpc:async()=>{globalThis.reportHarness.loads++;return {data:globalThis.reportHarness.household,error:null};}};}`);
const code=compile('app/api/development/maintenance-report/route.ts')
 .replaceAll("'@supabase/supabase-js'",JSON.stringify(stub)).replaceAll("'@/lib/billing-server'",JSON.stringify(stub))
 .replaceAll("'@/lib/billing'",JSON.stringify(url(compile('lib/billing.ts'))))
 .replaceAll("'@/lib/backup'",JSON.stringify(url(compile('lib/backup.ts'))))
 .replaceAll("'@/lib/maintenance-report'",JSON.stringify(url(compile('lib/maintenance-report.ts'))));
const {GET}=await import(url(code));
test('actual route refuses production, unverified/free/expired/refunded/tip accounts and scopes household reads to caller JWT',async()=>{
 const saved={VERCEL_ENV:process.env.VERCEL_ENV,OUCHI_REPORT_TEST_MODE:process.env.OUCHI_REPORT_TEST_MODE,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 globalThis.reportHarness={account:purchaseAccount,config:{url:'https://example.supabase.co',key:'synthetic_service'},rows:[],loads:0,household:{homes:[{id:homeId,name:'自宅',kind:'home'}],products:[],tasks:[],history:[]}};
 const h=globalThis.reportHarness;
 const request=id=>new Request('https://preview.example/api/development/maintenance-report?homeId='+id,{headers:{authorization:'Bearer synthetic_user_jwt'}});
 try {
  process.env.OUCHI_REPORT_TEST_MODE='true';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic_only';process.env.VERCEL_ENV='production';
  assert.equal((await GET(request(homeId))).status,503);assert.equal(h.loads,0);
  process.env.VERCEL_ENV='preview';
  assert.equal((await GET(request(homeId))).status,403);assert.equal(h.loads,0);
  const now=Date.now(),payload={transactionId:'1',originalTransactionId:'1',productId:'ouchi.premium.monthly',accountToken:purchaseAccount,environment:'Sandbox',signedAt:now,purchasedAt:now-1000,expiresAt:now+60000};
  for(const patch of [{expiresAt:now-1},{revokedAt:now-1},{productId:'ouchi.tip.small'},{accountToken:homeId},{accountToken:userId},{environment:'Production'}]) {
   h.rows=[{payload:{...payload,...patch}}];assert.equal((await GET(request(homeId))).status,403);assert.equal(h.loads,0);
  }
  h.rows=[{payload}];
  h.account=null;assert.equal((await GET(request(homeId))).status,403);assert.equal(h.loads,0);h.account=purchaseAccount;
  assert.equal((await GET(request(userId))).status,404);
  const response=await GET(request(homeId));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.environment,'Sandbox');assert.equal(body.salesEnabled,false);assert.equal(body.report.homeId,homeId);
  assert.equal(h.client.key,'sb_publishable_synthetic_only');assert.equal(h.client.options.global.headers.Authorization,'Bearer synthetic_user_jwt');
  assert.equal((await GET(new Request('https://preview.example/api/development/maintenance-report?homeId='+homeId))).status,401);
 } finally {for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}delete globalThis.reportHarness;}
});
