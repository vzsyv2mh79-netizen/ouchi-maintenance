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
const directory=mkdtempSync(join(tmpdir(),'ouchi-attachment-http-'));
const account='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222',product='44444444-4444-4444-8444-444444444444',attachment='55555555-5555-4555-8555-555555555555';
const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
let redirects=0,uploads=0,downloads=0,removals=0,requests=0;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/sink'){redirects++;res.end();return;}
  requests++;assert.equal(url.pathname,'/api/development/verified-product-attachments');
  const token=req.headers.authorization;
  if(token==='Bearer redirect'){res.writeHead(302,{location:`http://127.0.0.1:${server.address().port}/sink`});res.end();return;}
  if(token==='Bearer oversized-control'){res.writeHead(200,{'content-type':'application/json'});res.write(Buffer.alloc(4097,32));res.end();return;}
  if(token==='Bearer oversized-header'){res.writeHead(200,{'content-length':'5000'});res.end(Buffer.alloc(5000,32));return;}
  assert.equal(token,'Bearer fixture');
  if(url.searchParams.has('binding')){res.setHeader('content-type','application/json');res.end(JSON.stringify({account,epoch}));return;}
  assert.equal(url.searchParams.get('attachmentId'),attachment);
  if(req.method==='POST'){
   assert.equal(req.headers['x-ouchi-app-epoch'],epoch);
   assert.equal(url.searchParams.get('productId'),product);assert.equal(req.headers['content-type'],'image/png');
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   assert.deepEqual(Buffer.concat(chunks),bytes);uploads++;
   res.end(JSON.stringify({saved:true,attachmentId:attachment}));return;
  }
  if(req.method==='DELETE'){assert.equal(req.headers['x-ouchi-app-epoch'],epoch);removals++;res.end(JSON.stringify({removed:true,attachmentId:attachment}));return;}
  assert.equal(req.method,'GET');downloads++;
  res.writeHead(200,{'content-type':'image/png','content-disposition':`attachment; filename="ouchi-attachment-${attachment}.png"`});res.end(bytes);
 }catch(error){res.writeHead(500);res.end('Fixture failed');console.error(error);}
});
try{
 const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')];
 function compile(args){const result=spawnSync('swiftc',args,{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);}
 const core=join(root,'ios/OuchiCore');
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(name=>name.endsWith('.swift')).sort().map(name=>join(core,name)),'-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 const executable=join(directory,'attachment-http');
 compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/AttachmentHTTPIntegration.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{
  const child=spawn(executable,[String(server.address().port)],{env:{...process.env,DYLD_LIBRARY_PATH:directory},stdio:['ignore','pipe','pipe']});let output='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Attachment HTTP test timed out'));},60000);
  child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error(`Attachment HTTP failed: ${code} ${output}`));});
 });
 assert.equal(redirects,0);assert.equal(uploads,1);assert.equal(downloads,1);assert.equal(removals,1);assert.equal(requests,7);
 console.log('Fixture counters: one upload/download/remove, seven requests, zero redirected or cancelled requests. No real Auth, Storage, Apple or owner data.');
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});
}
