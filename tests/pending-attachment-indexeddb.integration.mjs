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
 const removal={...base,id:'88888888-8888-4888-8888-888888888888'};
 const stageRemoval=(page,input)=>page.evaluate(async value=>{const {browserPendingAttachmentRemovals:store}=await import('/module.js');try{return {ok:true,id:(await store.stage(value)).id};}catch{return {ok:false};}},input);
 const readRemoval=(page,input)=>page.evaluate(async value=>{const {browserPendingAttachmentRemovals:store}=await import('/module.js');return store.read(value.account,value.epoch);},input);
 assert.deepEqual(await stageRemoval(first,removal),{ok:true,id:removal.id});

 await context.close();context=await chromium.launchPersistentContext(profile,{headless:true,executablePath});
 first=await context.newPage();second=await context.newPage();await Promise.all([first.goto(url),second.goto(url)]);
 await first.reload();assert.deepEqual(await read(first,base),{id:base.id,bytes:[137,80,78,71,13,10,26,10],filenameStored:false});
 assert.equal((await read(second,base)).id,base.id);
 assert.equal((await readRemoval(first,base)).id,removal.id);assert.equal((await readRemoval(second,base)).id,removal.id);
 assert.equal((await stageRemoval(second,{...removal,id:base.id})).ok,false);
 const completeRemoval=(page,input)=>page.evaluate(async value=>{const {browserPendingAttachmentRemovals:store}=await import('/module.js');try{await store.complete(value.account,value.epoch,value.id);return true;}catch{return false;}},input);
 assert.equal(await completeRemoval(second,base),false);assert.equal((await readRemoval(first,base)).id,removal.id);
 assert.equal(await completeRemoval(second,removal),true);assert.equal(await readRemoval(first,base),null);assert.equal((await read(first,base)).id,base.id);

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
 assert.equal((await stageRemoval(first,removal)).ok,true);
 await lifecycle(second,'clearAccount',base.account);
 assert.equal(await readRemoval(first,base),null);
 assert.equal(await read(first,base),null);assert.equal(await read(first,{...base,epoch:competitor.id}),null);assert.equal((await read(first,otherAccount)).id,winner);
 assert.equal((await stage(first,base)).ok,false);
 // Hold hashing after the write permit is captured; cleanup in another tab must fence the late commit.
 await lifecycle(second,'resumeAccount',base.account);
 await first.evaluate(async value=>{const {browserPendingAttachments:store}=await import('/module.js');const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});const original=blob.arrayBuffer.bind(blob);let release;window.releasePendingDigest=()=>release();blob.arrayBuffer=async()=>{window.pendingDigestStarted=true;await new Promise(resolve=>release=resolve);return original();};window.latePendingResult=store.stage({...value,blob}).then(()=>true,()=>false);},base);
 await first.waitForFunction(()=>window.pendingDigestStarted===true);
 await lifecycle(second,'clearAccount',base.account);await first.evaluate(()=>window.releasePendingDigest());assert.equal(await first.evaluate(()=>window.latePendingResult),false);assert.equal(await read(first,base),null);
 await lifecycle(second,'resumeAccount',base.account);assert.equal((await stage(first,base)).ok,true);
 // Exact retired-epoch cleanup keeps a newer epoch and a different account.
 const newer={...base,epoch:'99999999-9999-4999-8999-999999999999'};
 assert.equal((await stage(first,newer)).ok,true);assert.equal((await stageRemoval(first,removal)).ok,true);
 const retire=(page,input,{abort=false,expired=false}={})=>page.evaluate(async({input,abort,expired})=>{const {retireBrowserPendingAttachmentScope:retire}=await import('/module.js');const controller=new AbortController();if(abort)controller.abort();try{await retire(input.account,input.epoch,controller.signal,new Date(Date.now()+(expired?-1000:3600000)).toISOString());return true;}catch{return false;}},{input,abort,expired});
 assert.equal(await retire(second,base,{abort:true}),false);assert.equal(await retire(second,base,{expired:true}),false);assert.ok(await read(first,base));assert.ok(await readRemoval(first,base));
 // Pause another tab's digest after its old permit; retirement must prevent its
 // future stage even after account-wide resume and all-account cleanup.
 await acknowledge(first,base);
 await first.evaluate(async value=>{const {browserPendingAttachments:store}=await import('/module.js');const blob=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),original=blob.arrayBuffer.bind(blob);let release;window.releaseRetiredDigest=()=>release();blob.arrayBuffer=async()=>{window.retiredDigestStarted=true;await new Promise(resolve=>release=resolve);return original();};window.lateRetiredResult=store.stage({...value,blob}).then(()=>true,()=>false);},base);
 await first.waitForFunction(()=>window.retiredDigestStarted===true);
 assert.equal(await retire(second,base),true);assert.equal(await retire(second,base),true);
 assert.equal((await read(first,newer)).id,newer.id);assert.equal((await read(first,otherAccount)).id,winner);
 await lifecycle(second,'resumeAccount',base.account);await first.evaluate(()=>window.releaseRetiredDigest());assert.equal(await first.evaluate(()=>window.lateRetiredResult),false);
 assert.equal(await read(first,base),null);assert.equal(await readRemoval(first,base),null);assert.equal(await read(first,newer),null);assert.equal((await read(first,otherAccount)).id,winner);assert.equal((await stage(first,newer)).ok,true);
 assert.equal((await stage(second,base)).ok,false);assert.equal((await stageRemoval(second,removal)).ok,false);
 await first.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('ouchi-maintenance-pending-attachments',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('uploads','readwrite');tx.objectStore('uploads').put(new Blob(['synthetic orphan']),'malformed-orphan');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
 await first.evaluate(async()=>{const {browserPendingAttachments:store}=await import('/module.js');await store.clearAllAccounts();});
 assert.equal(await read(first,base),null);assert.equal(await read(second,otherAccount),null);assert.equal((await stage(first,base)).ok,false);assert.equal((await stage(second,otherAccount)).ok,false);
 const keys=await first.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('ouchi-maintenance-pending-attachments',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('uploads','readonly'),request=tx.objectStore('uploads').getAllKeys();request.onsuccess=()=>resolve(request.result);tx.oncomplete=()=>db.close();};}));assert.ok(keys.every(key=>String(key).startsWith('@account/')||String(key).startsWith('@retired/')));
 await lifecycle(first,'resumeAccount',base.account);assert.equal((await stage(first,base)).ok,false);assert.equal((await stage(first,newer)).ok,true);
 assert.equal(apiRequests,0);
 console.log('PASS: real Chromium IndexedDB commit, browser restart and reload, cross-tab visibility and atomic competing writes, account/epoch isolation, exact-ID acknowledgement, stripped filename, account-wide cleanup and cross-tab late-write fencing, explicit login resumption and signed-out account-wide cleanup. Removal references also survive browser restart, cannot replace a pending target, clear only by exact ID without erasing pending upload bytes, and follow account-wide logout cleanup. Exact retired epoch cleanup is repeatable, preserves newer epoch and other account, refuses expired/aborted authority and fences suspended writers through account resumption and global pending logout cleanup. Zero API requests; disposable profile and synthetic bytes only.');
}finally{await context?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(profile,{recursive:true,force:true});}
