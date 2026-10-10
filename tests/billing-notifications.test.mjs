import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const stub=moduleURL(`
export function billingConfiguration(){return globalThis.notificationHarness.enabled?{}:null;}
export function readBillingBody(request){return request.json();}
export function billingVerifier(){return {verifyAndDecodeNotification:async()=>{const h=globalThis.notificationHarness;if(h.outerInvalid)throw Error('invalid');return h.notification;}};}
export async function verifyBillingTransaction(){const h=globalThis.notificationHarness;if(h.innerInvalid)throw Error('invalid');return h.transaction;}
export function billingDatabase(){return {rpc:async(name,args)=>{const h=globalThis.notificationHarness;h.writes++;h.payload=args.payload;if(h.networkFailure)throw Error('network');return {error:h.databaseFailure?Error('database'):null};}};}
`);
const compiled=ts.transpileModule(readFileSync('app/api/billing/notifications/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {POST}=await import(moduleURL(compiled.replaceAll("'@/lib/billing-server'",JSON.stringify(stub))));
test('actual notification handler distinguishes invalid proof from retryable persistence failure',async()=>{
 const h=globalThis.notificationHarness={enabled:true,outerInvalid:false,innerInvalid:false,networkFailure:false,databaseFailure:false,writes:0,notification:{data:{signedTransactionInfo:'synthetic'}},transaction:{transactionId:'verified-fixture'}};
 const send=()=>POST(new Request('https://example.invalid/api/billing/notifications',{method:'POST',body:JSON.stringify({signedPayload:'synthetic'})}));
 try{
  h.enabled=false;assert.equal((await send()).status,503);assert.equal(h.writes,0);h.enabled=true;
  h.outerInvalid=true;assert.equal((await send()).status,400);assert.equal(h.writes,0);h.outerInvalid=false;
  h.innerInvalid=true;assert.equal((await send()).status,400);assert.equal(h.writes,0);h.innerInvalid=false;
  h.networkFailure=true;let response=await send();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Retry notification'});h.networkFailure=false;
  h.databaseFailure=true;assert.equal((await send()).status,503);h.databaseFailure=false;
  response=await send();assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true});assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(h.payload,h.transaction);
  const writes=h.writes;h.notification={};assert.equal((await send()).status,200);assert.equal(h.writes,writes);
 }finally{delete globalThis.notificationHarness;}
});
