import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();function compile(name){if(modules.has(name))return modules.get(name);let s=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');s=s.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));const url='data:text/javascript;base64,'+Buffer.from(s).toString('base64');modules.set(name,url);return url;}
const {createReviewedFileCleanupStorage}=await import(compile('reviewed-file-cleanup-storage'));
const projectID='abcdefghijklmnopqrst',secretKey='sb_secret_synthetic_cleanup_test';
function fixture(){
 const bytes=Buffer.from('%PDF synthetic reviewed file'),mime='application/pdf',sha256=createHash('sha256').update(bytes).digest('hex'),id=randomUUID(),uploaderID=randomUUID(),uploaderEpoch=randomUUID(),homeInstanceID=randomUUID(),destinationID=randomUUID();
 const source={attachmentID:id,uploaderID,uploaderEpoch,objectPath:`${uploaderID}/${uploaderEpoch}/${id}.pdf`,sizeBytes:bytes.length,mime,sha256};
 const retained={attachmentID:destinationID,objectPath:`households/${homeInstanceID}/${destinationID}.pdf`,sizeBytes:bytes.length,mime,sha256};
 const manifest={requestID:randomUUID(),kind:'personal_file',homeInstanceID,source,retained},objects=new Map([[source.objectPath,bytes],[retained.objectPath,bytes]]),calls=[];
 const signal=new AbortController().signal,port=createReviewedFileCleanupStorage({projectID,secretKey});
 const fetch=async(input,init)=>{
  const url=String(input),method=init.method;calls.push({url,method});assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('apikey'),secretKey);
  const prefix=`https://${projectID}.supabase.co/storage/v1/object/ouchi-product-attachments`;
  if(method==='GET'){
   const path=url.slice(prefix.length+1);assert.ok([source.objectPath,retained.objectPath].includes(path));const b=objects.get(path);
   return b?new Response(b,{headers:{'content-type':mime}}):Response.json({code:'NoSuchKey',statusCode:'404',message:'Object not found'},{status:400});
  }
  assert.equal(method,'DELETE');assert.equal(url,prefix);assert.deepEqual(JSON.parse(init.body),{prefixes:[source.objectPath]});objects.delete(source.objectPath);return Response.json([{name:source.objectPath}]);
 };
 return {bytes,manifest,source,retained,objects,calls,signal,port,fetch};
}
test('exact SDK cleanup verifies retained bytes first, removes only source, probes absence and never releases capacity',async()=>{
 const f=fixture(),original=globalThis.fetch;try{
  globalThis.fetch=f.fetch;assert.deepEqual(Object.keys(f.port),['cleanup']);
  assert.deepEqual(await f.port.cleanup(f.manifest,f.signal),{sourceAbsenceObserved:true,deleteAcknowledged:true,capacityReleaseAuthorized:false});
  assert.deepEqual(f.calls.map(c=>c.method),['GET','GET','DELETE','GET']);assert.ok(f.calls[0].url.endsWith(f.retained.objectPath));assert.equal(f.objects.has(f.retained.objectPath),true);
  f.calls.length=0;assert.equal((await f.port.cleanup(f.manifest,f.signal)).deleteAcknowledged,false);assert.deepEqual(f.calls.map(c=>c.method),['GET','GET']);
 }finally{globalThis.fetch=original;}
});
test('missing or changed retained copy and changed source stop before DELETE',async()=>{
 const original=globalThis.fetch;try{for(const variant of ['missing-retained','changed-retained','changed-source']){
  const f=fixture();globalThis.fetch=f.fetch;
  if(variant==='missing-retained')f.objects.delete(f.retained.objectPath);
  else f.objects.set(variant==='changed-retained'?f.retained.objectPath:f.source.objectPath,Buffer.from('changed'));
  await assert.rejects(f.port.cleanup(f.manifest,f.signal),/missing|mismatch/);assert.equal(f.calls.some(c=>c.method==='DELETE'),false);assert.equal(f.objects.has(f.source.objectPath),true);
 }}finally{globalThis.fetch=original;}
});
test('lost DELETE response is reconciled with exact source probe without repeated DELETE or false acknowledgement',async()=>{
 const original=globalThis.fetch;try{for(const applied of [true,false]){
  const f=fixture();globalThis.fetch=async(input,init)=>{if(init.method==='DELETE'){if(applied)await f.fetch(input,init);else f.calls.push({method:'DELETE'});throw Error('Synthetic lost response');}return f.fetch(input,init);};
  if(applied)assert.deepEqual(await f.port.cleanup(f.manifest,f.signal),{sourceAbsenceObserved:true,deleteAcknowledged:false,capacityReleaseAuthorized:false});
  else await assert.rejects(f.port.cleanup(f.manifest,f.signal),/absence unconfirmed/);
  assert.equal(f.calls.filter(c=>c.method==='DELETE').length,1);assert.equal(f.objects.has(f.retained.objectPath),true);
 }}finally{globalThis.fetch=original;}
});
test('generic errors are never absence; only explicit NoSuchKey status shape is accepted',async()=>{
 const original=globalThis.fetch;try{
  for(const response of [new Response('not found',{status:404}),Response.json({code:'NoSuchBucket'},{status:404}),Response.json({code:'AccessDenied'},{status:403}),Response.json({code:'NoSuchKey'},{status:400}),Response.json({code:'NoSuchKey',statusCode:'500'},{status:400}),Response.json({code:'NoSuchKey'},{status:500}),Response.json({code:'NoSuchKey',statusCode:'500'},{status:404}),Response.json({code:'NoSuchKey',statusCode:'404'},{status:503})]){
   const f=fixture();delete f.manifest.retained;globalThis.fetch=async()=>response;await assert.rejects(f.port.cleanup(f.manifest,f.signal),/read unconfirmed/);
  }
  for(const status of [400,404]){const f=fixture();delete f.manifest.retained;globalThis.fetch=async()=>Response.json({code:'NoSuchKey',statusCode:'404'},{status});assert.equal((await f.port.cleanup(f.manifest,f.signal)).deleteAcknowledged,false);}
 }finally{globalThis.fetch=original;}
});
test('fixed cloned manifest defeats caller mutation during read; foreign paths and secret types fail before I/O',async()=>{
 const original=globalThis.fetch;try{
  const f=fixture();let once=false;globalThis.fetch=async(input,init)=>{if(!once){once=true;f.manifest.source={...f.source,objectPath:'foreign'};}return f.fetch(input,init);};
  await f.port.cleanup(f.manifest,f.signal);assert.equal(f.objects.has(f.source.objectPath),false);
  for(const alter of [m=>m.source.objectPath='../foreign',m=>m.kind='unknown',m=>m.retained.objectPath=m.source.objectPath,m=>m.source.sha256='bad',m=>m.source.sizeBytes=5242881]){
   const g=fixture();alter(g.manifest);globalThis.fetch=async()=>assert.fail('No network allowed');await assert.rejects(g.port.cleanup(g.manifest,g.signal),/Exact/);
  }
  assert.throws(()=>createReviewedFileCleanupStorage({projectID,secretKey:'sb_publishable_wrong'}),/Explicit private/);
 }finally{globalThis.fetch=original;}
});
test('cancellation after DELETE preserves ambiguity and does not turn into successful absence',async()=>{
 const f=fixture(),original=globalThis.fetch,controller=new AbortController();try{
  globalThis.fetch=async(input,init)=>{const result=await f.fetch(input,init);if(init.method==='DELETE')controller.abort(Error('Synthetic caller cancelled'));return result;};
  await assert.rejects(f.port.cleanup(f.manifest,controller.signal),/cancelled/);assert.equal(f.calls.filter(c=>c.method==='GET').length,2);assert.equal(f.objects.has(f.retained.objectPath),true);
 }finally{globalThis.fetch=original;}
});
test('household erasure uses opaque incarnation path without inventing uploader credentials',async()=>{
 const f=fixture(),original=globalThis.fetch;try{
  f.manifest.kind='household_file';f.manifest.source={...f.retained};delete f.manifest.retained;
  globalThis.fetch=async(input,init)=>{
   if(init.method==='DELETE'){assert.deepEqual(JSON.parse(init.body),{prefixes:[f.retained.objectPath]});f.objects.delete(f.retained.objectPath);return Response.json([{name:f.retained.objectPath}]);}
   return f.fetch(input,init);
  };
  assert.equal((await f.port.cleanup(f.manifest,f.signal)).deleteAcknowledged,true);assert.equal(f.objects.has(f.source.objectPath),true);
 }finally{globalThis.fetch=original;}
});
test('personal orphan erasure does not invent a household incarnation, while retained copies still require one',async()=>{
 const f=fixture(),original=globalThis.fetch;try{
  f.manifest.homeInstanceID=null;delete f.manifest.retained;globalThis.fetch=f.fetch;
  assert.equal((await f.port.cleanup(f.manifest,f.signal)).sourceAbsenceObserved,true);
  const g=fixture();g.manifest.homeInstanceID=null;globalThis.fetch=async()=>assert.fail('No network for a retained copy without incarnation');await assert.rejects(g.port.cleanup(g.manifest,g.signal),/Exact retained/);
 }finally{globalThis.fetch=original;}
});
