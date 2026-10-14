// Actual Swift default URLSession/flow/Keychain -> HTTP handler -> embedded full
// migration schema. Auth is synthetic, SQL transport is PGlite, not production.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFileSync,readdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createAccountClosureReviewHandler} from '../../lib/account-closure-review-handler.mjs';
import {createAccountClosureReviewRPC} from '../../lib/account-closure-review-rpc.mjs';
import {seedHomeHandoffFullSchemaFixture} from '../../tests/fixtures/home-handoff-full-schema.mjs';
import {owner,oe,os,home,product} from '../../tests/fixtures/home-handoff-identifiers.mjs';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
assert.ok(process.argv.includes('--sdk'));const sdk=process.argv[process.argv.indexOf('--sdk')+1];
const directory=mkdtempSync(join(tmpdir(),'ouchi-closure-http-')),marker=join(directory,'marker.json');
const db=await seedHomeHandoffFullSchemaFixture();
let executable,server,dropUntilRead=true,originalSubmission,requests=0,dropped=0,redirects=0;
const responseModes=new Set(['mime','cache','declared-large','stream-large','redirect']);
const visitedModes=new Set();
const errors=[];
const snapshot=async()=>{
 await db.exec('reset role');
 try{return (await db.query(`select jsonb_build_object(
 'home',(select to_jsonb(h) from public.homes h where id=$1),
 'members',(select jsonb_agg(to_jsonb(m) order by user_id) from public.home_members m where "homeId"=$1),
 'products',(select jsonb_agg(to_jsonb(p) order by id) from public.products p where "homeId"=$1),
 'tasks',(select jsonb_agg(to_jsonb(t) order by id) from public.maintenance_tasks t where "productId"=$2),
 'history',(select jsonb_agg(to_jsonb(h) order by id) from public.maintenance_history h where "productId"=$2),
 'access',(select to_jsonb(a) from maintenance_private.account_access a where user_id=$3)) as value`,[home,product,owner])).rows[0].value;
 }finally{await db.exec('set role service_role');}
};
const compile=args=>{const result=spawnSync('swiftc',args,{cwd:root,encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr);};
const run=mode=>new Promise((resolve,reject)=>{
 const child=spawn(executable,[mode,String(server?.address()?.port??0),marker],{env:{...process.env,DYLD_LIBRARY_PATH:directory},stdio:['ignore','pipe','pipe']});
 const timer=setTimeout(()=>child.kill('SIGTERM'),65000);
 child.stdout.on('data',chunk=>process.stdout.write(chunk));child.stderr.on('data',chunk=>process.stderr.write(chunk));
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('exit',(code,signal)=>{clearTimeout(timer);if(code===0)resolve();else reject(Error('Native closure HTTP phase failed: '+mode+' '+code+' '+signal));});
});
try{
 await db.exec('reset role');await db.exec(readFileSync(join(root,'supabase/migrations/20261014061605_ouchi_account_closure_review.sql'),'utf8'));
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const before=await snapshot();
 const port=createAccountClosureReviewRPC({client:{rpc(name,args){return {
  retry(value){assert.equal(value,false);return this;},
  async abortSignal(signal){signal.throwIfAborted();const data=(await db.query(`select public.${name}($1,$2,$3,$4) as value`,[args.target_user,args.verified_session,args.expected_epoch,args.expected_submission])).rows[0].value;return {data,error:null};}
 };}}});
 const handler=createAccountClosureReviewHandler({verify:async token=>token==='synthetic-token'||responseModes.has(token.replace(/^fixture-/,''))?{userID:owner,sessionID:os,epochID:oe,email:'synthetic@example.invalid'}:null,
  reauthenticate:async(email,password)=>email==='synthetic@example.invalid'&&password==='synthetic-password'?owner:null,port});
 server=createServer(async(req,res)=>{
  if(req.url==='/sink'){redirects++;res.end();return;}
  const action=/^\/api\/account\/closure-review\/(request|read|cancel)$/.exec(req.url??'')?.[1];
  if(!action){res.writeHead(404).end();return;}
  const abort=new AbortController();req.once('aborted',()=>abort.abort());res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
   requests++;
   const response=await handler(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:Readable.toWeb(req),duplex:'half',signal:abort.signal}),action);
   const bytes=Buffer.from(await response.arrayBuffer()),receipt=JSON.parse(bytes);
   const mode=req.headers.authorization?.replace(/^Bearer fixture-/,'');
   if(responseModes.has(mode)){
    visitedModes.add(mode);assert.equal(action,'read');assert.equal(response.status,200);
    const headers=Object.fromEntries(response.headers);
    if(mode==='redirect'){res.writeHead(302,{'content-type':'application/json','cache-control':'no-store',location:'http://127.0.0.1:'+server.address().port+'/sink'}).end();return;}
    if(mode==='mime')headers['content-type']='text/html';
    if(mode==='cache')headers['cache-control']='public, max-age=3600';
    if(mode==='declared-large'){headers['content-length']='5000';res.writeHead(200,headers).end(Buffer.concat([bytes,Buffer.alloc(5000-bytes.length,32)]));return;}
    if(mode==='stream-large'){res.writeHead(200,headers);res.write(Buffer.alloc(2048,32));res.end(Buffer.alloc(2049,32));return;}
    res.writeHead(200,headers).end(bytes);return;
   }
   if(action==='request'&&response.status===202){
    originalSubmission??=receipt.submissionID;
    if(dropUntilRead&&receipt.submissionID===originalSubmission){dropped++;res.destroy();return;}
   }
   if(action==='read'&&response.status===200)dropUntilRead=false;
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
  }catch(error){errors.push(error);if(!res.destroyed)res.writeHead(500).end();}
 });
 const common=['-sdk',sdk,'-swift-version','6','-D','DEBUG','-module-cache-path',join(directory,'cache')],core=join(root,'ios/OuchiCore');
 compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...readdirSync(core).filter(name=>name.endsWith('.swift')).sort().map(name=>join(core,name)),
  '-o',join(directory,'libOuchiCore.dylib'),'-emit-module-path',join(directory,'OuchiCore.swiftmodule')]);
 executable=join(directory,'closure-http');
 compile([...common,'-I',directory,'-L',directory,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/AccountClosureReviewHTTPIntegration.swift'),join(root,'ios/OuchiMaintenance/AccountClosureReviewVault.swift'),'-o',executable]);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 await run('begin');assert.ok(dropped>0);assert.ok(existsSync(marker));
 await run('restore');
 assert.deepEqual(errors,[]);assert.ok(requests>=6);
 assert.deepEqual(visitedModes,responseModes);assert.equal(redirects,0,'Original bearer must never follow a redirect');
 const records=(await db.query('select submission_id::text,state from maintenance_private.account_closure_reviews where user_id=$1',[owner])).rows;
 assert.equal(records.length,2);assert.equal(records.find(x=>x.submission_id===originalSubmission)?.state,'cancelled');
 assert.equal(records.filter(x=>x.state==='review_required').length,1);
 assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 assert.deepEqual(await snapshot(),before);
 console.log('PASS: actual native URLSession HTTP + separate-process protected custody + full embedded SQL; lost accepted reply restored/cancelled, nonce replay stays cancelled, fresh submission explicit, family retained. Auth synthetic; no erasure/real Apple/physical-device proof.');
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
