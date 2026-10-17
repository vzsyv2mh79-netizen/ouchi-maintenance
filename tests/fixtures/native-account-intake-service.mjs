import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
export async function verifyNativeAccountIntake({backendPort,authPort,db,resetDropReply,output}){
 assert.equal(process.env.OUCHI_NATIVE_INTAKE_SERVICE_TEST,'true');const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'ouchi-native-intake-'));let proxy;
 try{
  const email=randomUUID()+'@example.invalid',password=randomUUID()+'aA7!';
  const response=await fetch('http://127.0.0.1:'+authPort+'/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.ok,true);const registered=await response.json(),account=registered.user.id,originalSession=JSON.parse(Buffer.from(registered.access_token.split('.')[1],'base64url')).session_id;
  proxy=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:54321');assert.equal(url.pathname,'/auth/v1/token');assert.equal(url.searchParams.get('grant_type'),'password');const parts=[];let n=0;for await(const c of req){n+=c.length;assert.ok(n<=4096);parts.push(c);}const r=await fetch('http://127.0.0.1:'+authPort+'/token'+url.search,{method:'POST',headers:req.headers,body:Buffer.concat(parts),redirect:'error'});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500).end();}});
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(54321,'127.0.0.1',resolve);});
  const sdk=spawnSync('xcrun',['--sdk','macosx','--show-sdk-path'],{encoding:'utf8'});assert.equal(sdk.status,0);
  const common=['-sdk',sdk.stdout.trim(),'-swift-version','6','-D','DEBUG','-module-cache-path',join(dir,'cache')];
  const core=readdirSync('ios/OuchiCore').filter(n=>n.endsWith('.swift')).sort().map(n=>join(root,'ios/OuchiCore',n));
  const compile=args=>{const result=spawnSync('swiftc',args,{encoding:'utf8',timeout:120000});writeFileSync(join(output,'native-compile.log'),(result.stdout??'')+(result.stderr??''));assert.equal(result.status,0,'Native compile failed; see native-compile.log');};
  compile([...common,'-emit-module','-emit-library','-module-name','OuchiCore',...core,'-o',join(dir,'libOuchiCore.dylib'),'-emit-module-path',join(dir,'OuchiCore.swiftmodule')]);
  const executable=join(dir,'native-intake');compile([...common,'-I',dir,'-L',dir,'-lOuchiCore','-parse-as-library',join(root,'ios/Tests/NativeAccountIntakeService.swift'),'-o',executable]);
  resetDropReply();const result=await new Promise((resolve,reject)=>{const child=spawn(executable,[],{env:{...process.env,DYLD_LIBRARY_PATH:dir},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGTERM'),90000);child.stdout.on('data',v=>{stdout+=v;});child.stderr.on('data',v=>{stderr+=v;});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);writeFileSync(join(output,'native-run.log'),stdout+stderr);if(code===0)resolve(JSON.parse(stdout.trim().split('\n').at(-1)));else reject(Error('Native intake failed; inspect local native-run.log'));});child.stdin.end(JSON.stringify({email,password,publicKey:'sb_publishable_synthetic_native_intake',backendPort,marker:join(dir,'reference.json')}));});
  assert.equal(result.accountID,account);assert.equal(result.persistedReferences,1);
  const reviews=(await db.query('select submission_id,app_epoch_id,state from maintenance_private.account_closure_reviews where user_id=$1',[account])).rows;assert.equal(reviews.length,1);assert.equal(reviews[0].submission_id,result.submissionID);assert.equal(reviews[0].app_epoch_id,result.epochID);assert.equal(reviews[0].state,'cancelled');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.enrollment_consents where user_id=$1',[account])).rows[0].n,1);
  const sessions=(await db.query('select id from auth.sessions where user_id=$1 order by id',[account])).rows.map(r=>r.id);assert.deepEqual(sessions,[originalSession,result.sessionID].sort());
  return {...result,actualGoTrueConsentAndSQL:true,originalSessionsPreserved:true,sourceSHA256:Object.fromEntries(['ios/Tests/NativeAccountIntakeService.swift',...core.map(p=>p.slice(root.length+1))].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),notVerified:['Actual iPhone UI or Keychain in this HTTP witness; those have separate simulator tests','Managed TLS/gateway/configuration and production rollout']};
 }finally{if(proxy?.listening)await new Promise(resolve=>proxy.close(resolve));rmSync(dir,{recursive:true,force:true});}
}
