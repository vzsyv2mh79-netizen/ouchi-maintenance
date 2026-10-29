import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const sdk=process.argv[process.argv.indexOf('--sdk')+1];
assert.ok(sdk&&sdk!=='--sdk','Supply a compatible macOS SDK');
const directory=mkdtempSync(join(tmpdir(),'ouchi-formal-native-push-http-'));
const epoch='11111111-1111-4111-8111-111111111111',registration='22222222-2222-4222-8222-222222222222';
let redirects=0,requests=0;const tokens=[];
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/sink'){redirects++;res.end();return;}
  requests++;assert.ok(['POST','DELETE'].includes(req.method));assert.ok(['/api/native-push-registration','/api/native-push-registration/lookup'].includes(url.pathname));assert.equal(url.search,'');assert.equal(req.headers['x-ouchi-app-epoch'],epoch);
  let bytes='';for await(const chunk of req)bytes+=chunk;const body=JSON.parse(bytes);assert.deepEqual(body,req.method==='POST'?{deviceToken:'ab'.repeat(32)}:{registrationId:registration});
  const token=req.headers.authorization?.replace('Bearer ','');tokens.push(token);
  assert.ok(['fixture','lookup-active','lookup-stopped','lookup-absent','not-disabled','wrong-push','wrong-purchase','wrong-epoch','redirect','oversized-header','oversized-stream','wrong-mime','cached','unauthorized'].includes(token));
  if(token==='redirect'){res.writeHead(302,{location:`http://127.0.0.1:${server.address().port}/sink`});res.end();return;}
  if(token==='unauthorized'){res.writeHead(403);res.end();return;}
  res.setHeader('content-type',token==='wrong-mime'?'text/html':'application/json');res.setHeader('cache-control',token==='cached'?'public':'no-store');
  if(token==='oversized-header'){res.setHeader('content-length','4097');res.end(Buffer.alloc(4097,32));return;}
  if(token==='oversized-stream'){res.write(Buffer.alloc(2048,32));res.end(Buffer.alloc(2049,32));return;}
  if(url.pathname.endsWith('/lookup')){assert.ok(token.startsWith('lookup-'));res.end(JSON.stringify({notificationEnvironment:'Sandbox',purchaseEnvironment:'Sandbox',purchaseAccountToken:epoch,registrationId:token==='lookup-absent'?null:registration,enabled:token==='lookup-active'}));return;}
  res.end(JSON.stringify({notificationEnvironment:token==='wrong-push'?'Production':'Sandbox',purchaseEnvironment:token==='wrong-purchase'?'Production':'Sandbox',purchaseAccountToken:token==='wrong-epoch'?registration:epoch,...(req.method==='POST'?{registrationId:registration}:{disabled:token!=='not-disabled'})}));
 }catch(error){res.writeHead(500);res.end('Fixture failed');console.error(error);}
});

try{
 const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')];
 function compile(args){const result=spawnSync('swiftc',args,{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);}
 const core=join(root,'ios/OuchiCore');
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(name=>name.endsWith('.swift')).sort().map(name=>join(core,name)),'-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 const executable=join(directory,'formal-native-push-http');
 compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/FormalNativePushHTTPIntegration.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{
  const child=spawn(executable,[String(server.address().port)],{env:{...process.env,DYLD_LIBRARY_PATH:directory},stdio:['ignore','pipe','pipe']});let output='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Formal native push HTTP test timed out'));},60000);
  child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error(`Formal native push HTTP failed: ${code} ${output}`));});
 });
 assert.equal(redirects,0);assert.equal(requests,15);assert.equal(new Set(tokens).size,14);
 console.log('Fixture counters: fifteen formal requests (fourteen distinct cases), zero redirected or cancelled requests. No real Auth, ledger, Apple or owner data.');
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});
}
