import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const billing=url(compile('lib/billing.ts'));const {reconcilePurchaseHistory:reconcile}=await import(url(compile('lib/billing-reconciliation.ts').replace("'./billing'",JSON.stringify(billing))));
const token='11111111-1111-4111-8111-111111111111',scope={environment:'Sandbox',bundleId:'test.ouchi',accountToken:token},seed={environment:'Sandbox',transactionId:'1',originalTransactionId:'10',productId:'ouchi.premium.monthly',accountToken:token,signedAt:100,purchasedAt:50,expiresAt:200};
const envelope=value=>({environment:'Sandbox',bundleId:'test.ouchi',...value});
const setup=()=>{const calls={pages:[],transactions:[],renewals:[]};return {calls,deps:{history:async(id,revision)=>{calls.pages.push({id,revision});return envelope({hasMore:false,signedTransactions:['history']});},statuses:async()=>envelope({data:[{lastTransactions:[{originalTransactionId:'10',signedTransactionInfo:'status',signedRenewalInfo:'renewal',status:4}]}]}),verifyTransaction:async()=>({...seed}),verifyRenewal:async()=>({environment:'Sandbox',accountToken:token,originalTransactionId:'10'}),saveTransaction:async(jws,transaction)=>{calls.transactions.push({jws,transaction});},saveRenewal:async(jws,renewal)=>{calls.renewals.push({jws,renewal});}}};};
test('history pagination and latest paired signed status persist before complete without trusting raw status',async()=>{
 const h=setup();h.deps.history=async(id,revision)=>{h.calls.pages.push({id,revision});return envelope(revision===null?{hasMore:true,revision:'next',signedTransactions:['one']}:{hasMore:false,signedTransactions:['two']});};
 const result=await reconcile(seed,scope,h.deps);assert.equal(result.complete,true);assert.deepEqual(h.calls.pages,[{id:'1',revision:null},{id:'1',revision:'next'}]);assert.deepEqual(h.calls.transactions.map(x=>x.jws),['one','two','status']);assert.equal(h.calls.renewals[0].jws,'renewal');assert.equal(result.renewals,1);
});
test('partial page limit exposes a resumable cursor, never falsely complete',async()=>{
 const h=setup();h.deps.history=async()=>envelope({hasMore:true,revision:'next',signedTransactions:['one']});h.deps.statuses=async()=>{throw Error('must not request yet');};
 const result=await reconcile(seed,scope,h.deps,{maxPages:1});assert.equal(result.complete,false);assert.equal(result.revision,'next');assert.equal(h.calls.transactions.length,1);
});
test('invalid page/proof/ownership cannot grant another account or advance completion',async()=>{
 for(const response of [envelope({hasMore:'false',signedTransactions:[]}),envelope({hasMore:true,revision:'',signedTransactions:[]}),{environment:'Production',bundleId:'test.ouchi',hasMore:false,signedTransactions:['one']},envelope({hasMore:false,signedTransactions:['one','invalid']})]){
  const h=setup();h.deps.history=async()=>response;h.deps.verifyTransaction=async(jws)=>{if(jws==='invalid')throw Error('unsigned');return seed;};await assert.rejects(()=>reconcile(seed,scope,h.deps));assert.equal(h.calls.transactions.length,0);
 }
 const h=setup();h.deps.verifyTransaction=async()=>({...seed,accountToken:'22222222-2222-4222-8222-222222222222'});const result=await reconcile(seed,scope,h.deps);assert.equal(result.ignoredOtherAccounts,2);assert.equal(h.calls.transactions.length,0);assert.equal(h.calls.renewals.length,0);
});
test('save failure, status mismatch and repeating cursor remain failures for retry',async()=>{
 for(const kind of ['save','renewal','cursor','identity']){const h=setup();
  if(kind==='save')h.deps.saveTransaction=async()=>{throw Error('outage');};
  if(kind==='renewal')h.deps.verifyRenewal=async()=>({environment:'Production',accountToken:token,originalTransactionId:'10'});
  if(kind==='identity')h.deps.statuses=async()=>envelope({data:[{lastTransactions:[{originalTransactionId:'other',signedTransactionInfo:'status',signedRenewalInfo:'renewal'}]}]});
  if(kind==='cursor')h.deps.history=async()=>envelope({hasMore:true,revision:'same',signedTransactions:[]});
  await assert.rejects(()=>reconcile(seed,scope,h.deps));assert.equal(h.calls.renewals.length,0);
 }
 const h=setup();await assert.rejects(()=>reconcile(seed,{...scope,accountToken:'other'},h.deps));assert.equal(h.calls.pages.length,0);
});
test('Production requires matching Apple app identity and environment before any save',async()=>{
 const productionSeed={...seed,environment:'Production',productId:'ouchi.tip.small'},productionScope={...scope,environment:'Production',appAppleId:123};
 for(const appAppleId of [undefined,456]){const h=setup();h.deps.history=async()=>({environment:'Production',bundleId:'test.ouchi',appAppleId,hasMore:false,signedTransactions:[]});await assert.rejects(()=>reconcile(productionSeed,productionScope,h.deps));assert.equal(h.calls.transactions.length,0);}
 const h=setup();h.deps.history=async()=>({environment:'Production',bundleId:'test.ouchi',appAppleId:123,hasMore:false,signedTransactions:[]});assert.equal((await reconcile(productionSeed,productionScope,h.deps)).complete,true);
 await assert.rejects(()=>reconcile(productionSeed,{...productionScope,appAppleId:undefined},h.deps));
});
