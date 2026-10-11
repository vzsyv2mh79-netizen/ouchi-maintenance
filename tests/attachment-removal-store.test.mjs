import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';import {StorageApiError} from '@supabase/supabase-js';
const cache=new Map();function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(compile(name))}`).replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}
const {storedAttachmentRemovalServices}=await import(compile('attachment-removal-store'));
const {removeProductAttachment}=await import(compile('attachment-removal'));
const id='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',session='44444444-4444-4444-8444-444444444444';
const scope={id,user,epoch,path:`${user}/${epoch}/${id}.png`,mime:'image/png'};
const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.sig';
function fixture(options={}){
 const calls=[];let begins=0;
 const db={auth:{getUser:async()=>({data:{user:{id:user}},error:null})},storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {remove:async paths=>{calls.push('remove');assert.deepEqual(paths,[scope.path]);return {error:options.removeTimeout?Error('timeout'):null};},download:async()=>{calls.push('download');return {data:options.present?new Blob(['present']):null,error:options.generic404?{code:'NoSuchKey',status:404}:new StorageApiError('Object not found',404,'404','storage','NoSuchKey')};}};}},rpc:async(name,args)=>{
  calls.push(name);assert.equal(args.target_user,user);assert.equal(args.verified_session,session);
  if(name==='current_maintenance_purchase_account')return {data:epoch,error:null};
  assert.equal(args.expected_epoch,epoch);assert.equal(args.target_attachment,id);
  if(name==='begin_maintenance_attachment_removal'){begins++;return {data:options.revoke&&begins>1?null:options.wrongPath?{...scope,path:'other/file'}:scope,error:null};}
  if(name==='complete_maintenance_attachment_removal'){assert.equal(args.confirmed_path,scope.path);return {data:!options.ackLost,error:options.ackLost?Error('timeout'):null};}
  throw Error('Unexpected RPC');
 }};
 return {calls,run:()=>removeProductAttachment(new Request('https://example.invalid/file',{method:'DELETE',headers:{authorization:'Bearer '+token,'X-Ouchi-App-Epoch':epoch}}),id,storedAttachmentRemovalServices(db))};
}
test('adapter requires exact SDK absence and never infers missing bytes from general404 or timeout',async()=>{
 for(const options of [{generic404:true},{present:true},{ackLost:true},{removeTimeout:true},{}]){
  const f=fixture(options);const response=await f.run();assert.equal(response.status,options.generic404||options.present||options.ackLost?503:200);
  if(options.generic404||options.present)assert.ok(!f.calls.includes('complete_maintenance_attachment_removal'));
 }
});
test('current removal authority is rechecked before physical deletion and completion',async()=>{
 for(const options of [{revoke:true},{wrongPath:true}]){const f=fixture(options);assert.equal((await f.run()).status,503);assert.ok(!f.calls.includes('remove'));assert.ok(!f.calls.includes('complete_maintenance_attachment_removal'));}
});
