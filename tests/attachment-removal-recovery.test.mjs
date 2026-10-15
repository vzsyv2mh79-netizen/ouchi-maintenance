import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,target)=>`from ${JSON.stringify(compile(target))}`);const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}
const {pendingAttachmentRemovalStore}=await import(compile('pending-attachment-store'));
const {sendPendingAttachmentRemoval}=await import(compile('attachment-removal-flow'));
const {AttachmentScopeChanged}=await import(compile('attachment-upload-flow'));
const scope={account:'11111111-1111-4111-8111-111111111111',epoch:'22222222-2222-4222-8222-222222222222'},product='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666';
function fixture(){
 const rows=new Map();const driver={read:async key=>rows.get(key),revision:async()=>0,stage:async(key,item)=>{if(!rows.has(key))rows.set(key,structuredClone(item));return rows.get(key);},complete:async(key,id)=>{if(rows.has(key)&&rows.get(key).id!==id)throw Error('Different receipt');rows.delete(key);},reset:async account=>{for(const key of rows.keys())if(key.startsWith(account+'/'))rows.delete(key);},resetAll:async()=>rows.clear()};
 return {rows,driver,store:pendingAttachmentRemovalStore(driver)};
}
test('removal reference reopens with exact original account/epoch/product/id and never stores file bytes or a permission flag',async()=>{
 const f=fixture();const saved=await f.store.stage({...scope,product,id});
 assert.deepEqual(Object.keys(saved).sort(),['account','epoch','id','kind','product','version']);
 const reopened=pendingAttachmentRemovalStore(f.driver);assert.deepEqual(await reopened.read(scope.account,scope.epoch),saved);
 assert.equal(await reopened.read(other,scope.epoch),null);assert.equal(await reopened.read(scope.account,other),null);
 await f.store.stage({...scope,product,id});assert.equal(f.rows.size,1);
});
test('competing tabs cannot replace an uncertain deletion; exact completion preserves pending upload bytes and other accounts',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.store.stage({...scope,product,id}),f.store.stage({...scope,product,id:other})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const saved=await f.store.read(scope.account,scope.epoch);await assert.rejects(f.store.stage({...scope,product:other,id:saved.id}));
 await assert.rejects(f.store.complete(scope.account,scope.epoch,saved.id===id?other:id));
 const uploadKey=scope.account+'/'+scope.epoch;f.rows.set(uploadKey,{id,blob:'synthetic existing pending upload'});
 await f.store.stage({...scope,account:other,product,id});await f.store.complete(scope.account,scope.epoch,saved.id);
 assert.equal(await f.store.read(scope.account,scope.epoch),null);assert.equal(f.rows.get(uploadKey).blob,'synthetic existing pending upload');assert.equal((await f.store.read(other,scope.epoch)).id,id);
 await f.driver.reset(other,true);assert.equal(await f.store.read(other,scope.epoch),null);
});
test('corrupt, foreign or extra private fields cannot be interpreted as a removal receipt',async()=>{
 const f=fixture();const saved=await f.store.stage({...scope,product,id}),key=scope.account+'/'+scope.epoch+'/removal';
 for(const changed of [{...saved,kind:'upload'},{...saved,account:other},{...saved,blob:'private bytes'},{...saved,id:'invalid'}]){f.rows.set(key,changed);await assert.rejects(f.store.read(scope.account,scope.epoch));}
});
function flowFixture(options={}){
 const pending={version:1,kind:'removal',...scope,product,id},calls=[],sent=[];let reads=0;
 const deps={read:async()=>{calls.push('read');return options.missing?null:pending;},binding:async()=>{calls.push('binding');return ++reads===options.changedAt?{...scope,epoch:other}:scope;},remove:async(target,epoch,confirmed)=>{calls.push('remove');sent.push({target,epoch,confirmed});options.controller?.abort();if(options.lostFirst&&sent.length===1)throw Error('Acknowledgement lost');},complete:async(account,epoch,target)=>{calls.push('complete');assert.deepEqual({account,epoch},scope);assert.equal(target,id);}};
 return {calls,sent,deps};
}
test('lost acknowledgement retains receipt and retry uses the same immutable attachment, even without a current product',async()=>{
 const f=flowFixture({lostFirst:true});await assert.rejects(sendPendingAttachmentRemoval(scope,id,'synthetic',new AbortController().signal,f.deps),/lost/);assert.equal(f.calls.includes('complete'),false);
 await sendPendingAttachmentRemoval(scope,id,'synthetic',new AbortController().signal,f.deps);
 assert.deepEqual(f.sent,[{target:id,epoch:scope.epoch,confirmed:true},{target:id,epoch:scope.epoch,confirmed:true}]);assert.equal(f.calls.filter(x=>x==='complete').length,1);
});
test('missing/wrong reference and changed enrollment refuse a new target or completion under another registration',async()=>{
 for(const changedAt of [1,2]){const f=flowFixture({changedAt});await assert.rejects(sendPendingAttachmentRemoval(scope,id,'synthetic',new AbortController().signal,f.deps),e=>e instanceof AttachmentScopeChanged);assert.equal(f.sent.length,changedAt===1?0:1);assert.equal(f.calls.includes('complete'),false);}
 for(const missing of [true,false]){const f=flowFixture({missing});await assert.rejects(sendPendingAttachmentRemoval(scope,missing?id:other,'synthetic',new AbortController().signal,f.deps));assert.deepEqual(f.calls,['read']);}
});
test('cancellation before or during deletion retains the uncertain reference',async()=>{
 const before=new AbortController();before.abort();const f=flowFixture();await assert.rejects(sendPendingAttachmentRemoval(scope,id,'synthetic',before.signal,f.deps));assert.deepEqual(f.calls,[]);
 const during=new AbortController(),g=flowFixture({controller:during});await assert.rejects(sendPendingAttachmentRemoval(scope,id,'synthetic',during.signal,g.deps));assert.equal(g.calls.includes('complete'),false);
});
