import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const encoded=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const sdk=encoded(`export class StorageApiError extends Error {constructor(code){super(code);this.code=code;}} export function createClient(){const h=globalThis.erasureHarness;h.clients++;return {rpc:async(name)=>name==='pending_maintenance_attachment_erasures'?{data:h.jobs,error:null}:(h.finishes++,{data:h.finish,error:null}),storage:{from:(bucket)=>({remove:async(paths)=>{h.paths.push({bucket,paths});return {error:h.removeError}},download:async()=>({data:h.exists?{}:null,error:new StorageApiError(h.code)})})}};}`);
const source=ts.transpileModule(readFileSync('lib/attachment-erasure.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'@supabase/supabase-js'",JSON.stringify(sdk));
const {eraseIsolatedAttachmentBatch}=await import(encoded(source));
test('isolated erasure requires exact paths, API removal, explicit absence and metadata acknowledgement',async()=>{
 const keys=['NODE_ENV','OUCHI_ATTACHMENT_TEST_MODE','OUCHI_ATTACHMENT_TEST_URL','OUCHI_ATTACHMENT_TEST_SERVICE_KEY'],before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const id='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333';
 const job={id,user,epoch,path:`${user}/${epoch}/${id}.png`},h=globalThis.erasureHarness={clients:0,jobs:[job],finishes:0,finish:true,code:'NoSuchKey',exists:false,removeError:null,paths:[]};
 try{
 Object.assign(process.env,{NODE_ENV:'production',OUCHI_ATTACHMENT_TEST_MODE:'true',OUCHI_ATTACHMENT_TEST_URL:'http://127.0.0.1:54321',OUCHI_ATTACHMENT_TEST_SERVICE_KEY:'synthetic'});await assert.rejects(eraseIsolatedAttachmentBatch);assert.equal(h.clients,0);
 process.env.NODE_ENV='development';h.jobs=[{...job,path:'../../other-app'}];await assert.rejects(eraseIsolatedAttachmentBatch);assert.equal(h.paths.length,0);h.jobs=[job];
 h.removeError=Error('offline');assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:0,deferred:1});assert.equal(h.finishes,0);h.removeError=null;
 h.code='AccessDenied';assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:0,deferred:1});assert.equal(h.finishes,0);h.code='NoSuchKey';h.exists=true;
 assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:0,deferred:1});assert.equal(h.finishes,0);h.exists=false;
 assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:1,deferred:0});assert.deepEqual(h.paths.at(-1),{bucket:'ouchi-product-attachments-test',paths:[job.path]});
 h.finish=false;assert.deepEqual(await eraseIsolatedAttachmentBatch(),{completed:0,deferred:1});
 }finally{delete globalThis.erasureHarness;for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
