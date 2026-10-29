// Disposable process only: random fixture JWT signing key, Unix-socket DB.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {createHmac} from 'node:crypto';
export async function startEnrollmentPostgREST(socket,secret){
 assert.match(socket,/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 assert.match(secret,/^[a-f0-9]{80}$/);
 const binary=process.env.OUCHI_TEST_POSTGREST_BINARY,library=process.env.OUCHI_TEST_POSTGREST_LIBRARY;
 assert.ok(binary?.startsWith('/private/tmp/')&&library?.startsWith('/private/tmp/'));
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
 const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const child=spawn(binary,[],{env:{PATH:'/usr/bin:/bin',DYLD_LIBRARY_PATH:library,
  PGRST_DB_URI:'postgres://authenticator@localhost/postgres?host='+encodeURIComponent(socket),
  PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,
  PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(port),PGRST_DB_POOL:'3'},stdio:'ignore'});
 let failure;child.on('error',error=>{failure=error;});
 const origin='http://127.0.0.1:'+port;
 const stop=async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned PostgREST shutdown timeout')),5000).unref())]);}};
 try{
  const deadline=Date.now()+15000;
  while(true){
   if(failure)throw failure;if(child.exitCode!==null)throw Error('Owned PostgREST exited');
   try{if((await fetch(origin+'/',{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}
   if(Date.now()>deadline)throw Error('Owned PostgREST readiness timeout');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  const now=Math.floor(Date.now()/1000),input=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'service_role',iat:now,exp:now+180})).toString('base64url');
  const serviceToken=input+'.'+createHmac('sha256',secret).update(input).digest('base64url');
  return {stop,request:async(path,token=serviceToken,body)=>{
   assert.match(path,/^\/(rpc\/[a-z_]+|products|maintenance_tasks|maintenance_history)(\?[^#]*)?$/);
   return fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});
  }};
 }catch(error){await stop();throw error;}
}
