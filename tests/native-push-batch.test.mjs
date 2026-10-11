import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/native-push-batch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {runNativePushBatch:run}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
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
