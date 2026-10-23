import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import ts from 'typescript';
const transpile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const workerURL=url(transpile('lib/billing-restore-transfer-worker.ts'));
const code=transpile('lib/billing-restore-transfer-apple.ts').replace(/from ['"]\.\/billing['"]/g,'from '+JSON.stringify(url(transpile('lib/billing.ts')))).replace(/from ['"]\.\/billing-restore-transfer-worker['"]/g,'from '+JSON.stringify(workerURL));
const {createSandboxRestoreAppleAdapter:create}=await import(url(code));const {runRestoreTransfer:run}=await import(workerURL);
function fixture(options={}){
 const job={id:randomUUID(),lease:randomUUID(),userID:randomUUID(),sessionID:randomUUID(),epochID:randomUUID(),previousAccountToken:randomUUID(),originalTransactionID:'100001',appTransactionID:'200001',environment:'Sandbox',bundleID:'dev.synthetic.ouchi',authorizedAt:Date.now()-1000,phase:'authorized'};
 const state={events:[],token:job.previousAccountToken,job,decoded:null,response:null};
 const payload=()=>({bundleId:job.bundleID,environment:'Sandbox',productId:'ouchi.premium.monthly',type:'Auto-Renewable Subscription',transactionId:'100002',originalTransactionId:job.originalTransactionID,appAccountToken:state.token,appTransactionId:job.appTransactionID,inAppOwnershipType:'PURCHASED',signedDate:Date.now(),purchaseDate:Date.now()-1000,expiresDate:Date.now()+3600000});
 const client={getAllSubscriptionStatuses:async id=>{state.events.push('status');assert.equal(id,job.originalTransactionID);return state.response??{environment:'Sandbox',bundleId:job.bundleID,data:[{lastTransactions:[{originalTransactionId:job.originalTransactionID,status:1,signedTransactionInfo:'synthetic-current-JWS'}]}]};},setAppAccountToken:async(id,body)=>{state.events.push('PUT');assert.equal(id,job.originalTransactionID);assert.deepEqual(body,{appAccountToken:job.epochID});state.token=body.appAccountToken;}};
 const verifier={verifyAndDecodeTransaction:async signed=>{state.events.push('verify');assert.equal(signed,'synthetic-current-JWS');return state.decoded??payload();}};
 const adapter=create({client,verifier,bundleID:job.bundleID,...options});
 return {job,state,client,verifier,adapter,payload};
}
test('fresh status selects exact original and verifies its exact JWS before normalized readback',async()=>{
 const f=fixture(),r=await f.adapter.readCurrent(f.job);assert.equal(r.transaction.accountToken,f.job.previousAccountToken);assert.equal(r.appTransactionID,f.job.appTransactionID);assert.equal(r.signedTransaction,'synthetic-current-JWS');assert.deepEqual(f.state.events,['status','verify']);
});
test('ambiguous/missing/expired status and wrong response scope are refused before verification',async()=>{
 for(const change of [{environment:'Production'},{bundleId:'foreign.app'},{data:[]},{data:[{}]},{data:[{lastTransactions:[{originalTransactionId:'9999'}]}]},{data:[{lastTransactions:[{originalTransactionId:'100001',status:2,signedTransactionInfo:'synthetic-current-JWS'}]}]},{data:[{lastTransactions:[{originalTransactionId:'100001',status:1,signedTransactionInfo:'synthetic-current-JWS'},{originalTransactionId:'100001',status:1,signedTransactionInfo:'synthetic-current-JWS'}]}]}]){
  const f=fixture();f.state.response={environment:'Sandbox',bundleId:f.job.bundleID,data:[],...change};await assert.rejects(f.adapter.readCurrent(f.job));assert.deepEqual(f.state.events,['status']);
 }
});
test('verified payload must match original/app/account ownership and supported active product',async()=>{
 for(const change of [{bundleId:'foreign.app'},{environment:'Production'},{originalTransactionId:'9999'},{appTransactionId:'9999'},{inAppOwnershipType:'FAMILY_SHARED'},{productId:'foreign.product'},{revocationDate:Date.now()},{isUpgraded:true}]){
  const f=fixture();f.state.decoded={...f.payload(),...change};await assert.rejects(f.adapter.readCurrent(f.job));assert.deepEqual(f.state.events,['status','verify']);
 }
 const f=fixture();f.verifier.verifyAndDecodeTransaction=async()=>{throw Error('synthetic signature rejection');};await assert.rejects(f.adapter.readCurrent(f.job),/signature rejection/);assert.ok(!f.state.events.includes('PUT'));
});
test('invalid/Production job and missing durable mutation marker never invoke Apple update',async()=>{
 for(const change of [{environment:'Production'},{bundleID:'foreign.app'},{originalTransactionID:'../x'},{epochID:'00000000-0000-0000-0000-000000000000'}]){
  const f=fixture();await assert.rejects(f.adapter.readCurrent({...f.job,...change}));await assert.rejects(f.adapter.setToken({...f.job,...change}));assert.deepEqual(f.state.events,[]);
 }
 const f=fixture();await assert.rejects(f.adapter.setToken(f.job),/marker required/);assert.deepEqual(f.state.events,[]);
 await f.adapter.setToken({...f.job,phase:'update_started',mutationStartedAt:Date.now()});assert.deepEqual(f.state.events,['PUT']);
});
test('worker and adapter preserve unknown PUT result and reconcile verified status without retrying update',async()=>{
 const f=fixture();const store={completionIsCurrent:async()=>false,leaseIsCurrent:async()=>true,markUpdateStarted:async j=>{f.state.job={...j,phase:'update_started',mutationStartedAt:Date.now()};return f.state.job;},complete:async(j,r)=>{assert.equal(r.transaction.accountToken,j.epochID);f.state.events.push('commit');return true;}};
 f.client.setAppAccountToken=async()=>{f.state.events.push('PUT');f.state.token=f.job.epochID;throw Error('response lost after synthetic Apple update');};
 const deps={store,...f.adapter};assert.equal((await run(f.job,deps)).reason,'unavailable');assert.equal(f.state.job.phase,'update_started');
 assert.deepEqual(await run(f.state.job,deps),{state:'complete'});assert.equal(f.state.events.filter(x=>x==='PUT').length,1);assert.equal(f.state.events.at(-1),'commit');
});
test('timeout and cancellation fail closed; unabortable SDK mutation is never retried by adapter',async()=>{
 const f=fixture({timeoutMs:10});f.client.setAppAccountToken=async()=>{f.state.events.push('PUT');return new Promise(()=>{});};
 await assert.rejects(f.adapter.setToken({...f.job,phase:'update_started',mutationStartedAt:Date.now()}),/unavailable/);assert.deepEqual(f.state.events,['PUT']);
 const controller=new AbortController(),c=fixture({signal:controller.signal});controller.abort();await assert.rejects(c.adapter.readCurrent(c.job),/cancelled/);assert.deepEqual(c.state.events,[]);
});
// All Apple API/signature outputs above are synthetic mocks. No SDK credential,
// actual Apple signature, account update, paid access or external call is used.
