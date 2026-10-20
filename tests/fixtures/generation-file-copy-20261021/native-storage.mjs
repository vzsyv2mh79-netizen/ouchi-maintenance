// Disposable OFFICIAL Storage process; no production URLs, creds or fallback.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
const runtime='/private/tmp/kakei-storage-runtime-20261020/storage-01c95148a981a88b5f7e9014571a2926567b51e3';
async function port(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
export async function startFixtureStorage(socket,{jwtSecret=randomBytes(40).toString('hex')}={}){
 assert.equal(createHash('sha256').update(readFileSync(runtime+'/../source.tar.gz')).digest('hex'),'e8bdbd5f7ec2d8e2da605df137de49edba719d0a2488f64e3dddae9078cd75d6','Pinned official Storage source archive required');
 assert.match(socket,/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);assert.equal(typeof jwtSecret,'string');assert.ok(jwtSecret.length>=32);
 const directory=await mkdtemp('/private/tmp/ouchi-storage-files-'),httpPort=await port(),adminPort=await port();
 const token=role=>{const now=Math.floor(Date.now()/1000),input=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role,iat:now,exp:now+300})).toString('base64url');return input+'.'+createHmac('sha256',jwtSecret).update(input).digest('base64url');};
 const serviceKey=token('service_role'),anonKey=token('anon');
 const env={PATH:'/usr/bin:/bin',NODE_ENV:'production',SERVER_HOST:'127.0.0.1',SERVER_PORT:String(httpPort),SERVER_ADMIN_PORT:String(adminPort),SERVER_REGION:'local',TENANT_ID:'kakei-isolated-storage',AUTH_JWT_SECRET:jwtSecret,ANON_KEY:anonKey,SERVICE_KEY:serviceKey,
 DATABASE_URL:'postgres://ouchi_fixture@localhost/postgres?host='+encodeURIComponent(socket)+'&sslmode=disable',DATABASE_MAX_CONNECTIONS:'4',DATABASE_POSTGRES_VERSION:'17',DB_INSTALL_ROLES:'false',DB_SUPER_USER:'ouchi_fixture',
 STORAGE_BACKEND:'file',STORAGE_FILE_BACKEND_PATH:directory,STORAGE_S3_BUCKET:'kakei-isolated-storage',REGION:'local',UPLOAD_FILE_SIZE_LIMIT:'5242880',UPLOAD_FILE_SIZE_LIMIT_STANDARD:'5242880',PG_QUEUE_ENABLE:'false',IMAGE_TRANSFORMATION_ENABLED:'false',VECTOR_ENABLED:'false',VECTOR_STORE_MIGRATIONS_ENABLED:'false',OTEL_METRICS_ENABLED:'false',PROMETHEUS_METRICS_ENABLED:'false',LOG_LEVEL:'error',WORKERS_NUM:'1'};
 const child=spawn(process.execPath,[runtime+'/dist/start/server.js'],{cwd:runtime,env,stdio:['ignore','pipe','pipe']});
 let diagnostics='',spawnError;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>diagnostics=(diagnostics+b.toString()).slice(-12000));child.on('error',e=>spawnError=e);
 const origin='http://127.0.0.1:'+httpPort;
 async function stop(){
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   try{await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned Storage shutdown timeout')),5000).unref())]);}
   catch{child.kill('SIGKILL');await once(child,'exit');}
  }
  assert.ok(child.exitCode!==null||child.signalCode!==null,'Owned Storage process must stop before file cleanup');
  await rm(directory,{recursive:true,force:true});
 }
 try{
  const until=Date.now()+20000;
  while(true){
   if(spawnError)throw spawnError;
   if(child.exitCode!==null)throw Error('Owned Storage startup failed: '+diagnostics.replaceAll(jwtSecret,'[fixture secret]').replaceAll(serviceKey,'[fixture token]').replaceAll(anonKey,'[fixture token]'));
   try{const r=await fetch(origin+'/status',{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}
   if(Date.now()>until)throw Error('Owned Storage readiness timeout');await new Promise(r=>setTimeout(r,100));
  }
  const fetchSDK=async(input,options={})=>{const url=new URL(input);assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith('/storage/v1/'));url.pathname=url.pathname.slice('/storage/v1'.length);return fetch(url,{...options,redirect:'error',signal:options.signal??AbortSignal.timeout(3000)});};
  return {origin,serviceKey,anonKey,fetchSDK,stop};
 }catch(e){await stop();throw e;}
}
