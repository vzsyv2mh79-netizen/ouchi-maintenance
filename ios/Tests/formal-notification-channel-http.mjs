// Actual Swift URLSession and actual server handler; Auth/DB fixture only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),arg=name=>process.argv[process.argv.indexOf(name)+1];
assert.ok(process.argv.includes('--sdk'));const sdk=arg('--sdk'),backend=process.argv.includes('--backend')?resolve(arg('--backend')):root;
const require=createRequire(join(backend,'package.json')),ts=require('typescript'),modules=new Map();
function module(name){if(modules.has(name))return modules.get(name);let code=ts.transpileModule(readFileSync(join(backend,'lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(module(p))).replace("'@supabase/supabase-js'",JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');modules.set(name,url);return url;}
const {notificationChannelResponse:handle}=await import(module('notification-channel-service'));
const user='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
const config={url:'https://synthetic.supabase.co/',key:'synthetic-service',storage:'verified-ledger',environment:'Sandbox'};
const directory=mkdtempSync(join(tmpdir(),'ouchi-channel-http-'));let revision=0,channel='both',nativeRegistered=false,redirects=0,writes=0;const modes=[],rpcNames=[],errors=[],timers=new Set();
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/sink'){redirects++;res.end();return;}
  assert.equal(req.url,'/api/notification-channel');assert.ok(['GET','PUT'].includes(req.method));assert.equal(req.headers['x-ouchi-app-epoch'],epoch);
  const bearer=req.headers.authorization?.slice(7),claims=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString()),mode=claims.fixture;modes.push(mode);assert.equal(claims.sub,user);assert.equal(claims.session_id,session);
  if(mode==='redirect'){res.writeHead(302,{location:`http://127.0.0.1:${server.address().port}/sink`});res.end();return;}
  if(mode==='registered')nativeRegistered=true;
  let authChecks=0;
  const factory=()=>({auth:{getUser:async token=>{assert.equal(token,bearer);authChecks++;return {data:{user:mode==='changed-auth'&&authChecks===2?null:{id:user}}};}},rpc:async(name,args)=>{
   rpcNames.push(name);assert.equal(args.target_user,user);assert.equal(args.verified_session,session);
   if(name==='current_maintenance_purchase_account')return {data:mode==='changed-enrollment'?session:epoch};
   assert.equal(args.target_epoch,epoch);assert.equal(args.target_environment,'Sandbox');
   const receipt=()=>({environment:'Sandbox',revision,channel,nativeRegistered});
   if(name==='read_maintenance_notification_channel')return {data:receipt()};
   assert.equal(name,'save_maintenance_notification_channel');
   if(args.expected_revision+1===revision&&args.selected_channel===channel)return {data:receipt()};
   if(args.expected_revision!==revision)return {error:{code:'P0001',message:'Settings changed; reload required'}};
   if(args.selected_channel==='native'&&!nativeRegistered)return {error:{code:'P0001',message:'iPhone registration required'}};
   writes++;revision++;channel=args.selected_channel;return {data:receipt()};
  }});
  let body=Buffer.alloc(0);for await(const chunk of req){body=Buffer.concat([body,chunk]);assert.ok(body.length<=4096);}
  const signal=new AbortController();res.on('close',()=>{if(!res.writableEnded)signal.abort();});
  const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:body.length?body:undefined,signal:signal.signal});
  const response=await handle(request,config,factory);
  if(mode==='lost-ack'){assert.equal(response.status,200);res.writeHead(503);res.end('{}');return;}
  const send=async()=>{
   if(res.destroyed)return;
   let data=Buffer.from(await response.arrayBuffer()),headers=Object.fromEntries(response.headers);
   if(['wrong-environment','wrong-receipt-epoch','extra'].includes(mode)){const value=JSON.parse(data);if(mode==='wrong-environment')value.environment='Production';if(mode==='wrong-receipt-epoch')value.purchaseAccountToken=session;if(mode==='extra')value.extra=true;data=Buffer.from(JSON.stringify(value));}
   if(mode==='mime')headers['content-type']='text/html';if(mode==='cache')headers['cache-control']='public';
   if(mode==='declared-large'){headers['content-length']='4097';data=Buffer.alloc(4097,32);}
   res.writeHead(response.status,headers);
   if(mode==='stream-large'){res.write(Buffer.alloc(2048,32));res.end(Buffer.alloc(2049,32));}else res.end(data);
  };
  if(mode==='delayed-save'){const timer=setTimeout(()=>{timers.delete(timer);void send().catch(error=>errors.push(error));},2000);timers.add(timer);}else await send();
 }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('Fixture failed');}
});
try{
 const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')],core=join(root,'ios/OuchiCore');
 const compile=args=>{const result=spawnSync('swiftc',args,{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);};
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(name=>name.endsWith('.swift')).sort().map(name=>join(core,name)),'-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 const executable=join(directory,'channel-http');compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/FormalNotificationChannelHTTPIntegration.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{const child=spawn(executable,[String(server.address().port)],{env:{...process.env,DYLD_LIBRARY_PATH:directory},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Channel HTTP timeout'));},60000);child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Channel HTTP failed: '+code+' '+output));});});
 assert.deepEqual(errors,[]);assert.equal(redirects,0);assert.equal(modes.length,20);assert.equal(new Set(modes).size,20);assert.ok(!modes.includes('precancel'));assert.ok(modes.includes('delayed-save'));assert.equal(writes,4);assert.equal(revision,4);assert.equal(channel,'web');assert.ok(rpcNames.every(name=>['current_maintenance_purchase_account','read_maintenance_notification_channel','save_maintenance_notification_channel'].includes(name)));
 console.log('PASS: 20 actual loopback requests, four durable fixture changes, idempotent lost-ack retry, zero redirect/precancel requests; no premium RPC, Auth server, Apple or owner data.');
}finally{for(const timer of timers)clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
