import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const js=ts.transpileModule(readFileSync('lib/native-push-batch-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {storedNativePushBatch:store}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('batch adapter uses service RPCs and refuses missing or malformed acknowledgements',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls=[];let result={data:[id],error:null};
 const run=async()=>({status:'unclaimed'}),deps=store({rpc:async(name,args)=>{calls.push([name,args]);return result;}},run);
 assert.deepEqual(await deps.page(null,25),[id]);assert.deepEqual(calls[0],['page_maintenance_native_sandbox_devices',{after_id:null,batch_size:25}]);assert.equal(deps.run,run);
 result={data:id,error:null};assert.equal(await deps.enqueue(id),id);
 result={data:null,error:null};assert.equal(await deps.enqueue(id),null);await assert.rejects(()=>deps.page(null,25));
 result={data:[{token:'synthetic'}],error:null};await assert.rejects(()=>deps.page(null,25));
 result={data:true,error:null};await assert.rejects(()=>deps.enqueue(id));
 result={data:null,error:{message:'synthetic'}};await assert.rejects(()=>deps.page(null,25));await assert.rejects(()=>deps.enqueue(id));
});
