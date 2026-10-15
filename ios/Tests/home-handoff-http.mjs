// Actual native URLSession + separate-process Keychain -> HTTP handler -> CI
// migration schema in PGlite. Identity/policy are synthetic, not live GoTrue MFA
// or the other-app shared-controller composition. No shipping route is enabled.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {homeHandoffResponse,HomeHandoffRefusal} from '../../lib/home-handoff-handler.mjs';
import {seedHomeHandoffFullSchemaFixture} from '../../tests/fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,other,home,product,request,os,rs,oe,re} from '../../tests/fixtures/home-handoff-identifiers.mjs';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
assert.ok(process.argv.includes('--sdk'));const sdk=process.argv[process.argv.indexOf('--sdk')+1];
const directory=mkdtempSync(join(tmpdir(),'ouchi-handoff-http-')),marker=join(directory,'marker.json');
const db=await seedHomeHandoffFullSchemaFixture();
let executable,server,dropped=0,creates=0,decisions=0,redirects=0,recovered=false;
const errors=[],visited=new Set();
const responseModes=new Set(['redirect','oversized','mime','cache','declared-large']);
const snapshot=async()=>{
 await db.exec('reset role');
 try{return (await db.query(`select jsonb_build_object(
 'otherMembers',(select jsonb_agg(to_jsonb(m) order by user_id) from public.home_members m where "homeId"=$1 and user_id<>$3),
 'products',(select jsonb_agg(to_jsonb(p) order by id) from public.products p where "homeId"=$1),
 'tasks',(select jsonb_agg(to_jsonb(t) order by id) from public.maintenance_tasks t where "productId"=$2),
 'history',(select jsonb_agg(to_jsonb(h) order by id) from public.maintenance_history h where "productId"=$2),
 'auth',(select jsonb_agg(id order by id) from auth.users)) as value`,[home,product,recipient])).rows[0].value;
 }finally{await db.exec('set role service_role');}
};
const compile=args=>{const result=spawnSync('swiftc',args,{cwd:root,encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);};
const run=mode=>new Promise((resolve,reject)=>{
 const child=spawn(executable,[mode,String(server?.address()?.port??0),marker],{env:{...process.env,DYLD_LIBRARY_PATH:directory},stdio:['ignore','pipe','pipe']});
 const timer=setTimeout(()=>child.kill('SIGTERM'),65000);
 child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk));
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('exit',(code,signal)=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('Native handoff HTTP phase failed: '+mode+' '+code+' '+signal));});
});
try{
 await db.exec('reset role');
 await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,other,'Other synthetic family']);
 await db.exec('set role service_role');
 const before=await snapshot();
 const value=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args)).rows[0].value;
 const ports={
  verifyCurrent:async token=>token==='synthetic-owner'?{userID:owner,sessionID:os,epochID:oe}
   :token==='synthetic-recipient'||responseModes.has(token.replace(/^fixture-/,''))?{userID:recipient,sessionID:rs,epochID:re}:null,
  create:scope=>{creates++;return value('request_maintenance_home_handoff',[scope.requestID,scope.homeID,scope.userID,scope.sessionID,scope.epochID,scope.recipientID]);},
  read:scope=>value('read_maintenance_home_handoff',[scope.requestID,scope.userID,scope.sessionID,scope.epochID]),
  decide:async scope=>{decisions++;try{return await value('decide_maintenance_home_handoff',[scope.requestID,scope.userID,scope.sessionID,scope.epochID,scope.accept]);}
   catch(error){if(error.code==='P0001'&&error.message==='Attachment handoff required')throw new HomeHandoffRefusal('attachment_handoff_required');throw error;}},
 };
 server=createServer(async(req,res)=>{
  if(req.url==='/sink'){redirects++;res.end();return;}
  const abort=new AbortController();req.once('aborted',()=>abort.abort());res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
   const origin='http://127.0.0.1:'+server.address().port;
   const init={method:req.method,headers:req.headers,signal:abort.signal};
   if(req.method!=='GET'){init.body=Readable.toWeb(req);init.duplex='half';}
   const response=await homeHandoffResponse(new Request(origin+req.url,init),{...ports,origin});
   const bytes=Buffer.from(await response.arrayBuffer()),headers=Object.fromEntries(response.headers);
   if(req.method==='PUT'&&response.status===200&&!recovered){dropped++;res.destroy();return;}
   if(req.method==='GET'&&response.status===200&&dropped>0)recovered=true;
   const mode=req.headers.authorization?.replace(/^Bearer fixture-/,'');
   if(response.status===200&&responseModes.has(mode)){
    visited.add(mode);
    if(mode==='redirect'){res.writeHead(302,{'cache-control':'no-store',location:origin+'/sink'}).end();return;}
    if(mode==='oversized'){res.writeHead(200,headers);res.write(Buffer.alloc(2048,32));res.end(Buffer.alloc(2049,32));return;}
    if(mode==='mime')headers['content-type']='text/html';
    if(mode==='cache')headers['cache-control']='public, max-age=3600';
    if(mode==='declared-large'){headers['content-length']='5000';res.writeHead(200,headers).end(Buffer.concat([bytes,Buffer.alloc(5000-bytes.length,32)]));return;}
   }
   res.writeHead(response.status,headers).end(bytes);
  }catch(error){errors.push(error);if(!res.destroyed)res.writeHead(500).end();}
 });
 const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')],core=join(root,'ios/OuchiCore');
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(name=>name.endsWith('.swift')).sort().map(name=>join(core,name)),
  '-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 executable=join(directory,'handoff-http');
 compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/HomeHandoffHTTPIntegration.swift'),join(root,'ios/OuchiMaintenance/KeychainSessionStorage.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await run('begin');assert.ok(dropped>0);assert.ok(existsSync(marker));const originalDecisions=decisions;
 await run('restore');
 assert.deepEqual(errors,[]);assert.equal(creates,1);assert.equal(decisions,originalDecisions,'Recovery and completed decision must not issue another PUT');
 assert.deepEqual(visited,responseModes);assert.equal(redirects,0,'Original bearer cannot reach redirect destination');
 await db.exec('reset role');
 const rows=(await db.query('select id,state from maintenance_private.home_handoffs')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].id,request);assert.equal(rows[0].state,'completed');
 assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
 assert.equal((await db.query('select count(*)::int n from public.home_members where "homeId"=$1 and user_id=$2',[home,recipient])).rows[0].n,0);
 assert.deepEqual(await snapshot(),before);
 console.log('PASS: actual native HTTP + separate-process protected handoff recovery + CI migration SQL preserve exact records/Auth; lost acceptance recovers same deadline, no fresh request or recovery PUT. Auth synthetic, no shared-controller/real MFA/Storage custody/physical-device proof.');
}finally{
 let cleanupError;
 try{if(executable&&existsSync(marker))await run('cleanup');}catch(error){cleanupError=error;}
 finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await db.close();
  if(!cleanupError)rmSync(directory,{recursive:true,force:true});
  else console.error('Scoped synthetic cleanup marker retained at '+marker);
 }
 if(cleanupError)throw cleanupError;
}
