import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithTransactionCommitChecks as run} from '../lib/transaction-commit-checks.mjs';

test('same-connection checks run after writes and query capability closes before return',async()=>{
 const calls=[];let retained;
 const result=await run({query:async sql=>{calls.push(sql);return {rows:[]};}},new AbortController().signal,async tx=>{
  retained=tx;await tx.query('write');tx.beforeCommit('scope',async()=>{await tx.query('verify');return true;});return 'prepared';
 });
 assert.equal(result,'prepared');assert.deepEqual(calls,['write','verify']);
 await assert.rejects(retained.query('late write'),/closed/);
 assert.throws(()=>retained.beforeCommit('late',async()=>true),/closed/);
});
test('false and thrown verification reject the callback result',async()=>{
 for(const verify of [async()=>false,async()=>{throw Error('authority lost');}]){
  await assert.rejects(run({query:async()=>({rows:[]})},new AbortController().signal,tx=>{tx.beforeCommit('scope',verify);return 'success';}));
 }
});
test('repeated scope registration cannot replace the first verification',async()=>{
 let first=0,second=0;
 await assert.rejects(run({query:async()=>({rows:[]})},new AbortController().signal,tx=>{
  tx.beforeCommit('scope',async()=>{first++;return false;});
  tx.beforeCommit('scope',async()=>{second++;return true;});
 }),{code:'CURRENT_TRANSACTION_VERIFICATION_REQUIRED'});
 assert.equal(first,1);assert.equal(second,0);
});
test('unawaited SQL prevents completion even if the callback claims success',async()=>{
 let resolve;
 const pending=new Promise(done=>{resolve=done;});
 await assert.rejects(run({query:()=>pending},new AbortController().signal,tx=>{void tx.query('write');return true;}),/Unfinished/);
 resolve({rows:[]});
});
test('checking phase cannot register additional checks',async()=>{
 await assert.rejects(run({query:async()=>({rows:[]})},new AbortController().signal,tx=>{
  tx.beforeCommit('scope',async()=>{tx.beforeCommit('replacement',async()=>true);return true;});
 }),/registration is closed/);
});
test('cancellation interrupts a stalled check and seals subsequent SQL',async()=>{
 const controller=new AbortController();let retained,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const result=run({query:async()=>({rows:[]})},controller.signal,tx=>{
  retained=tx;tx.beforeCommit('scope',async()=>{started();return new Promise(()=>{});});
 });
 await ready;controller.abort();await assert.rejects(result,{name:'AbortError'});
 await assert.rejects(retained.query('late write'),/closed/);
});
