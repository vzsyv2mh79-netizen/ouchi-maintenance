import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptTransactions} from '../lib/deletion-receipt-transactions.mjs';

test('invalid acquired provider is closed before any receipt SQL',async()=>{
 const calls=[];
 const transaction=createReceiptTransactions({connect:async()=>({
  query:async()=>{calls.push('query');},close:async()=>{calls.push('close');},
 })});
 await assert.rejects(transaction(async()=>{calls.push('callback');},{signal:new AbortController().signal,readOnly:false}),/Cancellable dedicated connection required/);
 assert.deepEqual(calls,['close']);
});

test('invalid provider shutdown still closes when abort throws',async()=>{
 const calls=[];
 const transaction=createReceiptTransactions({connect:async()=>({
  abort:()=>{calls.push('abort');throw Error('Shutdown failed');},
  close:async()=>{calls.push('close');},
 })});
 await assert.rejects(transaction(async()=>{calls.push('callback');},{signal:new AbortController().signal,readOnly:false}),/Shutdown failed/);
 assert.deepEqual(calls,['abort','close']);
});

test('abort during callback rejects transaction, closes and never commits even if abort throws',async()=>{
 const calls=[],controller=new AbortController();let entered,finish;
 const ready=new Promise(resolve=>{entered=resolve;});
 const transaction=createReceiptTransactions({connect:async()=>({
  query:async sql=>{calls.push(sql);return {rows:[]};},
  abort:()=>{calls.push('abort');throw Error('Shutdown failed');},
  close:async()=>{calls.push('close');},
 })});
 const pending=transaction(async()=>{entered();await new Promise(resolve=>{finish=resolve;});return 'not committed';},{signal:controller.signal,readOnly:false});
 await ready;controller.abort();finish();await assert.rejects(pending,/abort/i);
 assert.equal(calls.includes('COMMIT'),false);assert.equal(calls.includes('ROLLBACK'),false);
 assert.equal(calls.at(-1),'close');assert.equal(calls.filter(x=>x==='abort').length,1);
});

test('failed rollback shutdown cannot replace original operation error',async()=>{
 const calls=[];
 const original=Error('Receipt operation failed');
 const transaction=createReceiptTransactions({connect:async()=>({
  query:async sql=>{calls.push(sql);if(sql==='ROLLBACK')throw Error('Rollback failed');return {rows:[]};},
  abort:()=>{calls.push('abort');throw Error('Shutdown failed');},
  close:async()=>{calls.push('close');},
 })});
 await assert.rejects(transaction(async()=>{throw original;},{signal:new AbortController().signal,readOnly:false}),error=>error===original);
 assert.deepEqual(calls.slice(-3),['ROLLBACK','abort','close']);assert.equal(calls.includes('COMMIT'),false);
});

test('cancellation during acquisition closes the returned connection without starting SQL',async()=>{
 const calls=[],controller=new AbortController();
 const transaction=createReceiptTransactions({connect:async()=>{
  controller.abort();
  return {query:async()=>{calls.push('query');},abort:()=>{calls.push('abort');},close:async()=>{calls.push('close');}};
 }});
 await assert.rejects(transaction(async()=>{calls.push('callback');},{signal:controller.signal,readOnly:true}),/abort/i);
 assert.deepEqual(calls,['abort','close']);
});

test('throwing abort falls back to transport close while a SQL operation is pending',async()=>{
 const calls=[],controller=new AbortController();let rejectQuery,entered;
 const ready=new Promise(resolve=>{entered=resolve;});
 const transaction=createReceiptTransactions({connect:async()=>({
  query:async sql=>{
   calls.push(sql);
   if(sql==='SELECT pending'){
    entered();return new Promise((resolve,reject)=>{rejectQuery=reject;});
   }
   return {rows:[]};
  },
  abort:()=>{calls.push('abort');throw Error('Shutdown failed');},
  close:async()=>{calls.push('close');rejectQuery(Error('Transport closed'));},
 })});
 const pending=transaction(async tx=>tx.query('SELECT pending'),{signal:controller.signal,readOnly:true});
 await ready;controller.abort();await assert.rejects(pending,/Transport closed/);
 assert.equal(calls.filter(x=>x==='close').length,1);
 assert.equal(calls.includes('COMMIT'),false);assert.equal(calls.includes('ROLLBACK'),false);
});

test('unawaited SQL interrupts transport instead of queuing COMMIT or ROLLBACK behind it',async()=>{
 const calls=[];let rejectQuery,leaked;
 const transaction=createReceiptTransactions({connect:async()=>({
  query:async sql=>{calls.push(sql);if(sql==='SELECT pending')return new Promise((resolve,reject)=>{rejectQuery=reject;});return {rows:[]};},
  abort:()=>{calls.push('abort');rejectQuery(Error('Transport interrupted'));},
  close:async()=>{calls.push('close');},
 })});
 await assert.rejects(transaction(async tx=>{leaked=tx.query('SELECT pending').catch(error=>error);return 'not committed';},{signal:new AbortController().signal,readOnly:false}),/Concurrent receipt SQL/);
 assert.match((await leaked).message,/interrupted/);assert.equal(calls.includes('COMMIT'),false);assert.equal(calls.includes('ROLLBACK'),false);assert.deepEqual(calls.slice(-2),['abort','close']);
});
