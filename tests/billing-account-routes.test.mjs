import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const moduleURL=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222';
const stub=moduleURL(`
export function billingConfiguration(){return {};}
export function billingDatabase(){
 const h=globalThis.billingRouteHarness;
 const query={eq(key,value){h.filters.push([key,value]);return query;},then(resolve){resolve({data:h.rows,error:null});}};
 return {auth:{getUser:async()=>({data:{user:{id:h.user}},error:h.authError})},rpc:async()=>{h.writes++;return {error:null}},from:()=>({select:()=>query})};
}
export async function verifiedPurchaseAccount(){const h=globalThis.billingRouteHarness;h.bindings++;if(h.bindingError)throw Error('unavailable');return h.account;}
export async function readBillingBody(request){return request.json();}
export async function verifyBillingTransaction(){const h=globalThis.billingRouteHarness;h.verifications++;return h.transaction;}
`);
const load=async path=>import(moduleURL(compile(path).replaceAll("'@/lib/billing-server'",JSON.stringify(stub)).replaceAll("'@/lib/billing'",JSON.stringify(moduleURL(compile('lib/billing.ts'))))));
const {POST}=await load('app/api/billing/transactions/route.ts');
const {GET}=await load('app/api/billing/entitlement/route.ts');
test('billing routes gate writes and rights on verified current enrollment',async()=>{
 const now=Date.now(),transaction={transactionId:'1',originalTransactionId:'1',productId:'ouchi.premium.monthly',environment:'Sandbox',accountToken:epoch,signedAt:now,purchasedAt:now,expiresAt:now+60000};
 const h=globalThis.billingRouteHarness={user,account:epoch,authError:null,bindingError:false,bindings:0,writes:0,verifications:0,filters:[],rows:[],transaction};
 const request=()=>new Request('https://example.invalid/api/billing/transactions',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({signedTransaction:'synthetic'})});
 const get=()=>GET(new Request('https://example.invalid/api/billing/entitlement',{headers:{authorization:'Bearer synthetic'}}));
 try{
  h.authError=Error('invalid');assert.equal((await POST(request())).status,401);assert.equal((await get()).status,401);assert.equal(h.bindings,0);h.authError=null;
  h.account=null;assert.equal((await POST(request())).status,403);assert.equal((await get()).status,403);assert.equal(h.verifications,0);assert.equal(h.writes,0);
  h.bindingError=true;assert.equal((await POST(request())).status,503);assert.equal((await get()).status,503);h.bindingError=false;h.account=epoch;
  h.transaction={...transaction,accountToken:user};assert.equal((await POST(request())).status,403);assert.equal(h.writes,0);
  h.transaction=transaction;assert.equal((await POST(request())).status,200);assert.equal(h.writes,1);
  h.rows=[{payload:{...transaction,accountToken:user}}];let response=await get();assert.equal((await response.json()).plan,'free');
  h.rows=[{payload:transaction}];response=await get();const body=await response.json();assert.equal(body.plan,'premium');assert.equal(body.purchaseAccountToken,epoch);assert.equal(body.salesEnabled,false);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(h.filters.slice(-2),[['user_id',user],['app_epoch_id',epoch]]);
 }finally{delete globalThis.billingRouteHarness;}
});
