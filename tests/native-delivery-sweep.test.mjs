import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const cache=new Map();function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(compile(name))}`);const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}
const {runStoredNativeDeliverySweep:run}=await import(compile('native-delivery-sweep'));
const {nativeDeliveryService:service}=await import(compile('native-delivery-service'));
const id=i=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,lease=id(998),cycle=id(999);
function fixture({cleanup=0,ack=true,current=true}={}){let cursor=null,sends=0,claimed=0,finished=false;const calls=[];const rows=Array.from({length:151},(_,i)=>id(i+1));const scope={push:'Production',purchase:'Sandbox'};
 const db={rpc:async(name,args)=>{calls.push(name);if(name==='prune_maintenance_native_delivery_identities')return {data:cleanup};assert.equal(args.target_push_environment,'Production');assert.equal(args.target_purchase_environment,'Sandbox');if(name==='claim_maintenance_native_delivery_sweep'){claimed++;return {data:finished?null:{lease,cycle,cursor}};}if(name==='maintenance_native_delivery_sweep_current')return {data:current};if(name==='checkpoint_maintenance_native_delivery_sweep'){assert.equal(args.expected_cursor,cursor);cursor=args.next_cursor;finished=args.result_status==='complete';return {data:ack};}throw Error(name);}};
 const batch={page:async(after,limit)=>rows.filter(x=>!after||x>after).slice(0,limit),enqueue:async id=>id,run:async()=>{sends++;return {status:'recorded',outcome:'accepted'};}};
 return {db,batch,scope,calls,sends:()=>sends,claimed:()=>claimed};}
test('durable sweep resumes beyond 100 destinations and honors independent frozen deployment scopes',async()=>{
 const f=fixture();const first=await run(f.db,f.db,f.scope,f.batch);assert.equal(first.status,'partial');assert.equal(first.visited,100);assert.equal(first.cursor,id(100));const second=await run(f.db,f.db,f.scope,f.batch);assert.equal(second.status,'complete');assert.equal(second.visited,51);assert.equal(f.sends(),151);assert.equal((await run(f.db,f.db,f.scope,f.batch)).status,'idle');
});
test('cleanup failure, changed lease, checkpoint ack loss and pre-cancellation are unconfirmed or cancelled',async()=>{
 for(const options of [{cleanup:null},{cleanup:501},{current:false}]){const f=fixture(options);assert.equal((await run(f.db,f.db,f.scope,f.batch)).status,'unconfirmed');assert.equal(f.sends(),0);}
 const f=fixture({ack:false});assert.equal((await run(f.db,f.db,f.scope,f.batch)).status,'unconfirmed');await run(f.db,f.db,f.scope,f.batch);assert.equal(f.sends(),151,'lost checkpoint acknowledgement does not reset saved cursor');
 const backlog=fixture({cleanup:500});assert.equal((await run(backlog.db,backlog.db,backlog.scope,backlog.batch)).cleanupBacklog,true);
 const cancelled=fixture(),controller=new AbortController();controller.abort();assert.equal((await run(cancelled.db,cancelled.db,cancelled.scope,cancelled.batch,controller.signal)).status,'cancelled');assert.equal(cancelled.calls.length,0);
});
test('execution cancellation does not cancel the independent checkpoint transport',async()=>{
 const f=fixture(),controller=new AbortController();const batch={...f.batch,run:async()=>{controller.abort();return {status:'unconfirmed',outcome:'accepted'};}};const result=await run(f.db,f.db,f.scope,batch,controller.signal);assert.equal(result.status,'cancelled');assert.equal(result.cursor,id(1));assert.equal(f.calls.at(-1),'checkpoint_maintenance_native_delivery_sweep');
});
test('cron authentication and disabled/query/cancel guards construct no dispatch, backlog asks for retry',async()=>{
 const secret='synthetic-cron-secret-only';let calls=0;const dispatch=async()=>{calls++;return {status:'complete',cleanupBacklog:true};};
 const request=(path='',auth='Bearer '+secret,signal)=>new Request('https://example.test/api/cron/native-reminders'+path,{headers:{authorization:auth},signal});
 assert.equal((await service(request('', 'wrong'),secret,true,dispatch)).status,401);assert.equal((await service(request(),secret,false,dispatch)).status,503);assert.equal((await service(request('?scope=Production'),secret,true,dispatch)).status,400);assert.equal(calls,0);
 const controller=new AbortController();controller.abort();assert.equal((await service(request('',undefined,controller.signal),secret,true,dispatch)).status,503);assert.equal(calls,0);
 const response=await service(request(),secret,true,dispatch);assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,1);
});
