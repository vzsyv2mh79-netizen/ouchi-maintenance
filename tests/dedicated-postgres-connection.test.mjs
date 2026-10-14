import test from 'node:test';
import assert from 'node:assert/strict';
import {createDedicatedPostgresConnection} from '../lib/dedicated-postgres-connection.mjs';
function driver(){let ends=0;const listeners=new Map();return {client:{connect:async()=>{},query:async()=>({rows:[]}),end:async()=>{ends++;},on:(event,listener)=>listeners.set(event,listener)},ends:()=>ends,listeners};}
test('fresh private driver preserves bounds and disconnects once without client reuse',async()=>{
 const d=driver();const connect=createDedicatedPostgresConnection({createClient:bounds=>{assert.deepEqual(bounds,{connectionTimeoutMillis:3000,query_timeout:5000});return d.client;}});
 const connection=await connect({signal:new AbortController().signal});assert.deepEqual(await connection.query('SELECT 1'),{rows:[]});
 connection.abort();await connection.close();await connection.close();assert.equal(d.ends(),1);
 await assert.rejects(()=>connection.query('SELECT 1'),/unavailable/);await assert.rejects(()=>connect({signal:new AbortController().signal}),/Fresh dedicated/);
});
test('cancelled connect closes the same late driver and never delivers it',async()=>{
 const d=driver(),controller=new AbortController();let entered,release;
 const started=new Promise(resolve=>{entered=resolve;});d.client.connect=()=>{entered();return new Promise(resolve=>{release=resolve;});};
 const operation=createDedicatedPostgresConnection({createClient:()=>d.client})({signal:controller.signal});
 await started;controller.abort();await assert.rejects(operation);assert.equal(d.ends(),1);release();
});
test('abort interrupts an in-flight query and idle driver errors prevent reuse',async()=>{
 const d=driver(),controller=new AbortController();let entered,release;
 const started=new Promise(resolve=>{entered=resolve;});d.client.query=()=>{entered();return new Promise(resolve=>{release=resolve;});};
 const connection=await createDedicatedPostgresConnection({createClient:()=>d.client})({signal:controller.signal});
 const query=connection.query('SELECT pg_sleep(10)');await started;controller.abort();await assert.rejects(query);await connection.close();assert.equal(d.ends(),1);release({rows:[]});
 const second=driver(),other=await createDedicatedPostgresConnection({createClient:()=>second.client})({signal:new AbortController().signal});
 second.listeners.get('error')();await assert.rejects(()=>other.query('SELECT 1'),/unavailable/);await other.close();assert.equal(second.ends(),1);
});
test('a driver that never acknowledges shutdown cannot hold the request indefinitely',async()=>{
 const d=driver();d.client.end=()=>new Promise(()=>{});
 const connection=await createDedicatedPostgresConnection({createClient:()=>d.client})({signal:new AbortController().signal});
 const keepAlive=setTimeout(()=>{},2000);
 try{await assert.rejects(()=>connection.close(),error=>error.name==='TimeoutError');}
 finally{clearTimeout(keepAlive);}
 await assert.rejects(()=>connection.query('SELECT 1'),/unavailable/);
});
test('an error emitted synchronously during shutdown cannot recursively end the client',async()=>{
 const d=driver();let calls=0;
 d.client.end=()=>{calls++;d.listeners.get('error')();return Promise.resolve();};
 const connection=await createDedicatedPostgresConnection({createClient:()=>d.client})({signal:new AbortController().signal});
 await connection.close();assert.equal(calls,1);
});
