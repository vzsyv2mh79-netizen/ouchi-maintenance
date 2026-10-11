// Explicit local browser test; not part of the synthetic unit-test glob.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const modulePath=process.argv[process.argv.indexOf('--playwright-module')+1];
assert.ok(process.argv.includes('--playwright-module')&&modulePath,'Supply a locally installed Playwright module; this script never installs browsers.');
const imported=await import(pathToFileURL(modulePath).href),{chromium}=imported.default??imported;
const executablePath=process.argv.includes('--browser-executable')?process.argv[process.argv.indexOf('--browser-executable')+1]:undefined;
const source=ts.transpileModule(readFileSync('lib/pending-attachment-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let apiRequests=0;
const server=createServer((request,response)=>{
 if(request.url?.startsWith('/api/'))apiRequests++;
 if(request.url==='/module.js'){response.writeHead(200,{'content-type':'text/javascript'});response.end(source);return;}
 response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><title>Disposable IndexedDB test</title>');
});
let context;const profile=mkdtempSync(join(tmpdir(),'ouchi-indexeddb-disposable-'));
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 context=await chromium.launchPersistentContext(profile,{headless:true,executablePath});
 let first=await context.newPage(),second=await context.newPage();const url=`http://127.0.0.1:${server.address().port}`;
 await Promise.all([first.goto(url),second.goto(url)]);
 const base={account:'11111111-1111-4111-8111-111111111111',epoch:'22222222-2222-4222-8222-222222222222',product:'44444444-4444-4444-8444-444444444444',id:'55555555-5555-4555-8555-555555555555',mime:'image/png'};
 const stage=(page,input)=>page.evaluate(async value=>{const {browserPendingAttachments:store}=await import('/module.js');const blob=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'private-warranty.png',{type:'image/png'});try{const saved=await store.stage({...value,blob});return {ok:true,id:saved.id,filenameStored:'name' in saved.blob};}catch(error){return {ok:false,error:error.message};}},input);
 const read=(page,input)=>page.evaluate(async value=>{const {browserPendingAttachments:store}=await import('/module.js');const saved=await store.read(value.account,value.epoch);return saved?{id:saved.id,bytes:Array.from(new Uint8Array(await saved.blob.arrayBuffer())),filenameStored:'name' in saved.blob}:null;},input);
 assert.deepEqual(await stage(first,base),{ok:true,id:base.id,filenameStored:false});
 await context.close();context=await chromium.launchPersistentContext(profile,{headless:true,executablePath});
 first=await context.newPage();second=await context.newPage();await Promise.all([first.goto(url),second.goto(url)]);
 await first.reload();assert.deepEqual(await read(first,base),{id:base.id,bytes:[137,80,78,71,13,10,26,10],filenameStored:false});
 assert.equal((await read(second,base)).id,base.id);
 assert.equal(await read(first,{...base,epoch:'66666666-6666-4666-8666-666666666666'}),null);
 const otherAccount={...base,account:'66666666-6666-4666-8666-666666666666'};
 assert.equal(await read(first,otherAccount),null);
 const competitor={...otherAccount,id:'77777777-7777-4777-8777-777777777777'};
 const results=await Promise.all([stage(first,otherAccount),stage(second,competitor)]);
 assert.equal(results.filter(value=>value.ok).length,1);assert.equal(results.filter(value=>!value.ok).length,1);
 const winner=(await read(second,otherAccount)).id;assert.ok([base.id,competitor.id].includes(winner));
 const acknowledge=(page,input)=>page.evaluate(async value=>{const {browserPendingAttachments:store}=await import('/module.js');try{await store.complete(value.account,value.epoch,value.id);return true;}catch{return false;}},input);
 assert.equal(await acknowledge(second,{...base,id:competitor.id}),false);assert.equal((await read(first,base)).id,base.id);
 assert.equal(await acknowledge(first,base),true);assert.equal(await read(second,base),null);assert.equal((await read(first,otherAccount)).id,winner);
 const lifecycle=(page,method,account)=>page.evaluate(async({method,account})=>{const {browserPendingAttachments:store}=await import('/module.js');await store[method](account);},{method,account});
 await stage(first,{...base,epoch:competitor.id});
 await lifecycle(second,'clearAccount',base.account);
 assert.equal(await read(first,base),null);assert.equal(await read(first,{...base,epoch:competitor.id}),null);assert.equal((await read(first,otherAccount)).id,winner);
 assert.equal((await stage(first,base)).ok,false);
 // Hold hashing after the write permit is captured; cleanup in another tab must fence the late commit.
 await lifecycle(second,'resumeAccount',base.account);
 await first.evaluate(async value=>{const {browserPendingAttachments:store}=await import('/module.js');const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});const original=blob.arrayBuffer.bind(blob);let release;window.releasePendingDigest=()=>release();blob.arrayBuffer=async()=>{window.pendingDigestStarted=true;await new Promise(resolve=>release=resolve);return original();};window.latePendingResult=store.stage({...value,blob}).then(()=>true,()=>false);},base);
 await first.waitForFunction(()=>window.pendingDigestStarted===true);
 await lifecycle(second,'clearAccount',base.account);await first.evaluate(()=>window.releasePendingDigest());assert.equal(await first.evaluate(()=>window.latePendingResult),false);assert.equal(await read(first,base),null);
 await lifecycle(second,'resumeAccount',base.account);assert.equal((await stage(first,base)).ok,true);
 assert.equal(apiRequests,0);
 console.log('PASS: real Chromium IndexedDB commit, browser restart and reload, cross-tab visibility and atomic competing writes, account/epoch isolation, exact-ID acknowledgement, stripped filename, account-wide cleanup and cross-tab late-write fencing, explicit login resumption. Zero API requests; disposable profile and synthetic bytes only.');
}finally{await context?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(profile,{recursive:true,force:true});}
