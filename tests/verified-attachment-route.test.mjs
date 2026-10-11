import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const cache=new Map();function compile(path){if(cache.has(path))return cache.get(path);let code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]([^'"]+)['"]/g,(original,name)=>{if(name==='@supabase/supabase-js')return `from ${JSON.stringify(import.meta.resolve(name))}`;if(name.startsWith('@/lib/'))return `from ${JSON.stringify(compile('lib/'+name.slice(6)+'.ts'))}`;if(name.startsWith('./'))return `from ${JSON.stringify(compile('lib/'+name.slice(2)+'.ts'))}`;return original;});const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(path,url);return url;}
const {POST,GET}=await import(compile('app/api/development/verified-product-attachments/route.ts'));
test('formal upload route refuses production, absent test flag and shared service URLs before network',async()=>{
 const keys=['NODE_ENV','OUCHI_ATTACHMENT_TEST_MODE','OUCHI_ATTACHMENT_TEST_URL','OUCHI_ATTACHMENT_TEST_SERVICE_KEY'];const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const originalFetch=globalThis.fetch;let called=0;globalThis.fetch=async()=>{called++;throw Error('network must not run');};
 try{
  for(const values of [['production','true','http://127.0.0.1:54321','synthetic'],['development','false','http://127.0.0.1:54321','synthetic'],['development','true','https://example.supabase.co','synthetic'],['development','true','http://127.0.0.1:54321','']]){
   keys.forEach((key,index)=>process.env[key]=values[index]);const response=await POST(new Request('http://127.0.0.1:3000/api/development/verified-product-attachments',{method:'POST'}));assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await GET(new Request('http://127.0.0.1:3000/api/development/verified-product-attachments?usage=true'))).status,503);
  }
  assert.equal(called,0);
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
