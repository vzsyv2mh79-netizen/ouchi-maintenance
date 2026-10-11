// Real loopback HTTP between the Swift URLSession adapter and the actual server
// handler. Identity/ledger dependencies are synthetic, not Supabase or Apple.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const backendFlag=process.argv.indexOf('--backend');
const backend=backendFlag<0?root:resolve(process.argv[backendFlag+1]);
const sdkFlag=process.argv.indexOf('--sdk');
assert.ok(sdkFlag>=0,'macOS SDK required');
const sdk=process.argv[sdkFlag+1];
const ts=createRequire(join(backend,'package.json'))('typescript');
const modules=new Map();
function module(name){
 if(modules.has(name))return modules.get(name);
 let code=ts.transpileModule(readFileSync(join(backend,'lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(module(p)));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;
}
const {handleReminderSettings,freeReminderSchedule,ReminderSettingsError}=await import(module('reminder-settings'));
const {entitlementFromTransactions}=await import(module('billing'));
const scope={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333'};
let revision=0,saved=null,premium=true,reads=0,writes=0,redirected=0,billingReads=0;
const purchasedAt=Date.now()-60000;
const transaction={transactionId:'synthetic-transaction',originalTransactionId:'synthetic-original',productId:'ouchi.premium.monthly',accountToken:scope.epochID,environment:'Sandbox',signedAt:purchasedAt,purchasedAt,expiresAt:purchasedAt+3600000};
const receipt=()=>({environment:'Sandbox',revision,saved,premiumActive:premium,effective:premium?(saved??freeReminderSchedule):freeReminderSchedule});
const deps={verify:async bearer=>bearer==='synthetic'?scope:null,read:async()=>receipt(),save:async(s,expected,chosen)=>{
 assert.deepEqual(s,scope);assert.ok(Object.isFrozen(s));writes++;
 if(!premium)throw new ReminderSettingsError('premium');
 if(expected!==revision){if(expected+1===revision&&JSON.stringify(chosen)===JSON.stringify(saved))return receipt();throw new ReminderSettingsError('conflict');}
 saved=chosen;revision++;return receipt();
}};
const directory=mkdtempSync(join(tmpdir(),'ouchi-reminder-http-'));
function compile(args){const result=spawnSync('swiftc',args,{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);}
const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')];
const core=join(root,'ios/OuchiCore');
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/redirect-target'){redirected++;res.writeHead(500);res.end();return;}
  assert.equal(req.headers.authorization,'Bearer synthetic');
  if(req.url==='/api/billing/entitlement'){
   assert.equal(req.method,'GET');billingReads++;
   const inactive=!premium?(billingReads===2?{expiresAt:Date.now()-1}:{revokedAt:Date.now()}):{};
   const state=entitlementFromTransactions([{...transaction,...inactive}],Date.now(),'Sandbox');
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(JSON.stringify({...state,environment:'Sandbox',salesEnabled:false,purchaseAccountToken:scope.epochID}));return;
  }
  assert.equal(req.url,'/api/development/reminder-settings');
  if(req.method==='GET'){
   reads++;
   if(reads===2)premium=false;
   if(reads===3){res.writeHead(302,{Location:'/redirect-target'});res.end();return;}
  }
  let body=Buffer.alloc(0);
  for await(const chunk of req){body=Buffer.concat([body,chunk]);assert.ok(body.length<=4096);}
  const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:body.length?body:undefined});
  const response=await handleReminderSettings(request,deps);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end();}
});
try{
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(f=>f.endsWith('.swift')).sort().map(f=>join(core,f)),'-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 const executable=join(directory,'reminder-http');
 compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/ReminderHTTPIntegration.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;
 await new Promise((resolve,reject)=>{
  const child=spawn(executable,[String(port)],{stdio:['ignore','pipe','pipe']});let output='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Native HTTP test timed out'));},60000);
  child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>{output+=data;});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native HTTP failed: '+code+' '+output));});
 });
 assert.equal(revision,1);assert.equal(writes,4);assert.equal(reads,3);assert.equal(billingReads,3);assert.equal(redirected,0);
 console.log('Actual server handler received bounded authenticated HTTP; redirect destination received zero requests. No real Auth/Apple/records.');
}finally{
 await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});
}
