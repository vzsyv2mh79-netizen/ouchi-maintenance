import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync('lib/account-deletion-worker.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {runAccountDeletion:run}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const scope={requestID:'11111111-1111-4111-8111-111111111111',userID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',leaseToken:'44444444-4444-4444-8444-444444444444'};
const names=['revokeAndCaptureInventory','eraseDeviceRegistrations','eraseAttachments','eraseRecords','finalizeIdentityAndRetention','markComplete'];
test('deletion never completes or continues beyond unconfirmed durable work',async()=>{
 for(let fail=0;fail<names.length;fail++)for(const mode of ['false','throw']){
  const calls=[];const deps={leaseCurrent:async()=>true};names.forEach((n,i)=>deps[n]=async s=>{assert.deepEqual(s,scope);assert.ok(Object.isFrozen(s));calls.push(n);if(i===fail){if(mode==='throw')throw Error('outage');return false;}return true;});
  assert.deepEqual(await run(scope,deps),{state:'pending'});assert.deepEqual(calls,names.slice(0,fail+1));
 }
});
test('lost lease or cancellation prevents subsequent deletion; only acknowledged completion succeeds',async()=>{
 for(const cancel of [false,true]){const controller=new AbortController(),calls=[];let checks=0;const deps={leaseCurrent:async()=>++checks===1};names.forEach(n=>deps[n]=async()=>{calls.push(n);if(cancel)controller.abort();return true;});assert.deepEqual(await run(scope,deps,controller.signal),{state:'pending'});assert.deepEqual(calls,[names[0]]);}
 const deps={leaseCurrent:async()=>true};names.forEach(n=>deps[n]=async()=>true);assert.deepEqual(await run(scope,deps),{state:'complete'});
 await assert.rejects(()=>run({...scope,userID:'invalid'},deps));
});
test('cancellation during every awaited stage, including final completion, requires status recovery',async()=>{
 for(let stop=0;stop<names.length;stop++){
  const controller=new AbortController(),calls=[],deps={leaseCurrent:async()=>true};
  names.forEach((name,index)=>deps[name]=async()=>{calls.push(name);if(index===stop)controller.abort();return true;});
  assert.deepEqual(await run(scope,deps,controller.signal),{state:'pending'});
  assert.deepEqual(calls,names.slice(0,stop+1));
 }
 // A committed final stage may need a fresh status query after cancellation;
 // cancellation is not evidence that durable server completion rolled back.
});
