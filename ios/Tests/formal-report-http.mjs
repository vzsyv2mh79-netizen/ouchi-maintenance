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
const directory=mkdtempSync(join(tmpdir(),'ouchi-formal-report-http-'));
const home='11111111-1111-4111-8111-111111111111',epoch='22222222-2222-4222-8222-222222222222';
const report={homeId:home,homeName:'Fixture home',generatedAt:'2026-10-10T00:00:00.000Z',today:'2026-10-10',productCount:1,taskCount:2,overdue:1,dueToday:1,
 months:[5,6,7,8,9,10].map(month=>({month:`2026-${String(month).padStart(2,'0')}`,completed:1})),
 perProduct:[{productId:'33333333-3333-4333-8333-333333333333',name:'Fixture purifier',completedThisMonth:1,overdue:1,dueToday:1}],explanation:'Recorded maintenance counts'};
let redirects=0,requests=0;const tokens=[];
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/sink'){redirects++;res.end();return;}
  requests++;assert.equal(req.method,'GET');assert.equal(url.pathname,'/api/maintenance-report');
  assert.deepEqual([...url.searchParams],[['homeId',home]]);assert.equal(req.headers['x-ouchi-app-epoch'],epoch);
  const token=req.headers.authorization?.replace('Bearer ','');tokens.push(token);
  assert.ok(['fixture','wrong-environment','wrong-epoch','redirect','oversized-header','oversized-stream','wrong-mime','cached','unauthorized'].includes(token));
  if(token==='redirect'){res.writeHead(302,{location:`http://127.0.0.1:${server.address().port}/sink`});res.end();return;}
  if(token==='unauthorized'){res.writeHead(403);res.end();return;}
  res.setHeader('content-type',token==='wrong-mime'?'text/html':'application/json');res.setHeader('cache-control',token==='cached'?'public':'no-store');
  if(token==='oversized-header'){res.setHeader('content-length','2000001');res.end(Buffer.alloc(2000001,32));return;}
  if(token==='oversized-stream'){res.write(Buffer.alloc(1_000_000,32));res.end(Buffer.alloc(1_000_001,32));return;}
  res.end(JSON.stringify({environment:token==='wrong-environment'?'Production':'Sandbox',purchaseAccountToken:token==='wrong-epoch'?home:epoch,report}));
 }catch(error){res.writeHead(500);res.end('Fixture failed');console.error(error);}
});

try{
 const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')];
 function compile(args){const result=spawnSync('swiftc',args,{encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);}
 const core=join(root,'ios/OuchiCore');
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(name=>name.endsWith('.swift')).sort().map(name=>join(core,name)),'-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 const executable=join(directory,'formal-report-http');
 compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/FormalReportHTTPIntegration.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{
  const child=spawn(executable,[String(server.address().port)],{env:{...process.env,DYLD_LIBRARY_PATH:directory},stdio:['ignore','pipe','pipe']});let output='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Formal report HTTP test timed out'));},60000);
  child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>{output+=chunk;process.stderr.write(chunk);});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(Error(`Formal report HTTP failed: ${code} ${output}`));});
 });
 assert.equal(redirects,0);assert.equal(requests,9);assert.equal(new Set(tokens).size,9);
 console.log('Fixture counters: nine distinct formal requests, zero redirected or cancelled requests. No real Auth, ledger, Apple or owner data.');
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});
}
