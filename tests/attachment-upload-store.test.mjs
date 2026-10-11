import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const cache=new Map();function module(path){if(cache.has(path))return cache.get(path);let code=ts.transpileModule(readFileSync(`lib/${path}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from ${JSON.stringify(module(name))}`);const result=url(code);cache.set(path,result);return result;}
const {storedAttachmentUploadServices}=await import(module('attachment-upload-store'));
const {uploadProductAttachment}=await import(module('attachment-upload'));
const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',product='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555';
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600,user_metadata:{premium:true}})).toString('base64url')+'.sig';
function fixture(options={}){
 const calls=[];let object=options.existing?new Blob([bytes],{type:'image/png'}):null,attempt=null,settled=!!options.existing,reads=0;
 const db={auth:{getUser:async()=>({error:options.authFail?Error('invalid'):null,data:{user:{id:user}}})},storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {upload:async(path,body,settings)=>{calls.push('upload');assert.equal(path,`${user}/${epoch}/${id}.png`);assert.equal(settings.upsert,false);object=new Blob([body],{type:'image/png'});return options.writeTimeout?{error:Error('timeout'),data:null}:{error:null,data:{path}};},download:async()=>{calls.push('download');return {error:object?null:Error('absent'),data:options.mismatch&&object?new Blob([new Uint8Array(8)],{type:'image/png'}):object};}};}},rpc:async(name,args)=>{
  calls.push(name);let data;
  if(name==='current_maintenance_purchase_account')data=epoch;
  else if(name==='read_maintenance_verified_entitlement'){assert.equal(args.target_user,user);assert.equal(args.verified_session,session);assert.equal(args.target_epoch,epoch);assert.equal(args.target_environment,'Sandbox');reads++;data=options.free||options.expireAtRead===reads?{plan:'free',environment:'Sandbox'}:{plan:'premium',environment:options.wrongEnvironment?'Production':'Sandbox',productId:'ouchi.premium.monthly',expiresAt:Date.now()+60000};}
  else if(name==='reserve_maintenance_attachment')data=id;
  else if(name==='begin_maintenance_attachment_write'){data={attemptID:args.target_attempt,started:!attempt&&!options.beginDenied,settled:false};attempt??=args.target_attempt;}
  else if(name==='settle_maintenance_attachment_write'){assert.equal(args.target_attempt,attempt);settled=true;return {data:options.settleAckLost?null:true,error:options.settleAckLost?Error('lost'):null};}
  else if(name==='finalize_maintenance_attachment')return {data:settled?id:null,error:settled?null:Error('pending')};
  else throw Error(`unexpected ${name}`);
  return {data,error:null};
 }};
 const run=()=>uploadProductAttachment(new Request('https://example.invalid/upload',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'image/png'},body:bytes}),product,id,storedAttachmentUploadServices(db,'Sandbox'));
 return {run,calls};
}
test('formal adapter verifies server entitlement; editable premium hint cannot grant uploads',async()=>{
 for(const options of [{authFail:true},{free:true},{wrongEnvironment:true}]){const f=fixture(options);assert.equal((await f.run()).status,options.authFail?401:options.free?403:503);assert.ok(!f.calls.includes('reserve_maintenance_attachment'));assert.ok(!f.calls.includes('upload'));}
});
test('entitlement is rechecked before reservation and physical write',async()=>{
 for(const expireAtRead of [2,3]){const f=fixture({expireAtRead});assert.equal((await f.run()).status,503);assert.ok(!f.calls.includes('upload'));}
});
test('successful write requires acknowledgement, settlement, independent readback and finalization',async()=>{
 const f=fixture();assert.equal((await f.run()).status,200);assert.deepEqual(f.calls.filter(x=>x!=='read_maintenance_verified_entitlement'&&x!=='current_maintenance_purchase_account'),['reserve_maintenance_attachment','download','begin_maintenance_attachment_write','upload','settle_maintenance_attachment_write','download','finalize_maintenance_attachment']);
 const first=f.calls.filter(x=>x==='upload').length;assert.equal((await f.run()).status,200);assert.equal(f.calls.filter(x=>x==='upload').length,first);
});
test('uncertain writes remain pending even when the uploaded object can be read',async()=>{
 const f=fixture({writeTimeout:true});assert.equal((await f.run()).status,503);assert.ok(!f.calls.includes('settle_maintenance_attachment_write'));assert.equal((await f.run()).status,503);assert.equal(f.calls.filter(x=>x==='upload').length,1);
});
test('denied begin receipt prevents sending; mismatched content prevents completion',async()=>{
 const denied=fixture({beginDenied:true});assert.equal((await denied.run()).status,503);assert.ok(!denied.calls.includes('upload'));
 const mismatch=fixture({mismatch:true});assert.equal((await mismatch.run()).status,503);assert.ok(!mismatch.calls.includes('finalize_maintenance_attachment'));
});
test('lost settlement response reconciles through a read without resending the object',async()=>{
 const f=fixture({settleAckLost:true});assert.equal((await f.run()).status,200);assert.equal(f.calls.filter(x=>x==='upload').length,1);
});
test('aborted callers cannot authenticate or start a remote write',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 const services=storedAttachmentUploadServices({auth:{getUser:async()=>{throw Error('Auth must not run');}},storage:{from:()=>({})}},'Sandbox',controller.signal);
 const result=await uploadProductAttachment(new Request('https://example.invalid/upload',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'image/png'},body:bytes}),product,id,services);
 assert.equal(result.status,503);assert.deepEqual(f.calls,[]);
});
test('formal adapter rejects a caller-selected unsupported billing environment',()=>{
 assert.throws(()=>storedAttachmentUploadServices({},'Unverified'),/Invalid attachment environment/);
});
