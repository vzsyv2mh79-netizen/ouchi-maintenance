import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const compile=p=>ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const billing=url(compile('lib/billing.ts')),engine=url(compile('lib/billing-reconciliation.ts').replace("'./billing'",JSON.stringify(billing))),deadline=url(compile('lib/billing-read-deadline.ts'));
const {runRecoveryJob:run,parseRecoveryJob:parse}=await import(url(compile('lib/billing-recovery-worker.ts').replace("'./billing-reconciliation'",JSON.stringify(engine)).replace("'./billing-read-deadline'",JSON.stringify(deadline))));
const epoch='11111111-1111-4111-8111-111111111111',job={id:'22222222-2222-4222-8222-222222222222',userId:'33333333-3333-4333-8333-333333333333',accountToken:epoch,environment:'Sandbox',transactionId:'1',revision:null,leaseToken:'44444444-4444-4444-8444-444444444444',leaseUntil:new Date(Date.now()+120000).toISOString()},scope={environment:'Sandbox',accountToken:epoch,bundleId:'test.ouchi'},seed={environment:'Sandbox',transactionId:'1',originalTransactionId:'1',accountToken:epoch,productId:'ouchi.tip.small',signedAt:200,purchasedAt:100};
const setup=()=>{const saved=[],finished=[];return {saved,finished,deps:{readSeed:async()=>seed,leaseIsCurrent:async()=>true,finish:async(j,r)=>{finished.push(r);return true;},apple:{history:async()=>({environment:'Sandbox',bundleId:scope.bundleId,hasMore:true,revision:'next',signedTransactions:['signed']}),statuses:async()=>{throw Error('not needed');},verifyTransaction:async()=>seed,verifyRenewal:async()=>{throw Error('not needed');},saveTransaction:async()=>{saved.push(1);},saveRenewal:async()=>{throw Error('not needed');}}}};};
test('worker persists bounded page cursor and acknowledges incomplete job for later claim',async()=>{const h=setup();const result=await run(job,scope,h.deps);assert.equal(result.complete,false);assert.deepEqual(h.finished,[{complete:false,revision:'next',error:null}]);assert.equal(h.saved.length,1);});
test('lease loss or wrong seed prevents writes and cannot report completion without durable acknowledgement',async()=>{
 for(const kind of ['lease','seed','ack']){const h=setup();if(kind==='lease')h.deps.leaseIsCurrent=async()=>false;if(kind==='seed')h.deps.readSeed=async()=>({...seed,transactionId:'other'});if(kind==='ack')h.deps.finish=async()=>false;
 if(kind==='ack')await assert.rejects(()=>run(job,scope,h.deps),/acknowledgement/);else{assert.equal((await run(job,scope,h.deps)).retryRequested,true);assert.equal(h.saved.length,0);assert.equal(h.finished[0].error,'read_unavailable');}}
});
test('deadline discards late reads and cancellation records no completed cursor',async()=>{
 const h=setup();let resolve;h.deps.apple.history=()=>new Promise(r=>{resolve=r;});assert.equal((await run(job,scope,h.deps,undefined,5)).retryRequested,true);resolve({environment:'Sandbox',bundleId:scope.bundleId,hasMore:false,signedTransactions:['signed']});await new Promise(r=>setTimeout(r,5));assert.equal(h.saved.length,0);assert.equal(h.finished.length,1);
 const c=new AbortController();c.abort();const cancelled=setup();assert.equal((await run(job,scope,cancelled.deps,c.signal)).retryRequested,false);assert.equal(cancelled.finished[0].error,'cancelled');
 await assert.rejects(()=>run({...job,leaseUntil:new Date().toISOString()},scope,setup().deps),/Invalid/);
});

test('claim decoder keeps fixed service scope and refuses missing or caller-selected environment/cursor',()=>{
 assert.deepEqual(parse({...job,privateField:'must not return'},'Sandbox'),job);
 for(const value of [null,[],{}, {...job,environment:'Production'},{...job,revision:undefined},{...job,revision:4},{...job,leaseToken:null}])assert.throws(()=>parse(value,'Sandbox'),/Invalid/);
});
