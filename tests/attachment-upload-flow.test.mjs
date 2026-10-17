import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const cache=new Map();function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,target)=>`from ${JSON.stringify(compile(target))}`);const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}
const {sendPendingAttachment,AttachmentScopeChanged}=await import(compile('attachment-upload-flow'));
const scope={account:'11111111-1111-4111-8111-111111111111',epoch:'22222222-2222-4222-8222-222222222222',product:'44444444-4444-4444-8444-444444444444'},id='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666';
function fixture(options={}){
 const pending={version:1,...scope,id,blob:new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),mime:'image/png',sha256:'synthetic-already-checked-digest'},calls=[],sent=[];let reads=0,uploads=0;
 const deps={read:async(account,epoch)=>{calls.push('read');assert.equal(account,scope.account);assert.equal(epoch,scope.epoch);return options.missing?null:options.wrongProduct?{...pending,product:other}:pending;},binding:async()=>{calls.push('binding');reads++;return options.changedAt===reads?{account:scope.account,epoch:other}:scope;},upload:async input=>{calls.push('upload');sent.push(input);uploads++;options.controller?.abort();if(options.lostFirstAck&&uploads===1)throw Error('acknowledgement lost');},complete:async(account,epoch,target)=>{calls.push('complete');assert.equal(account,scope.account);assert.equal(epoch,scope.epoch);assert.equal(target,id);}};
 return {pending,calls,sent,deps};
}
test('committed bytes and exact scope are checked before sending, completion follows same-ID acknowledgement and scope recheck',async()=>{
 const f=fixture();assert.equal((await sendPendingAttachment(scope,id,'synthetic',new AbortController().signal,f.deps)).id,id);assert.deepEqual(f.calls,['read','binding','upload','binding','complete']);assert.equal(f.sent[0].blob,f.pending.blob);assert.equal(f.sent[0].id,id);assert.equal(f.sent[0].epoch,scope.epoch);assert.equal(f.sent[0].confirmed,true);
});
test('lost acknowledgement preserves receipt and retry uses the same file and ID',async()=>{
 const f=fixture({lostFirstAck:true}),signal=new AbortController().signal;await assert.rejects(sendPendingAttachment(scope,id,'synthetic',signal,f.deps),/lost/);assert.ok(!f.calls.includes('complete'));
 await sendPendingAttachment(scope,id,'synthetic',signal,f.deps);assert.equal(f.sent.length,2);assert.equal(f.sent[0].blob,f.sent[1].blob);assert.equal(f.sent[0].id,f.sent[1].id);assert.equal(f.calls.filter(value=>value==='complete').length,1);
});
test('changed enrollment before upload refuses all sends, change after upload preserves uncertain receipt',async()=>{
 for(const changedAt of [1,2]){const f=fixture({changedAt});await assert.rejects(sendPendingAttachment(scope,id,'synthetic',new AbortController().signal,f.deps),error=>error instanceof AttachmentScopeChanged);assert.equal(f.sent.length,changedAt===1?0:1);assert.ok(!f.calls.includes('complete'));}
});
test('missing, different ID or different product cannot be resent into another target',async()=>{
 for(const options of [{missing:true},{wrongProduct:true},{}]){const f=fixture(options);await assert.rejects(sendPendingAttachment(scope,options.missing||options.wrongProduct?id:other,'synthetic',new AbortController().signal,f.deps));assert.deepEqual(f.calls,['read']);}
});
test('cancel before send or while response arrives never clears pending bytes',async()=>{
 const controller=new AbortController();controller.abort();const before=fixture();await assert.rejects(sendPendingAttachment(scope,id,'synthetic',controller.signal,before.deps));assert.deepEqual(before.calls,[]);
 const active=new AbortController(),during=fixture({controller:active});await assert.rejects(sendPendingAttachment(scope,id,'synthetic',active.signal,during.deps));assert.ok(!during.calls.includes('complete'));
});
