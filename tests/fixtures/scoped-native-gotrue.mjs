// Disposable real GoTrue process. No production credentials or network routes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
// Explicit test-only prepared official runtime; no download or credential discovery.
const root=process.env.OUCHI_TEST_AUTH_RUNTIME;
export function fixtureTOTP(secret){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[];
 assert.match(secret,/^[A-Z2-7]+=*$/);
 for(const c of secret.replace(/=+$/,'')){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}}
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=digest[19]&15;
 return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export async function startFixtureGoTrue(socket,issuer){
 assert.ok(typeof root==='string'&&root.startsWith('/')&&!root.includes('\0'),'Explicit prepared Auth runtime required');
 assert.match(socket,/^\/private\/tmp\/ouchi-scoped-pg-[^/]+\/s$/);
 assert.equal(issuer,'https://hphifiqyypwyxkzfanod.supabase.co/auth/v1');
 const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');
 const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
 const env={PATH:'/usr/bin:/bin',GOMAXPROCS:'2',GOTRUE_DB_DRIVER:'postgres',DATABASE_URL:'postgres://ouchi_fixture@localhost/postgres?host='+encodeURIComponent(socket)+'&sslmode=disable&options=-csearch_path%3Dauth',API_EXTERNAL_URL:issuer,GOTRUE_API_HOST:'127.0.0.1',PORT:String(port),GOTRUE_SITE_URL:'http://127.0.0.1',GOTRUE_JWT_SECRET:randomBytes(40).toString('hex'),GOTRUE_JWT_ISSUER:issuer,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_MFA_TOTP_ENROLL_ENABLED:'true',GOTRUE_MFA_TOTP_VERIFY_ENABLED:'true',GOTRUE_SESSIONS_ALLOW_LOW_AAL:'15m',GOTRUE_LOG_LEVEL:'error'};
 const child=spawn(root+'/auth-server',[],{cwd:root,env,stdio:['ignore','ignore','pipe']});
 let diagnostics='';child.stderr.on('data',b=>{diagnostics=(diagnostics+b.toString()).slice(-12000);});
 let spawnError;child.on('error',e=>{spawnError=e;});
 const origin='http://127.0.0.1:'+port;
 async function stop(){
  if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned GoTrue shutdown timeout')),5000).unref())]);}
 }
 try{
  const until=Date.now()+15000;
  while(true){
   if(spawnError)throw spawnError;
   if(child.exitCode!==null)throw Error('Owned GoTrue startup failed: '+diagnostics.replace(/postgres:\/\/[^\s"]+/g,'[fixture DSN]').replace(/[0-9a-f]{64,}/g,'[fixture secret]'));
   try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)});if(r.ok){assert.equal((await r.json()).version,'v2.197.0');break;}}catch{}
   if(Date.now()>until)throw Error('Owned GoTrue readiness timeout');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  async function request(path,body,token){
   const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
   const responseBody=await r.json();
   if(r.status!==200){
    const errors=diagnostics.split('\n').flatMap(line=>{try{const v=JSON.parse(line);return v.error?[String(v.error).replace(/[A-Za-z0-9_.+-]+@[^\s"]+/g,'[fixture contact]')]:[];}catch{return [];}});
    throw Error('Disposable GoTrue request failed: '+path+' status '+r.status+' '+JSON.stringify({code:responseBody.code,error_code:responseBody.error_code,errors}));
   }
   return responseBody;
  }
  return {origin,request,stop};
 }catch(e){await stop();throw e;}
}
