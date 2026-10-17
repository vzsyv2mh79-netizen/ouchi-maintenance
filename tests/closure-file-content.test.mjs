import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createClosureOperatorReview} from '../lib/closure-operator-review.mjs';
const modules=new Map();
function moduleURL(name){
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');
 source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?moduleURL(dep.slice(2)):import.meta.resolve(dep)));
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
}
const {createClosureFileStorageReader}=await import(moduleURL('closure-file-storage-reader'));
const bytes=new TextEncoder().encode('%PDF-1.7\nSynthetic operator review only\n'),sha=createHash('sha256').update(bytes).digest('hex');
function fixture({change={},reader,finalError}={}){
 const fileID=randomUUID(),uploaderID=randomUUID(),uploaderEpoch=randomUUID(),metadataDigest='a'.repeat(64);
 const input={inspectionID:randomUUID(),reviewRequestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),fileID,expectedMetadataDigest:metadataDigest};
 const file={attachmentID:fileID,uploaderID,uploaderEpoch,productID:randomUUID(),homeID:randomUUID(),homeInstanceID:randomUUID(),bucket:'ouchi-product-attachments',objectPath:`${uploaderID}/${uploaderEpoch}/${fileID}.pdf`,sizeBytes:bytes.length,mime:'application/pdf',state:'stored',writeState:'settled',removalPending:false,sha256:sha,expectedSHA256:sha,subjectConfirmed:false,...change};
 const calls=[];let reads=0,downloads=0,aborted=0,closed=0;
 const port=createClosureOperatorReview({connect:async()=>({abort(){aborted++;},async close(){closed++;},async query(sql,args){calls.push(sql);
  if(sql.startsWith('select maintenance_private.read_closure_review_file')){reads++;assert.deepEqual(args,[input.reviewRequestID,input.userID,input.epochID,input.fileID,input.expectedMetadataDigest]);if(reads===2&&finalError)throw Error(finalError);return {rows:[{receipt:{metadataDigest,file,accountErasureConfirmed:false}}]};}
  if(sql.startsWith('select maintenance_private.record_closure_file_inspection'))return {rows:[{inspection_id:input.inspectionID}]};return {rows:[]};
 }}),readFileBytes:reader?async(...args)=>{downloads++;return reader(...args);}:undefined});
 return {port,input,file,calls,stats:()=>({reads,downloads,aborted,closed})};
}
test('verified content is returned only after private descriptor recheck and COMMIT, without retention or subject approval',async()=>{
 const f=fixture({reader:async(file,signal)=>{assert.ok(Object.isFrozen(file));assert.ok(signal instanceof AbortSignal);return new Blob([bytes],{type:file.mime});}});
 const result=await f.port.inspectFile(f.input,new AbortController().signal);assert.equal(result.sha256,sha);assert.equal(result.fileID,f.input.fileID);assert.deepEqual(new Uint8Array(await result.content.arrayBuffer()),bytes);
 assert.equal(result.subjectConfirmed,false);assert.equal(result.familyRetentionApproved,false);assert.equal(result.accountErasureConfirmed,false);assert.equal(f.calls.at(-1),'COMMIT');assert.equal(f.stats().reads,2);assert.equal(f.stats().closed,1);
});
test('unsettled, unverified, removed and pending-removal records never download bytes',async()=>{
 for(const change of [{state:'reserved'},{state:'removed'},{writeState:'started'},{writeState:'missing'},{writeState:'untracked'},{removalPending:true},{sha256:null},{expectedSHA256:'b'.repeat(64)}]){
  const f=fixture({change,reader:async()=>{throw Error('must not download');}});await assert.rejects(f.port.inspectFile(f.input,new AbortController().signal),/Settled verified file/);assert.equal(f.stats().downloads,0);assert.equal(f.calls.at(-1),'ROLLBACK');
 }
});
test('wrong bytes, MIME or size and final operator revocation refuse content acknowledgement',async()=>{
 for(const reader of [async()=>new Blob([bytes],{type:'text/html'}),async()=>new Blob(['short'],{type:'application/pdf'}),async()=>new Blob([new Uint8Array(bytes.length)],{type:'application/pdf'})]){
  const f=fixture({reader});await assert.rejects(f.port.inspectFile(f.input,new AbortController().signal),/content mismatch/);assert.equal(f.calls.includes('COMMIT'),false);
 }
 const f=fixture({reader:async()=>new Blob([bytes],{type:'application/pdf'}),finalError:'Authorized operator connection required'});await assert.rejects(f.port.inspectFile(f.input,new AbortController().signal),/Authorized operator/);assert.equal(f.calls.at(-1),'ROLLBACK');
});
test('cancellation bounds a hung reader, closes the dedicated transaction and withholds content',async()=>{
 const controller=new AbortController(),f=fixture({reader:async()=>{setTimeout(()=>controller.abort(),15);return new Promise(()=>{});}});
 await assert.rejects(f.port.inspectFile(f.input,controller.signal),{name:'AbortError'});assert.equal(f.calls.includes('COMMIT'),false);assert.equal(f.stats().aborted,1);assert.equal(f.stats().closed,1);
 const absent=fixture();await assert.rejects(absent.port.inspectFile(absent.input,new AbortController().signal),/private file reader required/);assert.equal(absent.calls.length,0);
});
test('real SDK Storage adapter uses only exact private GET with fixed project, bounded response and no URL or write API',async()=>{
 const original=globalThis.fetch,secret='sb_secret_synthetic_fixture',projectID='abcdefghijklmnopqrst';let calls=0;
 try{
  const reader=createClosureFileStorageReader({projectID,secretKey:secret});
  const f=fixture({reader});
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),`https://${projectID}.supabase.co/storage/v1/object/${f.file.bucket}/${f.file.objectPath}`);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(new Headers(init.headers).get('apikey'),secret);return new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(bytes.length)}});};
  const result=await f.port.inspectFile(f.input,new AbortController().signal);assert.equal(result.sha256,sha);assert.equal(calls,1);
  await assert.rejects(reader({...f.file,objectPath:'../foreign'},new AbortController().signal),/Exact reviewed Storage object/);assert.equal(calls,1);
  for(const config of [{projectID:'foreign.example',secretKey:secret},{projectID,secretKey:'sb_publishable_wrong'},{projectID,secretKey:''}])assert.throws(()=>createClosureFileStorageReader(config),/Explicit private Storage/);
 }finally{globalThis.fetch=original;}
});
test('oversized or stalled Storage response is refused before content can be acknowledged',async()=>{
 const original=globalThis.fetch;
 try{
  const reader=createClosureFileStorageReader({projectID:'abcdefghijklmnopqrst',secretKey:'sb_secret_synthetic_fixture'}),f=fixture({reader});
  globalThis.fetch=async()=>new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(bytes.length+1)}});
  await assert.rejects(f.port.inspectFile(f.input,new AbortController().signal));assert.equal(f.calls.includes('COMMIT'),false);
  const controller=new AbortController();let cancelled=false;
  globalThis.fetch=async()=>new Response(new ReadableStream({start(){setTimeout(()=>controller.abort(),15);},cancel(){cancelled=true;}}),{headers:{'content-type':'application/pdf'}});
  const stalled=fixture({reader});await assert.rejects(stalled.port.inspectFile(stalled.input,controller.signal),{name:'AbortError'});assert.equal(stalled.calls.includes('COMMIT'),false);assert.equal(cancelled,true);
 }finally{globalThis.fetch=original;}
});
