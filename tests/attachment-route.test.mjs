import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const reader=url(compile('lib/product-attachment.ts')),sessionModule=url(compile('lib/verified-app-session.ts'));
const upload=url(compile('lib/attachment-upload.ts').replace("'./product-attachment'",JSON.stringify(reader)));
const binding=url(compile('lib/billing-account.ts').replace("'./verified-app-session'",JSON.stringify(sessionModule)));
const sdk=url(`export function createClient(){const h=globalThis.attachmentRouteHarness;h.clients++;const query={eq(){return query;},then(resolve){resolve({data:h.rows,error:null});}};return {auth:{getUser:async()=>({data:{user:{id:h.user}},error:h.authError})},from:()=>({select:()=>query}),rpc:async(name,args)=>{h.rpc.push(name);return {data:name==='current_maintenance_purchase_account'?h.epoch:args.attachment_id,error:null}},storage:{from:()=>({upload:async(path,bytes,options)=>{h.uploads++;h.path=path;if(options.upsert!==false)throw Error("overwrite allowed");h.blob=new Blob([bytes],{type:options.contentType});return {error:null}},download:async()=>({data:h.blob,error:h.blob?null:Error('not found')})})}};}`);
let source=compile('app/api/development/product-attachments/route.ts');
for(const [path,module] of [['@supabase/supabase-js',sdk],['@/lib/attachment-upload',upload],['@/lib/product-attachment',reader],['@/lib/verified-app-session',sessionModule],['@/lib/billing-account',binding],['@/lib/billing',url(compile('lib/billing.ts'))]])source=source.replaceAll("'"+path+"'",JSON.stringify(module));
const {POST}=await import(url(source));
test('actual attachment route refuses production/shared config and wires authenticated epoch rights to create-only storage',async()=>{
 const keys=['NODE_ENV','OUCHI_ATTACHMENT_TEST_MODE','OUCHI_ATTACHMENT_TEST_URL','OUCHI_ATTACHMENT_TEST_SERVICE_KEY'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',product='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555';
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const token=encode({alg:'HS256'})+'.'+encode({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+60})+'.c3ludGhldGlj';
 const h=globalThis.attachmentRouteHarness={user,epoch,authError:null,rows:[],clients:0,uploads:0,rpc:[],blob:null,path:null};
 const request=()=>new Request(`http://127.0.0.1:3000/api/development/product-attachments?productId=${product}&attachmentId=${id}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10])});
 try{
  Object.assign(process.env,{NODE_ENV:'production',OUCHI_ATTACHMENT_TEST_MODE:'true',OUCHI_ATTACHMENT_TEST_URL:'http://127.0.0.1:54321',OUCHI_ATTACHMENT_TEST_SERVICE_KEY:'synthetic'});assert.equal((await POST(request())).status,503);assert.equal(h.clients,0);
  process.env.NODE_ENV='development';process.env.OUCHI_ATTACHMENT_TEST_URL='https://example.supabase.co';assert.equal((await POST(request())).status,503);assert.equal(h.clients,0);
  process.env.OUCHI_ATTACHMENT_TEST_URL='http://127.0.0.1:54321';h.authError=Error('invalid');assert.equal((await POST(request())).status,401);assert.equal(h.uploads,0);h.authError=null;
  assert.equal((await POST(request())).status,403);assert.equal(h.uploads,0);
  const now=Date.now();h.rows=[{payload:{transactionId:'1',originalTransactionId:'1',accountToken:epoch,environment:'Sandbox',productId:'ouchi.premium.monthly',signedAt:now,purchasedAt:now,expiresAt:now+60000}}];
  const result=await POST(request());assert.equal(result.status,200);assert.equal(h.uploads,1);assert.equal(h.path,`${user}/${epoch}/${id}.png`);assert.ok(h.rpc.includes('reserve_maintenance_attachment'));assert.ok(h.rpc.includes('finalize_maintenance_attachment'));
 }finally{delete globalThis.attachmentRouteHarness;for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
