import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const moduleURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const reader=moduleURL(compile('lib/product-attachment.ts'));
const {uploadProductAttachment}=await import(moduleURL(compile('lib/attachment-upload.ts').replace("'./product-attachment'",JSON.stringify(reader))));
const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',product='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555';
const request=()=>new Request('https://example.invalid/attachments',{method:'POST',headers:{'content-type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10])});
test('upload completes only after readback and active reservation finalization, including ambiguous create retries',async()=>{
 let identity={user,epoch,session,premium:true},actualMismatch=false,createFails=false,finalizeFails=false,exists=true;const calls=[];
 const services={authorize:async()=>identity,reserve:async r=>{calls.push('reserve');assert.equal(r.path,`${user}/${epoch}/${id}.png`);},create:async()=>{calls.push('create');exists=true;if(createFails)throw Error('timeout');},inspect:async r=>{calls.push('inspect');if(!exists)throw Error('not found');return {size:r.file.size,sha256:actualMismatch?'b'.repeat(64):r.file.sha256,mime:r.file.mime};},finalize:async()=>{calls.push('finalize');if(finalizeFails)throw Error('closed enrollment');}};
 identity=null;assert.equal((await uploadProductAttachment(request(),product,id,services)).status,401);assert.deepEqual(calls,[]);
 identity={user,epoch,session,premium:false};assert.equal((await uploadProductAttachment(request(),product,id,services)).status,403);assert.deepEqual(calls,[]);
 identity={user,epoch,session,premium:true};actualMismatch=true;assert.equal((await uploadProductAttachment(request(),product,id,services)).status,503);assert.deepEqual(calls,['reserve','inspect']);calls.length=0;
 actualMismatch=false;finalizeFails=true;assert.equal((await uploadProductAttachment(request(),product,id,services)).status,503);calls.length=0;
 finalizeFails=false;createFails=true;exists=false;const result=await uploadProductAttachment(request(),product,id,services);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await result.json(),{saved:true,attachmentId:id});assert.deepEqual(calls,['reserve','inspect','create','inspect','finalize']);calls.length=0;assert.equal((await uploadProductAttachment(request(),product,id,services)).status,200);assert.deepEqual(calls,['reserve','inspect','finalize']);
});
