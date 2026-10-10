import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-read-deadline.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {boundedBillingRead:read}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('read deadline rejects a stalled read and ignores late success without exposing provider errors',async()=>{
 let finish;const underlying=new Promise(resolve=>{finish=resolve;});await assert.rejects(()=>read(()=>underlying,undefined,5),/deadline/);finish('late');
 assert.equal(await read(async()=>42,undefined,20),42);
 await assert.rejects(()=>read(async()=>{throw Error('private provider detail');},undefined,20),/^Error: Billing read unavailable$/);
 await assert.rejects(()=>read(async()=>42,undefined,0),/Invalid/);
});
test('cancellation rejects during a pending read and never starts already-cancelled work',async()=>{
 const controller=new AbortController();let calls=0;controller.abort();await assert.rejects(()=>read(async()=>{calls++;},controller.signal),/cancelled/);assert.equal(calls,0);
 const active=new AbortController();const pending=read(()=>new Promise(()=>{}),active.signal);active.abort();await assert.rejects(()=>pending,/cancelled/);
});
