import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {StorageApiError} from '@supabase/supabase-js';
import ts from 'typescript';
const modules=new Map();function compile(name){if(modules.has(name))return modules.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(compile(dep))).replaceAll("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;}
const {removeHouseholdAttachmentResponse}=await import(compile('household-attachment-removal'));
const {attachmentServiceResponse}=await import(compile('attachment-service-handler'));
const {readHouseholdAttachmentResponse}=await import(compile('household-attachment-read-handler'));
function fixture(options={}){
 const user=randomUUID(),session=randomUUID(),epoch=randomUUID(),id=randomUUID(),homeID=randomUUID(),homeInstanceID=randomUUID(),productID=randomUUID(),calls=[];
 const pending={phase:'pending',id,homeID,homeInstanceID,productID,size:31,mime:'application/pdf',sha256:'a'.repeat(64),objectPath:`households/${homeInstanceID}/${id}.pdf`},removed={phase:'removed',id,homeID,homeInstanceID,productID};let complete=!!options.alreadyRemoved,begins=0;
 const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.sig';
 const request=()=>new Request('https://example.invalid/api/product-attachments?scope=household&attachmentId='+id,{method:'DELETE',headers:{Authorization:'Bearer '+token,'X-Ouchi-App-Epoch':epoch}});
 const db={auth:{getUser:async()=>({data:{user:{id:user}},error:null})},rpc:async(name,args)=>{
  calls.push(name);assert.equal(args.target_user,user);assert.equal(args.verified_session,session);
  if(name==='read_maintenance_explicit_enrollment')return {data:epoch,error:null};
  assert.equal(args.expected_epoch,epoch);
  if(name==='page_maintenance_household_attachment_removals')return {data:{items:[{id,size:31,mime:'application/pdf',createdAt:'2026-10-17T00:00:00Z'}],next:null},error:null};
  assert.equal(args.target_attachment,id);
  if(name==='begin_maintenance_household_attachment_removal'){begins++;return {data:options.denied||options.revoke&&begins>1?null:complete?removed:options.wrongPath?{...pending,objectPath:'households/foreign/file.pdf'}:pending,error:null};}
  assert.equal(name,'complete_maintenance_household_attachment_removal');assert.equal(args.expected_home_instance,homeInstanceID);assert.equal(args.confirmed_path,pending.objectPath);if(options.rejectComplete)return {data:false,error:null};complete=true;if(options.lostCommit)throw Error('Synthetic committed reply lost');return {data:true,error:null};
 },storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {remove:async paths=>{calls.push('remove');assert.deepEqual(paths,[pending.objectPath]);if(options.lostDelete)throw Error('Synthetic delete reply lost');return {error:null};},download:async path=>{calls.push('download');assert.equal(path,pending.objectPath);return {data:options.present?new Blob(['present']):null,error:options.absenceError??new StorageApiError('synthetic',400,'404','storage','NoSuchKey')};}};}}};
 return {id,user,epoch,productID,calls,db,request,run:()=>removeHouseholdAttachmentResponse(request(),id,db)};
}
test('exact current household receipt recovers lost delete/SQL replies and repeat does not send another delete',async()=>{
 for(const options of [{},{lostDelete:true},{lostCommit:true}]){const f=fixture(options);assert.equal((await f.run()).status,200);assert.equal((await f.run()).status,200);assert.equal(f.calls.filter(x=>x==='remove').length,1);assert.equal(f.calls.filter(x=>x==='complete_maintenance_household_attachment_removal').length,1);}
 const prior=fixture({alreadyRemoved:true});assert.equal((await prior.run()).status,200);assert.equal(prior.calls.includes('remove'),false);
});
test('wrong namespace, withdrawn membership, remaining bytes and ambiguous NoSuchKey cannot complete removal',async()=>{
 for(const options of [{denied:true},{revoke:true},{wrongPath:true},{present:true},{rejectComplete:true},...[[500,'404'],[403,'404'],[404,'500'],[400,undefined]].map(([status,semantic])=>({absenceError:new StorageApiError('synthetic',status,semantic,'storage','NoSuchKey')}))]){
  const f=fixture(options);assert.equal((await f.run()).status,options.denied?404:503);if(!options.rejectComplete)assert.equal(f.calls.includes('complete_maintenance_household_attachment_removal'),false);if(options.denied||options.revoke||options.wrongPath)assert.equal(f.calls.includes('remove'),false);
 }
});
test('household DELETE is explicit, malformed scopes never construct a service, and pending list is typed',async()=>{
 const f=fixture(),config={url:'https://example.supabase.co',key:'synthetic',environment:'Sandbox',storage:'verified-ledger'};
 const response=await attachmentServiceResponse(f.request(),config,()=>f.db);assert.equal(response.status,200);assert.deepEqual(await response.json(),{removed:true,attachmentId:f.id,scope:'household'});
 let clients=0;for(const query of ['scope=personal&attachmentId='+f.id,'scope=household&scope=household&attachmentId='+f.id,'pending=true&attachmentId='+f.id])assert.equal((await attachmentServiceResponse(new Request('https://example.invalid/?'+query,{method:'DELETE',headers:{'X-Ouchi-App-Epoch':f.epoch}}),config,()=>{clients++;return f.db;})).status,400);assert.equal(clients,0);
 const list=await readHouseholdAttachmentResponse(new Request('https://example.invalid/?scope=household&pending=true&productId='+f.productID+'&page=true',{headers:Authorization(f.request())}),f.db);assert.equal(list.status,200);const data=await list.json();assert.equal(data.items[0].scope,'household');assert.equal(data.items[0].removalPending,true);
});
function Authorization(request){return {Authorization:request.headers.get('authorization')};}
