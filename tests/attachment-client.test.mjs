import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/attachment-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {attachmentBinding,attachmentPage,downloadAttachment}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const account='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',id='55555555-5555-4555-8555-555555555555';
const signal=()=>new AbortController().signal;
async function withFetch(handler,run){const before=globalThis.fetch;globalThis.fetch=handler;try{await run();}finally{globalThis.fetch=before;}}
test('binding uses the formal same-origin route without cookies, cache or forwarded redirects',async()=>{
 await withFetch(async(url,options)=>{assert.equal(url,'/api/product-attachments?binding=true');assert.equal(options.headers.Authorization,'Bearer synthetic');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return Response.json({account,epoch});},async()=>assert.deepEqual(await attachmentBinding('synthetic',signal()),{account,epoch}));
 for(const value of [{account,epoch:account},{account,epoch:'00000000-0000-0000-0000-000000000000'},{account:'invalid',epoch}])await withFetch(async()=>Response.json(value),async()=>assert.rejects(attachmentBinding('synthetic',signal())));
});
test('cancelled requests and invalid IDs never enter the transport',async()=>{
 await withFetch(async()=>{throw Error('transport must not run');},async()=>{
  const controller=new AbortController();controller.abort();await assert.rejects(attachmentBinding('synthetic',controller.signal),error=>error.name==='AbortError');
  await assert.rejects(attachmentPage('bad',null,'synthetic',signal()),/製品/);
  await assert.rejects(downloadAttachment('bad','synthetic',signal()),/ファイル/);
 });
});
test('bounded response rejects oversized declared and streamed replies',async()=>{
 for(const response of [new Response('x',{headers:{'content-length':'4097'}}),new Response(new Uint8Array(4097)),new Response('{}',{headers:{'content-length':'1e9'}})])await withFetch(async()=>response,async()=>assert.rejects(attachmentBinding('synthetic',signal())));
});
test('page validates order, unique IDs, cursor and typed metadata',async()=>{
 const item={id,size:8,mime:'image/png',createdAt:'2026-10-11T07:00:00Z'};
 await withFetch(async()=>Response.json({items:[item],next:null}),async()=>assert.deepEqual(await attachmentPage(id,null,'synthetic',signal()),{items:[item],next:null}));
 for(const value of [{items:[item,item],next:null},{items:[item],next:id},{items:[{...item,size:5242881}],next:null},{items:[{...item,mime:'text/html'}],next:null},{items:[item]}])await withFetch(async()=>Response.json(value),async()=>assert.rejects(attachmentPage(id,null,'synthetic',signal())));
 await withFetch(async()=>Response.json({items:[item],next:null}),async()=>assert.rejects(attachmentPage(id,id,'synthetic',signal())));
});
test('retained downloads require exact safe name, type and format signature',async()=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10]),filename=`ouchi-attachment-${id}.png`;
 const headers={'content-type':'image/png','content-disposition':`attachment; filename="${filename}"`};
 await withFetch(async()=>new Response(bytes,{headers}),async()=>{const result=await downloadAttachment(id,'synthetic',signal());assert.equal(result.filename,filename);assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);});
 for(const response of [new Response(bytes,{headers:{...headers,'content-disposition':'inline'}}),new Response(bytes,{headers:{...headers,'content-type':'text/html'}}),new Response(new Uint8Array([0,1,2]),{headers}),new Response('missing',{status:404})])await withFetch(async()=>response,async()=>assert.rejects(downloadAttachment(id,'synthetic',signal())));
});
