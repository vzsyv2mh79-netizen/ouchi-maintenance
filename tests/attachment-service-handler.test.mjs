import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function compile(name){
 if(cache.has(name))return cache.get(name);
 let code=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,target)=>`from ${JSON.stringify(compile(target))}`);
 code=code.replaceAll("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')));
 const value='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,value);return value;
}
const {attachmentDeployment,attachmentServiceResponse}=await import(compile('attachment-service-handler'));
const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',id='55555555-5555-4555-8555-555555555555';
const config={url:'https://synthetic.supabase.co',key:'synthetic',storage:'verified-ledger',environment:'Production'};
const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.sig';
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
function fixture({loseMembership=false,free=true}={}){
 const calls=[];let metadataReads=0;
 const metadata={id,user,epoch,size:bytes.length,mime:'image/png',sha256:createHash('sha256').update(bytes).digest('hex')};
 const db={auth:{getUser:async value=>{assert.equal(value,token);calls.push('auth');return {data:{user:{id:user}},error:null};}},rpc:async(name,args)=>{
  calls.push(name);assert.equal(args.target_user,user);assert.equal(args.verified_session,session);
  if(name==='current_maintenance_purchase_account')return {data:epoch,error:null};
  assert.equal(args.expected_epoch??args.target_epoch,epoch);
  if(name==='read_maintenance_attachment')return {data:loseMembership&&++metadataReads>1?null:metadata,error:null};
  if(name==='read_maintenance_verified_entitlement'){assert.equal(args.target_environment,'Production');return {data:free?{plan:'free',environment:'Production'}:{plan:'premium',environment:'Production',productId:'ouchi.premium.monthly',expiresAt:Date.now()+60000},error:null};}
  throw Error(`Unexpected RPC ${name}`);
 },storage:{from:bucket=>{assert.equal(bucket,'ouchi-product-attachments');return {download:async path=>{calls.push('download');assert.equal(path,`${user}/${epoch}/${id}.png`);return {data:new Blob([bytes],{type:'image/png'}),error:null};}};}}};
 return {db,calls};
}
test('disabled or invalid deployment never constructs a database or attempts a network call',async()=>{
 assert.equal(attachmentDeployment(config,undefined),null);
 for(const patch of [{storage:'sandbox-legacy'},{url:'http://127.0.0.1:54321'},{url:'https://synthetic.supabase.co.evil.invalid'},{url:'https://user:secret@synthetic.supabase.co'},{url:'https://synthetic.supabase.co?x=1'},{environment:'Unverified'},{key:''}])assert.equal(attachmentDeployment({...config,...patch},'true'),null);
 assert.deepEqual(attachmentDeployment(config,'true'),config);
 let calls=0;const response=await attachmentServiceResponse(new Request('https://example.invalid/api/product-attachments'),null,()=>{calls++;throw Error('disabled');});
 assert.equal(response.status,503);assert.equal(calls,0);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('method and ambiguous query reject before database construction',async()=>{
 for(const [method,query,status] of [['PATCH','',405],['POST',`?productId=${id}&productId=${user}&attachmentId=${id}`,400],['GET','?usage=true&unknown=true',400],['DELETE',`?attachmentId=${id}&productId=${user}`,400]]){
  let calls=0;const response=await attachmentServiceResponse(new Request('https://example.invalid/api/product-attachments'+query,{method}),config,()=>{calls++;throw Error('invalid request');});assert.equal(response.status,status);assert.equal(calls,0);
 }
});
test('expired subscription still permits retained-file export with live access checks',async()=>{
 const f=fixture();const response=await attachmentServiceResponse(new Request(`https://example.invalid/api/product-attachments?attachmentId=${id}`,{headers:{authorization:`Bearer ${token}`}}),config,()=>f.db);
 assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 assert.equal(f.calls.filter(x=>x==='read_maintenance_attachment').length,2);
 assert.ok(!f.calls.includes('read_maintenance_verified_entitlement'));
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
});
test('membership lost during object read prevents returning private bytes',async()=>{
 const f=fixture({loseMembership:true});const response=await attachmentServiceResponse(new Request(`https://example.invalid/api/product-attachments?attachmentId=${id}`,{headers:{authorization:`Bearer ${token}`}}),config,()=>f.db);
 assert.equal(response.status,404);assert.notEqual(response.headers.get('content-type'),'image/png');
});
test('new uploads check Production ledger and reject free access before Storage',async()=>{
 const f=fixture();const response=await attachmentServiceResponse(new Request(`https://example.invalid/api/product-attachments?productId=${user}&attachmentId=${id}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'image/png','X-Ouchi-App-Epoch':epoch},body:bytes}),config,()=>f.db);
 assert.equal(response.status,403);assert.ok(f.calls.includes('read_maintenance_verified_entitlement'));assert.ok(!f.calls.includes('download'));
});
test('formal mutations require a valid expected enrollment before constructing a database',async()=>{
 for(const method of ['POST','DELETE'])for(const epochHeader of [null,'bad','00000000-0000-0000-0000-000000000000',epoch+','+user]){
  let constructed=0;const headers=epochHeader===null?{}:{'X-Ouchi-App-Epoch':epochHeader};
  const response=await attachmentServiceResponse(new Request(`https://example.invalid/api/product-attachments?attachmentId=${id}`,{method,headers}),config,()=>{constructed++;throw Error('invalid enrollment');});
  assert.equal(response.status,400);assert.equal(constructed,0);
 }
});
test('same Auth user with a different enrollment cannot upload or erase old pending files',async()=>{
 for(const method of ['POST','DELETE']){
  const f=fixture({free:false});const headers={authorization:`Bearer ${token}`,'content-type':'image/png','X-Ouchi-App-Epoch':user};
  const response=await attachmentServiceResponse(new Request(`https://example.invalid/api/product-attachments?attachmentId=${id}${method==='POST'?`&productId=${id}`:''}`,{method,headers,body:method==='POST'?bytes:undefined}),config,()=>f.db);
  assert.notEqual(response.status,200);assert.deepEqual(f.calls,['auth','current_maintenance_purchase_account']);
 }
});
