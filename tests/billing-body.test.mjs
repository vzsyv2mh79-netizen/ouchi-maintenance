import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-body.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readBillingBody}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const request=(body,headers={})=>new Request('http://localhost/billing',{method:'POST',body,headers});
test('billing JSON is bounded by actual streamed bytes and requires an object',async()=>{
 assert.deepEqual(await readBillingBody(request('{"signedPayload":"synthetic"}')),{signedPayload:'synthetic'});
 const boundary='{"value":"'+'a'.repeat(65524)+'"}';assert.equal(Buffer.byteLength(boundary),65536);assert.equal((await readBillingBody(request(boundary))).value.length,65524);
 for(const body of ['', 'null','[]','1','"text"','{invalid}',boundary+' '])await assert.rejects(()=>readBillingBody(request(body)));
 for(const length of ['-1','1e3','65537','9007199254740992'])await assert.rejects(()=>readBillingBody(request('{}',{'content-length':length})));
 await assert.rejects(()=>readBillingBody(request('{}',{'content-length':'3'})));
 await assert.rejects(()=>readBillingBody(request(new Uint8Array([123,34,120,34,58,34,255,34,125]))));
 let cancelled=false,pulls=0;
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(32768));},cancel(){cancelled=true;}});
 await assert.rejects(()=>readBillingBody(new Request('http://localhost/billing',{method:'POST',body:stream,duplex:'half'})));
 assert.equal(cancelled,true);assert.ok(pulls<=4);assert.equal(stream.locked,false);
});
