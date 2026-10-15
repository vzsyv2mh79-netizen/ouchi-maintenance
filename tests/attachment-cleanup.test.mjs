import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createClient,StorageApiError} from '@supabase/supabase-js';
import {runAttachmentCleanupBatch as run,storedAttachmentCleanupServices as stored,createAttachmentFetch} from './fixtures/attachment-cleanup-module.mjs';
function fixture(options={}){
 const id=randomUUID(),user=randomUUID(),epoch=randomUUID(),owner=randomUUID();
 const base={id,user,epoch,owner,path:`${user}/${epoch}/${id}.png`,mime:'image/png'};
 const controller=new AbortController(),calls=[];let removed=false,acknowledged=false,scope;
 const db={storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {
  remove:async paths=>{calls.push('remove');assert.deepEqual(paths,[base.path]);removed=true;if(options.cancelAt==='remove')controller.abort();return {error:options.lostRemove?Error('Reply lost'):null};},
  download:async path=>{calls.push('download');assert.equal(path,base.path);assert.ok(removed);return {data:options.present?new Blob(['retained']):null,error:options.generic404?{code:'NoSuchKey',status:404}:new StorageApiError('synthetic',404,'404','storage',options.denied?'AccessDenied':'NoSuchKey')};},
 };}}};
 const query=async(sql,args,signal)=>{
  assert.equal(signal,controller.signal);let value;
  if(sql.includes('attachment_cleanup_candidates')){calls.push('candidates');value=acknowledged?[]:[id];}
  else if(sql.includes('claim_attachment_cleanup')){calls.push('claim');assert.equal(args[0],id);scope={...base,lease:args[1]};value=options.foreign?{...scope,path:'foreign/path'}:scope;}
  else{
   assert.deepEqual(args,[id,scope.lease,user,epoch,owner,base.path,base.mime]);
   if(sql.includes('attachment_cleanup_current')){calls.push('current');value=!(options.revokeAfterRemove&&removed);}
   else{assert.ok(sql.includes('complete_attachment_cleanup'));calls.push('complete');assert.ok(removed);acknowledged=true;if(options.lostAck)throw Error('Commit reply lost');value=true;}
  }
  return {rows:[{value}]};
 };
 return {base,calls,controller,query,db,run:()=>run(stored(db,query),controller.signal)};
}
test('worker recovers a lost remove reply through definitive SDK absence before exact SQL acknowledgement',async()=>{
 const f=fixture({lostRemove:true});assert.deepEqual(await f.run(),{attempted:1,completed:1,deferred:0});
 assert.equal(f.calls.filter(x=>x==='remove').length,1);assert.ok(f.calls.indexOf('download')<f.calls.indexOf('complete'));
});
test('present bytes, generic404, denied read, changed lease and malformed scope never release quota',async()=>{
 for(const options of [{present:true},{generic404:true},{denied:true},{revokeAfterRemove:true},{foreign:true}]){
  const f=fixture(options);assert.deepEqual(await f.run(),{attempted:1,completed:0,deferred:1});assert.equal(f.calls.includes('complete'),false);
  if(options.foreign)assert.equal(f.calls.includes('remove'),false);
  if(options.revokeAfterRemove)assert.equal(f.calls.includes('download'),false);
 }
});
test('lost completion reply stays unconfirmed while a later batch never repeats an already completed deletion',async()=>{
 const f=fixture({lostAck:true});assert.deepEqual(await f.run(),{attempted:1,completed:0,deferred:1});
 assert.deepEqual(await f.run(),{attempted:0,completed:0,deferred:0});assert.equal(f.calls.filter(x=>x==='remove').length,1);
});
test('cancellation during removal stops before absence/readback without pretending completion',async()=>{
 const f=fixture({cancelAt:'remove'});await assert.rejects(f.run());assert.equal(f.calls.includes('download'),false);assert.equal(f.calls.includes('complete'),false);
 const g=fixture();g.controller.abort();await assert.rejects(g.run());assert.deepEqual(g.calls,[]);
});
test('complete candidate inventory is validated before any claim or Storage side effect',async()=>{
 for(const inventory of [[randomUUID(),randomUUID(),'invalid'],Array.from({length:26},()=>randomUUID()),[...Array(2)].map(()=> '11111111-1111-4111-8111-111111111111'),null]){
  let claims=0;const services={candidates:async()=>inventory,claim:async()=>{claims++;},current:async()=>true,remove:async()=>{},absent:async()=>true,complete:async()=>true};
  await assert.rejects(run(services,new AbortController().signal),/inventory unavailable/);assert.equal(claims,0);
 }
 const f=fixture();const services=stored(f.db,async()=>{throw Error('private backend details');});
 await assert.rejects(run(services,f.controller.signal),error=>error.message==='Cleanup inventory unavailable');
});
test('stored services refuse direct forged scopes and always use the original approved immutable path',async()=>{
 const f=fixture(),services=stored(f.db,f.query),signal=f.controller.signal,lease=randomUUID();
 const scope=await services.claim(f.base.id,lease,signal);
 assert.equal(await services.current({...scope,owner:randomUUID()},signal),false);
 await assert.rejects(services.remove({...scope,path:'foreign/path'},signal),/lease unavailable/);assert.equal(f.calls.includes('remove'),false);
 let reads=0;const supplied={...scope,get path(){return ++reads===1?scope.path:'foreign/path';}};
 await services.remove(supplied,signal);assert.equal(reads,1);assert.equal(f.calls.filter(x=>x==='remove').length,1);
});
test('a provider accessor cannot replace a candidate between validation and its claim',async()=>{
 const id=randomUUID(),claimed=[];let reads=0;const candidates=[id];
 Object.defineProperty(candidates,'0',{get:()=>++reads===1?id:'invalid'});
 const services={candidates:async()=>candidates,claim:async target=>{claimed.push(target);return null;},current:async()=>true,remove:async()=>{},absent:async()=>true,complete:async()=>true};
 assert.deepEqual(await run(services,new AbortController().signal),{attempted:1,completed:0,deferred:1});assert.deepEqual(claimed,[id]);assert.equal(reads,1);
});
test('actual pinned SDK recovers a dropped HTTP removal reply before acknowledging the original private SQL lease',async()=>{
 const id=randomUUID(),user=randomUUID(),epoch=randomUUID(),base={id,user,epoch,owner:user,mime:'image/png',path:`${user}/${epoch}/${id}.png`};
 let scope,removed=false,deletes=0,reads=0,acks=0,unknown=0;const errors=[];
 const server=createServer(async(request,response)=>{
  try{
   if(request.method==='DELETE'){
    assert.equal(request.url,'/storage/v1/object/ouchi-product-attachments');const chunks=[];for await(const chunk of request)chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)),{prefixes:[base.path]});removed=true;deletes++;response.destroy();return;
   }
   assert.equal(request.method,'GET');assert.ok(['/storage/v1/object/ouchi-product-attachments/'+base.path,'/storage/v1/object/authenticated/ouchi-product-attachments/'+base.path].includes(request.url));assert.equal(removed,true);reads++;
   response.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({statusCode:'404',code:'NoSuchKey',error:'Not Found',message:'Synthetic object absent'}));
  }catch(error){errors.push(error);if(!response.destroyed)response.writeHead(500).end();}
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const client=createClient('http://127.0.0.1:'+server.address().port,'synthetic-cleanup-sdk-only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:createAttachmentFetch(undefined,2000,32768)}});
  const db={storage:{from:bucket=>{const api=client.storage.from(bucket);return {remove:async paths=>{const result=await api.remove(paths);if(result.error)unknown++;return result;},download:path=>api.download(path)};}}};
  const query=async(sql,args)=>{
   let value;
   if(sql.includes('attachment_cleanup_candidates'))value=[id];
   else if(sql.includes('claim_attachment_cleanup')){assert.equal(args[0],id);scope={...base,lease:args[1]};value=scope;}
   else{assert.deepEqual(args,[id,scope.lease,user,epoch,user,base.path,base.mime]);if(sql.includes('attachment_cleanup_current'))value=true;else{assert.ok(sql.includes('complete_attachment_cleanup'));assert.equal(reads,1);acks++;value=true;}}
   return {rows:[{value}]};
  };
  assert.deepEqual(await run(stored(db,query),AbortSignal.timeout(10000)),{attempted:1,completed:1,deferred:0});
  assert.ok(deletes>0);assert.equal(unknown,1);assert.equal(reads,1);assert.equal(acks,1);assert.deepEqual(errors,[]);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
