import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const moduleURL=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const responseStub=moduleURL('export const NextResponse={json:(body,init)=>Response.json(body,init)};');
const modelStub=moduleURL('export const normalizeModel=value=>value;');
const parserStub=moduleURL('export function inspectManual(){throw Error("unexpected parser invocation");}');
const source=compile('app/api/manual-suggestions/route.ts')
 .replace('"next/server"',JSON.stringify(responseStub))
 .replace('"@/lib/product-lookup"',JSON.stringify(modelStub))
 .replace('"@/lib/manual-evidence"',JSON.stringify(moduleURL(compile('lib/manual-evidence.ts'))))
 .replace('"@/lib/manual-pdf"',JSON.stringify(parserStub));
const {POST}=await import(moduleURL(source));

test('manual failures retain useful HTTP status without logging upstream URL, body or error details',async()=>{
 const privateDetail='SYNTHETIC_PRIVATE_PDF_TEXT https://example.invalid/?token=synthetic-secret';
 const originalFetch=globalThis.fetch,originalError=console.error;
 try {
  for(const [failure,status] of [
   [new Error(privateDetail),422],
   [Object.assign(new Error(privateDetail),{name:'TimeoutError'}),504],
   [Object.assign(new Error(privateDetail),{name:'AbortError'}),504],
   [{message:privateDetail,body:privateDetail},422],
  ]) {
   const logs=[];
   globalThis.fetch=async()=>{throw failure;};
   console.error=(...args)=>logs.push(args);
   const response=await POST(new Request('https://example.invalid/api/manual-suggestions',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     model:'KI-RX100',url:'https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf',manualConsentConfirmed:true,
    }),
   }));
   assert.equal(response.status,status);
   assert.deepEqual(logs,[['Manual inspection failed']]);
   const body=await response.text();
   assert.ok(!body.includes(privateDetail));
   assert.ok(!body.includes('synthetic-secret'));
  }
 } finally {
  globalThis.fetch=originalFetch;
  console.error=originalError;
 }
});
