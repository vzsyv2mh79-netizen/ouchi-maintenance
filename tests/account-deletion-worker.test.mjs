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

test('incomplete adapter does not begin any durable deletion stage',async()=>{
 for(const missing of ['leaseCurrent',...names]){
  const calls=[];const deps={leaseCurrent:async()=>{calls.push('lease');return true;}};
  names.forEach(name=>deps[name]=async()=>{calls.push(name);return true;});
  delete deps[missing];
  assert.deepEqual(await run(scope,deps),{state:'pending'});assert.deepEqual(calls,[]);
 }
 assert.deepEqual(await run(scope,null),{state:'pending'});
});

test('committed identity erasure resumes mandatory retention and completion after lost acknowledgement',async()=>{
 let erased=false;const calls=[];const deps={leaseCurrent:async()=>true,identityAlreadyErased:async()=>erased};
 names.forEach(name=>deps[name]=async()=>{calls.push(name);if(name==='finalizeIdentityAndRetention'&&!erased){erased=true;throw Error('committed but acknowledgement lost');}return true;});
 assert.deepEqual(await run(scope,deps),{state:'pending'});assert.equal(erased,true);
 calls.length=0;assert.deepEqual(await run(scope,deps),{state:'complete'});
 assert.deepEqual(calls,['finalizeIdentityAndRetention','markComplete']);
 // Durable identity absence does not acknowledge unfinished retention.
 calls.length=0;deps.finalizeIdentityAndRetention=async()=>{calls.push('retention');return false;};
 assert.deepEqual(await run(scope,deps),{state:'pending'});assert.deepEqual(calls,['retention']);
});
test('recovery lookup cannot bypass scope lease, cancellation or malformed acknowledgement',async()=>{
 for(const mode of ['lease','cancel','throw','malformed']){
  const controller=new AbortController();let writes=0;const deps={leaseCurrent:async()=>mode!=='lease',identityAlreadyErased:async fixed=>{assert.deepEqual(fixed,scope);if(mode==='cancel')controller.abort();if(mode==='throw')throw Error('unavailable');return mode==='malformed'?'true':true;}};
  names.forEach(name=>deps[name]=async()=>{writes++;return true;});
  assert.deepEqual(await run(scope,deps,controller.signal),{state:'pending'});assert.equal(writes,0);
 }
});
test('lost final acknowledgement recovers exact durable completion after execution lease is cleared',async()=>{
 let committed=false;const calls=[];
 const deps={leaseCurrent:async()=>!committed,completionAlreadyConfirmed:async fixed=>{assert.deepEqual(fixed,scope);return committed;}};
 names.forEach(name=>deps[name]=async()=>{calls.push(name);if(name==='markComplete'){committed=true;throw Error('final acknowledgement lost');}return true;});
 assert.deepEqual(await run(scope,deps),{state:'pending'});assert.equal(committed,true);
 calls.length=0;assert.deepEqual(await run(scope,deps),{state:'complete'});assert.deepEqual(calls,[]);
 const controller=new AbortController();deps.completionAlreadyConfirmed=async()=>{controller.abort();return true;};assert.deepEqual(await run(scope,deps,controller.signal),{state:'pending'});
 for(const value of [null,'true',1,{}]){deps.completionAlreadyConfirmed=async()=>value;assert.deepEqual(await run(scope,deps),{state:'pending'});}
 deps.completionAlreadyConfirmed=async()=>{throw Error('unavailable');};assert.deepEqual(await run(scope,deps),{state:'pending'});
});
test('reviewed prelude runs before ordinary lease recovery but only with complete mandatory tail configuration',async()=>{
 const calls=[];let prepared=false;const deps={prepareReviewedAttachments:async fixed=>{assert.deepEqual(fixed,scope);calls.push('prelude');prepared=true;return true;},leaseCurrent:async()=>{calls.push('lease');return prepared;}};names.forEach(name=>deps[name]=async()=>{calls.push(name);return true;});
 assert.deepEqual(await run(scope,deps),{state:'complete'});assert.equal(calls[0],'prelude');assert.equal(calls[1],'lease');
 for(const outcome of [false,null,'true',new Error('partial cleanup')]){calls.length=0;deps.prepareReviewedAttachments=async()=>{calls.push('prelude');if(outcome instanceof Error)throw outcome;return outcome;};assert.deepEqual(await run(scope,deps),{state:'pending'});assert.deepEqual(calls,['prelude']);}
 calls.length=0;deps.prepareReviewedAttachments=async()=>{calls.push('unsafe prelude');return true;};delete deps.markComplete;assert.deepEqual(await run(scope,deps),{state:'pending'});assert.deepEqual(calls,[]);
});
