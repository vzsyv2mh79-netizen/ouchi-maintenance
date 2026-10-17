import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/pending-attachment-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {pendingAttachmentStore}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const account='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',product='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666';
const file=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
function fixture(){const rows=new Map();const driver={resetAll:async()=>rows.clear(),revision:async()=>0,reset:async(account)=>{for(const key of rows.keys())if(key.startsWith(account+'/'))rows.delete(key);},read:async key=>rows.get(key),stage:async(key,item)=>{if(!rows.has(key))rows.set(key,item);return rows.get(key);},complete:async(key,target)=>{if(rows.has(key)&&rows.get(key).id!==target)throw Error('different receipt');rows.delete(key);}};return {rows,store:pendingAttachmentStore(driver)};}
const input=()=>({account,epoch,product,id,blob:file(),mime:'image/png'});
test('stable pending bytes and ID survive reopening the repository, scoped to account and epoch',async()=>{
 const f=fixture();await f.store.stage(input());const value=await f.store.read(account,epoch);assert.equal(value.id,id);assert.equal(value.product,product);assert.deepEqual(new Uint8Array(await value.blob.arrayBuffer()),new Uint8Array(await file().arrayBuffer()));
 assert.equal(await f.store.read(other,epoch),null);assert.equal(await f.store.read(account,other),null);
 await f.store.stage(input());assert.equal(f.rows.size,1);
});
test('competing tabs cannot replace an uncertain file with a different ID or product',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.store.stage(input()),f.store.stage({...input(),id:other})]);assert.equal(results.filter(value=>value.status==='fulfilled').length,1);assert.equal(results.filter(value=>value.status==='rejected').length,1);
 const saved=await f.store.read(account,epoch);assert.ok([id,other].includes(saved.id));
 await assert.rejects(f.store.stage({...input(),id:saved.id,product:other}));assert.equal((await f.store.read(account,epoch)).product,product);
});
test('completion clears only the acknowledged ID in the exact account/epoch',async()=>{
 const f=fixture();await f.store.stage(input());await assert.rejects(f.store.complete(account,epoch,other));assert.equal((await f.store.read(account,epoch)).id,id);
 await f.store.complete(other,epoch,id);assert.equal((await f.store.read(account,epoch)).id,id);
 await f.store.complete(account,epoch,id);await f.store.complete(account,epoch,id);assert.equal(await f.store.read(account,epoch),null);
});
test('corrupt, oversized and mismatched content cannot become a saved retry',async()=>{
 const f=fixture();for(const value of [{...input(),blob:new Blob([new Uint8Array(5242881)])},{...input(),blob:new Blob(['not a PNG'])},{...input(),mime:'text/html'},{...input(),account:epoch},{...input(),product:'bad'}])await assert.rejects(f.store.stage(value));assert.equal(f.rows.size,0);
 await f.store.stage(input());const key=`${account}/${epoch}`,original=f.rows.get(key);
 for(const patch of [{version:2},{account:other},{sha256:'0'.repeat(64)},{blob:new Blob(['damaged'])}]){f.rows.set(key,{...original,...patch});await assert.rejects(f.store.read(account,epoch));}
});
test('local storage commit failure prevents obtaining a sendable receipt',async()=>{
 const store=pendingAttachmentStore({resetAll:async()=>{},revision:async()=>0,reset:async()=>{},read:async()=>null,stage:async()=>{throw Error('quota or commit failure');},complete:async()=>{}});await assert.rejects(store.stage(input()),/commit failure/);
});

test('account cleanup removes every enrollment for that account and preserves other accounts',async()=>{const f=fixture();await f.store.stage(input());await f.store.stage({...input(),epoch:other});await f.store.stage({...input(),account:other});await f.store.clearAccount(account);assert.equal(await f.store.read(account,epoch),null);assert.equal(await f.store.read(account,other),null);assert.equal((await f.store.read(other,epoch)).id,id);});
