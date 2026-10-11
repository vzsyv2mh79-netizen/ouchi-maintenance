import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/native-push-batch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {runNativePushBatch:run}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
test('batch failures preserve the last completed cursor without immediately retrying an uncertain send',async()=>{
 const previous=id(10);let enqueues=0,runs=0;
 const base={page:async()=>[id(11),id(12)],enqueue:async registration=>{enqueues++;return registration;},run:async()=>{runs++;return {status:'recorded',outcome:'accepted'};}};
 const pageFailure=await run({...base,page:async()=>{throw Error('connection lost');}},undefined,previous);
 assert.deepEqual(pageFailure,{status:'unconfirmed',cursor:previous,visited:0,accepted:0,unconfirmed:0});assert.equal(enqueues,0);assert.equal(runs,0);
 const enqueueFailure=await run({...base,enqueue:async registration=>{if(registration===id(12))throw Error('enqueue acknowledgement lost');return registration;}},undefined,previous);
 assert.deepEqual(enqueueFailure,{status:'unconfirmed',cursor:id(11),visited:1,accepted:1,unconfirmed:0});assert.equal(runs,1);
 runs=0;
 const sendFailure=await run({...base,run:async()=>{runs++;throw Error('receipt acknowledgement lost');}},undefined,previous);
 assert.deepEqual(sendFailure,{status:'unconfirmed',cursor:previous,visited:0,accepted:0,unconfirmed:1});assert.equal(runs,1);
});
test('batch bounds execution, preserves uncertain outcomes and never retries a job within the run',async()=>{
 let pages=0,sends=0;const jobs=[];
 const result=await run({page:async(cursor,limit)=>{assert.equal(limit,25);assert.equal(cursor,pages===0?null:id(pages*25));pages++;return Array.from({length:25},(_,i)=>id((pages-1)*25+i+1));},enqueue:async registration=>registration,run:async job=>{jobs.push(job);sends++;return sends===1?{status:'unconfirmed',outcome:'accepted'}:{status:'recorded',outcome:'accepted'};}});
 assert.deepEqual(result,{status:'partial',cursor:id(100),visited:100,accepted:99,unconfirmed:1});assert.equal(new Set(jobs).size,100);
});
test('batch rejects repeated pages and preserves cursor when cancelled after enqueue',async()=>{
 const controller=new AbortController();let called=0;
 const deps={page:async()=>[id(1)],enqueue:async()=>{controller.abort();return id(2);},run:async()=>{called++;return {status:'recorded'};}};
 assert.deepEqual(await run(deps,controller.signal),{status:'cancelled',cursor:null,visited:0,accepted:0,unconfirmed:0});assert.equal(called,0);
 const invalid=await run({...deps,page:async()=>[id(1),id(1)]});assert.equal(invalid.status,'unconfirmed');assert.equal(invalid.visited,0);
 const resumed=await run({page:async cursor=>{assert.equal(cursor,id(100));return [id(101)];},enqueue:async()=>null,run:async()=>assert.fail('no job')},undefined,id(100));
 assert.equal(resumed.cursor,id(101));assert.equal(resumed.status,'complete');
});
