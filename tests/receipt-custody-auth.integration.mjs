import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer,request as proxyRequest} from 'node:http';
import {readFileSync} from 'node:fs';import ts from 'typescript';import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {createReceiptTransactions} from '../lib/deletion-receipt-transactions.mjs';
import {createDeletionReadCredential} from '../lib/deletion-receipt-credential.mjs';
import {createDeletionReceiptHTTP} from '../lib/deletion-receipt-handler.mjs';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const helperURL=moduleURL(compile('lib/verified-app-session.ts'));
const {sessionAfterAuthVerification}=await import(helperURL);
const {createDeletionReceiptIdentityVerifier}=await import(moduleURL(compile('lib/deletion-receipt-identity.ts').replace("'./verified-app-session'",JSON.stringify(helperURL))));
const {createDeletionReceiptGetUser}=await import(moduleURL(compile('lib/deletion-receipt-auth.ts').replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')))));
test('real GoTrue session is pinned in its actual database through scoped receipt registration',
 {skip:process.env.OUCHI_REAL_AUTH_TEST!=='true',timeout:30000},async()=>{
 const gateway=createServer((request,response)=>{
  if(!request.url?.startsWith('/auth/v1/')){response.writeHead(404).end();return;}
  const upstream=proxyRequest('http://127.0.0.1:9999'+request.url.slice('/auth/v1'.length),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 const config={host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test'};
 const admin=new pg.Client(config);let connected=false;
 const transaction=createReceiptTransactions({connect:async({signal})=>{
  const client=new pg.Client(config);client.on('error',()=>{});let closing;
  const abort=()=>{closing??=client.end();};signal.addEventListener('abort',abort,{once:true});
  try{signal.throwIfAborted();await client.connect();signal.throwIfAborted();}catch(e){abort();await closing.catch(()=>{});throw e;}finally{signal.removeEventListener('abort',abort);}
  return {query:(...args)=>client.query(...args),abort,close:async()=>{abort();await closing;}};
 }});
 const txOptions=()=>({signal:AbortSignal.timeout(5000),readOnly:false});
 let requestID;
 try{
  await admin.connect();connected=true;
  await admin.query('create schema if not exists private');
  await admin.query('create table private.kb_shared_deletion_journal(request_id uuid primary key,user_id uuid not null,scope jsonb not null,status text not null)');
  await admin.query('create table private.kb_deletion_read_credentials(request_id uuid primary key references private.kb_shared_deletion_journal(request_id) on delete cascade,scope jsonb not null,token_hash text not null,expires_at timestamptz not null,revoked_at timestamptz,custody_confirmed_at timestamptz)');
  const client=createClient('http://127.0.0.1:54321','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false}});
  const signup=await client.auth.signUp({email:randomUUID()+'@example.invalid',password:'Synthetic-'+randomUUID()});
  assert.equal(signup.error,null);const bearer=signup.data.session.access_token,userID=signup.data.user.id;
  const signed=sessionAfterAuthVerification(bearer,userID);assert.ok(signed);
  requestID=randomUUID();const scope={protocolVersion:2,kind:'shared-account',requestID,userID,inventoryDigest:'a'.repeat(64),leaseToken:randomUUID(),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:randomUUID()}]};
  const fixed={...scope};delete fixed.leaseToken;
  await admin.query('insert into private.kb_shared_deletion_journal values($1,$2,$3,$4)',[requestID,userID,fixed,'requested']);
  const verifyIdentity=createDeletionReceiptIdentityVerifier({getUser:createDeletionReceiptGetUser({supabaseURL:'http://127.0.0.1:54321',publishableKey:'synthetic-public-key',isolatedDevelopment:true})});
  const credentials=createDeletionReadCredential({verifyIdentity,maxLifetimeMs:3600000});
  const token=randomBytes(32).toString('base64url'),expiry=new Date(Date.now()+600000).toISOString();
  let loseReply=false;
  const receiptHTTP=createDeletionReceiptHTTP({credentials,allowOrigin:origin=>origin==='https://ouchi-maintenance.vercel.app',
   transaction:async(fn,options)=>{const result=await transaction(fn,options);if(loseReply){loseReply=false;throw Error('synthetic reply lost after durable commit');}return result;},
   resolveScope:async(id,tx)=>{const row=(await tx.query('select scope from private.kb_shared_deletion_journal where request_id=$1',[id])).rows[0];return row?{...row.scope,leaseToken:scope.leaseToken}:null;},
  });
  const request=(method='POST',login=bearer)=>new Request(`https://ouchi-maintenance.vercel.app/api/account/deletion/${requestID}/receipt`,{
   method,headers:{'x-deletion-receipt':token,...(method==='POST'?{'content-type':'application/json',...(login?{authorization:'Bearer '+login}:{})}:{})},
   ...(method==='POST'?{body:JSON.stringify({expiresAt:expiry})}:{}),
  });
  const forged=bearer.split('.');forged[2]=(forged[2][0]==='A'?'B':'A')+forged[2].slice(1);
  await assert.rejects(transaction(tx=>credentials.register(scope,forged.join('.'),token,expiry,tx),txOptions()),/Fresh registration identity/);
  assert.equal((await admin.query('select count(*)::int as n from private.kb_deletion_read_credentials')).rows[0].n,0);
  loseReply=true;
  assert.equal((await receiptHTTP(request(),requestID)).status,503);
  const reconciled=await receiptHTTP(request('POST',null),requestID);
  assert.equal(reconciled.status,200);const registered=await reconciled.json();
  assert.deepEqual(registered,{registered:true,expiresAt:expiry});
  const stored=(await admin.query('select * from private.kb_deletion_read_credentials where request_id=$1',[requestID])).rows[0];
  assert.notEqual(stored.token_hash,token);assert.ok(stored.custody_confirmed_at);assert.equal(stored.expires_at.toISOString(),expiry);
  // Original receipt reconciles a lost reply without a new login or new token.
  assert.deepEqual(await transaction(tx=>credentials.register(scope,null,token,expiry,tx),txOptions()),registered);
  await assert.rejects(transaction(tx=>credentials.register(scope,null,token,new Date(Date.parse(expiry)+1000).toISOString(),tx),txOptions()),/retry mismatch/);
  assert.equal((await admin.query('select count(*)::int as n from private.kb_deletion_read_credentials')).rows[0].n,1);
  // PostgreSQL row lock persists after fresh Auth verification until commit.
  await transaction(async tx=>{
   assert.equal((await verifyIdentity(bearer,tx)).userID,userID);
   await admin.query("set lock_timeout='100ms'");
   await assert.rejects(admin.query('delete from auth.sessions where id=$1',[signed.sessionID]),/lock timeout/);
   await admin.query("set lock_timeout='0'");
  },txOptions());
  await admin.query('delete from auth.sessions where id=$1',[signed.sessionID]);
  assert.equal(await transaction(tx=>verifyIdentity(bearer,tx),txOptions()),null);
  // This state transition is a test fixture, not proof of a deployed claim.
  // With no completion receipts, bearer-free status must remain unconfirmed.
  await admin.query("alter table private.kb_shared_deletion_journal add column lease_token uuid,add column lease_until timestamptz,add column receipts jsonb default '{}'::jsonb");
  await admin.query("update private.kb_shared_deletion_journal set status='processing' where request_id=$1",[requestID]);
  const status=await receiptHTTP(request('GET',null),requestID);
  assert.equal(status.status,200);assert.deepEqual(await status.json(),{state:'unconfirmed'});
 }finally{
  if(connected){
   await admin.query('drop table if exists private.kb_deletion_read_credentials');
   await admin.query('drop table if exists private.kb_shared_deletion_journal');
  }
  await admin.end();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));
 }
});
