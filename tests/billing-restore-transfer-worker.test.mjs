import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/billing-restore-transfer-worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {runRestoreTransfer:run}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const id=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const now=1791766800000;
const job={id:id(1),lease:id(2),userID:id(3),sessionID:id(4),epochID:id(5),previousAccountToken:id(6),originalTransactionID:'1000001',appTransactionID:'2000001',environment:'Sandbox',bundleID:'dev.synthetic.ouchi',authorizedAt:now-1000,phase:'authorized'};
const proof=(token=job.previousAccountToken,changes={})=>({signedTransaction:'synthetic-verified-current-proof',appTransactionID:job.appTransactionID,transaction:{transactionId:'1000002',originalTransactionId:job.originalTransactionID,productId:'ouchi.premium.monthly',accountToken:token,environment:'Sandbox',signedAt:now,purchasedAt:now-10000,expiresAt:now+100000,...changes}});
function fixture(){
 const state={job:{...job},events:[],reads:[proof(),proof(job.epochID)],current:true,complete:true};
 const deps={now:()=>now,store:{
  leaseIsCurrent:async()=>{state.events.push('scope');return state.current;},
  markUpdateStarted:async j=>{state.events.push('durable-start');state.job={...j,phase:'update_started',mutationStartedAt:now};return state.job;},
  complete:async(j,p)=>{state.events.push('commit');assert.equal(p.transaction.accountToken,j.epochID);return state.complete;}
 },readCurrent:async()=>{state.events.push('read');const p=state.reads.shift();if(p instanceof Error)throw p;return p;},setToken:async j=>{state.events.push('PUT');assert.equal(state.job.phase,'update_started');assert.equal(j.originalTransactionID,job.originalTransactionID);}};
 return {state,deps};
}
test('durable unknown marker precedes PUT; fresh new-token proof precedes atomic completion',async()=>{
 const {state,deps}=fixture();assert.deepEqual(await run(job,deps),{state:'complete'});
 assert.ok(state.events.indexOf('durable-start')<state.events.indexOf('PUT'));
 assert.equal(state.events.filter(x=>x==='read').length,2);assert.equal(state.events.at(-1),'commit');
});
test('lost PUT acknowledgement remains unknown; restart reads result without another PUT',async()=>{
 const {state,deps}=fixture();deps.setToken=async()=>{state.events.push('PUT');throw Error('lost response');};
 assert.equal((await run(job,deps)).state,'pending');assert.equal(state.job.phase,'update_started');
 state.reads=[proof(job.epochID)];assert.deepEqual(await run(state.job,deps),{state:'complete'});
 assert.equal(state.events.filter(x=>x==='PUT').length,1);
});
test('unknown outcome with old token never retries PUT or declares completion',async()=>{
 const {state,deps}=fixture();state.job={...job,phase:'update_started',mutationStartedAt:now-500};
 assert.deepEqual(await run(state.job,deps),{state:'pending',reason:'readback'});
 assert.ok(!state.events.includes('PUT'));assert.ok(!state.events.includes('commit'));
});
test('HTTP success is insufficient; mismatched readback stays pending',async()=>{
 for(const changed of [{accountToken:id(7)},{environment:'Production'},{originalTransactionId:'9999'},{productId:'ouchi.tip.small'},{expiresAt:now},{revokedAt:now},{isUpgraded:true},{signedAt:now-2000}]){
  const {state,deps}=fixture();state.reads=[proof(),proof(job.epochID,changed)];
  assert.deepEqual(await run(job,deps),{state:'pending',reason:'readback'});assert.ok(!state.events.includes('commit'));
 }
});
test('fresh preflight refuses foreign previous token, revoked/expired/old proof and Apple account mismatch before mutation',async()=>{
 for(const changed of [{accountToken:id(7)},{revokedAt:0},{expiresAt:now},{signedAt:now-2000},{signedAt:now+60001},{purchasedAt:now+1},{productId:'ouchi.tip.small'}]){
  const {state,deps}=fixture();state.reads=[proof(job.previousAccountToken,changed)];
  assert.equal((await run(job,deps)).reason,'readback');assert.ok(!state.events.includes('PUT'));assert.ok(!state.events.includes('durable-start'));
 }
 for(const changed of [{appTransactionID:'9999'},{signedTransaction:''}]){
  const {state,deps}=fixture();state.reads=[{...proof(),...changed}];assert.equal((await run(job,deps)).reason,'readback');assert.ok(!state.events.includes('PUT'));
 }
});
test('live scope loss, durable-write failure and changed marker refuse Apple mutation',async()=>{
 const a=fixture();a.state.current=false;assert.equal((await run(job,a.deps)).reason,'scope');assert.ok(!a.state.events.includes('read'));
 const b=fixture();b.deps.store.markUpdateStarted=async()=>{throw Error('store unavailable');};assert.equal((await run(job,b.deps)).reason,'unavailable');assert.ok(!b.state.events.includes('PUT'));
 const c=fixture();c.deps.store.markUpdateStarted=async j=>({...j,epochID:id(7),phase:'update_started',mutationStartedAt:now});assert.equal((await run(job,c.deps)).reason,'scope');assert.ok(!c.state.events.includes('PUT'));
 const d=fixture();d.deps.store.markUpdateStarted=async j=>{d.state.current=false;return {...j,phase:'update_started',mutationStartedAt:now};};assert.equal((await run(job,d.deps)).reason,'scope');assert.ok(!d.state.events.includes('PUT'));
});
test('commit loss never reports success; new-token retry performs readback without another update',async()=>{
 const {state,deps}=fixture();state.complete=false;assert.equal((await run(job,deps)).reason,'commit');
 state.complete=true;state.reads=[proof(job.epochID)];assert.deepEqual(await run(state.job,deps),{state:'complete'});
 assert.equal(state.events.filter(x=>x==='PUT').length,1);
});
test('cancellation before and after mutation cannot authorize completion',async()=>{
 const a=fixture(),before=new AbortController();before.abort();assert.equal((await run(job,a.deps,before.signal)).reason,'cancelled');assert.equal(a.state.events.length,0);
 const b=fixture(),after=new AbortController();b.deps.setToken=async()=>{b.state.events.push('PUT');after.abort();};assert.equal((await run(job,b.deps,after.signal)).reason,'cancelled');assert.ok(!b.state.events.includes('commit'));assert.equal(b.state.job.phase,'update_started');
});
test('Production and malformed service jobs fail before any dependency is invoked',async()=>{
 for(const changed of [{environment:'Production'},{epochID:job.userID},{previousAccountToken:job.epochID},{originalTransactionID:'../x'},{phase:'complete'},{phase:'update_started'}]){
  const {state,deps}=fixture();await assert.rejects(run({...job,...changed},deps));assert.equal(state.events.length,0);
 }
});
