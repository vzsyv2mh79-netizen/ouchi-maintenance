import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {createHouseholdCopy} from '../lib/household-copy.mjs';
const modules=new Map();function compile(name){if(modules.has(name))return modules.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');code=code.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;}
const {createHouseholdCopyStorage}=await import(compile('household-copy-storage'));
const projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_copy_fixture';
test('real SDK provider copies verified bytes to exact household path with upsert disabled, without exposing removal or activation',async()=>{
 const f=await householdCopyFixture(),original=globalThis.fetch;let writes=0;try{
  const storage=createHouseholdCopyStorage({projectID,secretKey}),port=createHouseholdCopy({connect:f.connect,storage});await port.prepare(f.input,f.signal);
  assert.deepEqual(Object.keys(storage).sort(),['inspectDestination','readSource','writeDestination']);
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input));assert.equal(url.origin,`https://${projectID}.supabase.co`);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('apikey'),secretKey);
   const prefix='/storage/v1/object/ouchi-product-attachments/';assert.ok(url.pathname.startsWith(prefix));const path=url.pathname.slice(prefix.length);
   if(init.method==='GET'){const blob=f.objects.get(path);return blob?new Response(await blob.arrayBuffer(),{headers:{'content-type':blob.type,'content-length':String(blob.size)}}):Response.json({code:'NoSuchKey',message:'Synthetic missing key'},{status:404});}
   assert.equal(init.method,'POST');assert.ok(path.startsWith('households/'));assert.equal(new Headers(init.headers).get('x-upsert'),'false');assert.equal(f.objects.has(path),false);assert.ok(init.body instanceof FormData);assert.equal(init.body.get('cacheControl'),'0');const blob=init.body.get('');assert.ok(blob instanceof Blob);assert.deepEqual(Buffer.from(await blob.arrayBuffer()),f.bytes);f.objects.set(path,blob);writes++;return Response.json({Id:'synthetic-object-id',Key:'ouchi-product-attachments/'+path});
  };
  assert.equal((await port.copy(f.operation,f.signal)).state,'copy_verified');await port.copy(f.operation,f.signal);assert.equal(writes,1);assert.equal(f.objects.has(f.sourcePath),true);
 }finally{globalThis.fetch=original;await f.db.close();}
});
test('only explicit NoSuchKey 404 means destination missing; other failures never authorize a write',async()=>{
 const f=await householdCopyFixture(),original=globalThis.fetch;try{
  const m=await f.port.prepare(f.input,f.signal),storage=createHouseholdCopyStorage({projectID,secretKey});
  for(const response of [Response.json({code:'NoSuchBucket'},{status:404}),Response.json({code:'AccessDenied'},{status:403}),new Response('not found',{status:404}),Response.json({code:'NoSuchKey'},{status:500}),Response.json({code:'NoSuchKey',statusCode:'500'},{status:400}),Response.json({code:'NoSuchBucket',statusCode:'404'},{status:400}),Response.json({code:'NoSuchKey'},{status:400})]){globalThis.fetch=async()=>response;await assert.rejects(storage.inspectDestination(m,f.signal),/read unconfirmed/);}
  for(const status of [404,400]){globalThis.fetch=async()=>Response.json({code:'NoSuchKey',statusCode:'404',error:'not_found',message:'Object not found'},{status});assert.equal(await storage.inspectDestination(m,f.signal),null);}
 }finally{globalThis.fetch=original;await f.db.close();}
});
test('private copy provider refuses foreign paths, invalid credentials and wrong source bytes before network writes',async()=>{
 const f=await householdCopyFixture(),original=globalThis.fetch;try{
  const m=await f.port.prepare(f.input,f.signal),storage=createHouseholdCopyStorage({projectID,secretKey});let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected network');};
  await assert.rejects(storage.inspectDestination({...m,destination:{...m.destination,objectPath:'../foreign'}},f.signal),/Exact prepared copy paths/);
  await assert.rejects(storage.writeDestination(m,new Blob([new Uint8Array(f.bytes.length)],{type:'application/pdf'}),f.signal),/source bytes mismatch/);assert.equal(calls,0);
  assert.throws(()=>createHouseholdCopyStorage({projectID,secretKey:'sb_publishable_invalid'}),/Explicit private copy/);
 }finally{globalThis.fetch=original;await f.db.close();}
});
