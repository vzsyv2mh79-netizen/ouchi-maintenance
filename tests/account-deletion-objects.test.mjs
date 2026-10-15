import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';import {createServer} from 'node:http';import {createClient,StorageApiError} from '@supabase/supabase-js';
const code=ts.transpileModule(readFileSync('lib/account-deletion-objects.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
const {eraseAccountDeletionObjects:erase}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const fetchCode=ts.transpileModule(readFileSync('lib/attachment-fetch.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createAttachmentFetch}=await import('data:text/javascript;base64,'+Buffer.from(fetchCode).toString('base64'));
const scope={requestID:'11111111-1111-4111-8111-111111111111',userID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',leaseToken:'44444444-4444-4444-8444-444444444444'};
const id='55555555-5555-4555-8555-555555555555',path=`${scope.userID}/${scope.epochID}/${id}.png`,item={id,uploaderID:scope.userID,uploaderEpoch:scope.epochID,bucket:'ouchi-product-attachments',path};
for(const mode of ['error-result','thrown'])test('ambiguous Storage remove '+mode+' recovers only by definitive absence and durable same-scope acknowledgement',async()=>{
 let pending=true,reads=0,acks=0;
 const db={rpc:async(name,args)=>{
  assert.equal(args.target_request,scope.requestID);assert.equal(args.target_lease,scope.leaseToken);
  if(name==='maintenance_deletion_lease_is_current')return {data:true,error:null};
  if(name==='read_maintenance_deletion_objects')return {data:pending?[item]:[],error:null};
  assert.equal(name,'confirm_maintenance_deletion_object_absence');assert.equal(args.target_attachment,id);acks++;pending=false;return {data:true,error:null};
 },storage:{from:bucket=>{
  assert.equal(bucket,'ouchi-product-attachments');return {remove:async paths=>{assert.deepEqual(paths,[path]);if(mode==='thrown')throw Error('Response lost after removal');return {error:Error('Response lost after removal')};},
   download:async target=>{assert.equal(target,path);reads++;return {data:null,error:new StorageApiError('synthetic absence',404,'404','storage','NoSuchKey')};}};
 }}};
 assert.deepEqual(await erase(db,scope),{completed:1,allObjectsConfirmed:true});assert.equal(reads,1);assert.equal(acks,1);
});

test('ambiguous removal cannot bypass inaccessible/present objects, cancellation or an expired lease',async()=>{
 for(const failure of ['access','present','lease','cancel']){
  const controller=new AbortController();let guards=0,reads=0,acks=0;
  const db={rpc:async name=>{
   if(name==='maintenance_deletion_lease_is_current')return {data:!(failure==='lease'&&++guards>2),error:null};
   if(name==='read_maintenance_deletion_objects')return {data:[item],error:null};
   acks++;return {data:true,error:null};
  },storage:{from:()=>({remove:async()=>{if(failure==='cancel')controller.abort();return {error:Error('Unknown removal')};},download:async()=>{reads++;return {data:failure==='present'?new Blob(['present']):null,error:new StorageApiError('synthetic',404,'404','storage',failure==='access'?'AccessDenied':'NoSuchKey')};}})}};
  await assert.rejects(erase(db,scope,controller.signal));assert.equal(acks,0);assert.equal(reads,failure==='lease'||failure==='cancel'?0:1);
 }
});

test('object erasure only acknowledges explicit SDK absence and exact scoped durable completion',async()=>{
 for(const failure of ['none','remove','access','present','ack','lease','path']){
  let pending=true,removes=0,acknowledgements=0,guards=0;
  const db={rpc:async(name,args)=>{assert.equal(args.target_request,scope.requestID);assert.equal(args.target_epoch,scope.epochID);if(name==='maintenance_deletion_lease_is_current')return {data:!(failure==='lease'&&++guards>2),error:null};if(name==='read_maintenance_deletion_objects')return {data:pending?[{...item,path:failure==='path'?'../../other':path}]:[],error:null};assert.equal(name,'confirm_maintenance_deletion_object_absence');assert.equal(args.target_attachment,id);acknowledgements++;if(failure==='ack')return {data:false,error:null};pending=false;return {data:true,error:null};},storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {remove:async paths=>{assert.deepEqual(paths,[path]);removes++;return {error:failure==='remove'?Error('outage'):null};},download:async()=>({data:failure==='present'?new Blob(['present']):null,error:new StorageApiError('synthetic',404,'404','storage',failure==='access'?'AccessDenied':'NoSuchKey')})};}}};
  if(failure==='none'||failure==='remove'){assert.deepEqual(await erase(db,scope),{completed:1,allObjectsConfirmed:true});assert.equal(acknowledgements,1);}else{await assert.rejects(()=>erase(db,scope));assert.equal(acknowledgements,failure==='ack'?1:0);}
  if(failure==='path')assert.equal(removes,0);
 }
});

test('actual pinned Storage SDK and HTTP socket loss reconcile only through SDK NoSuchKey before acknowledgement',async()=>{
 let pending=true,present=true,deletes=0,downloads=0,unknownResults=0,acks=0;const errors=[];
 const server=createServer(async(request,response)=>{
  try{
   if(request.method==='DELETE'&&request.url==='/storage/v1/object/ouchi-product-attachments'){
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)),{prefixes:[path]});
    deletes++;present=false;response.destroy();return;
   }
   assert.equal(request.method,'GET');assert.ok([
    '/storage/v1/object/ouchi-product-attachments/'+path,
    '/storage/v1/object/authenticated/ouchi-product-attachments/'+path,
   ].includes(request.url));
   assert.equal(present,false);downloads++;
   response.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({statusCode:'404',code:'NoSuchKey',error:'Not Found',message:'Synthetic object absent'}));
  }catch(error){errors.push(error);if(!response.destroyed)response.writeHead(500).end();}
 });
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const client=createClient('http://127.0.0.1:'+server.address().port,'synthetic-sdk-only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:createAttachmentFetch(undefined,2000,32768)}});
  const db={rpc:async(name,args)=>{
   assert.equal(args.target_request,scope.requestID);assert.equal(args.target_lease,scope.leaseToken);
   if(name==='maintenance_deletion_lease_is_current')return {data:true,error:null};
   if(name==='read_maintenance_deletion_objects')return {data:pending?[item]:[],error:null};
   assert.equal(name,'confirm_maintenance_deletion_object_absence');assert.equal(downloads,1);assert.equal(args.target_attachment,id);acks++;pending=false;return {data:true,error:null};
  },storage:{from:bucket=>{const api=client.storage.from(bucket);return {remove:async paths=>{const result=await api.remove(paths);if(result.error)unknownResults++;return result;},download:target=>api.download(target)};}}};
  assert.deepEqual(await erase(db,scope),{completed:1,allObjectsConfirmed:true});
  assert.ok(deletes>=1);assert.equal(unknownResults,1);assert.equal(downloads,1);assert.equal(acks,1);assert.deepEqual(errors,[]);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
