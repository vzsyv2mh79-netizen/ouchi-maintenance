import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,os,oe} from './fixtures/home-handoff-identifiers.mjs';
const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const identityURL=url(compile('lib/home-handoff-identity.ts').replace("'./verified-app-session'",JSON.stringify(url(compile('lib/verified-app-session.ts')))).replace("'./home-handoff-handler.mjs'",JSON.stringify(import.meta.resolve('../lib/home-handoff-handler.mjs'))));
const {createAccountClosureReviewTransactionPort}=await import(url(compile('lib/account-closure-review-transaction.ts').replace("'./home-handoff-identity'",JSON.stringify(identityURL)).replace("'./transaction-commit-checks.mjs'",JSON.stringify(import.meta.resolve('../lib/transaction-commit-checks.mjs')))));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',submission='44444444-4444-4444-8444-444444444444';
// Adapter contract test: real verifier/commit checks, synthetic Auth and SQL.
// Does not establish PostgreSQL lock concurrency, shipping route or erasure.
function fixture({failAt=null,supported=true,afterOperation=()=>{},receiptOverride,verifyReauthentication=async()=>true}={}){
 const scope={userID:user,sessionID:session,epochID:epoch,submissionID:submission};
 const bearer='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,aal:'aal1',exp:4102444800})).toString('base64url')+'.c2ln';
 const events=[];let authCount=0,committed=false;
 const policy={projectID:'abcdefghijklmnopqrst',singleSession:false,timeboxSeconds:null,inactivitySeconds:null,assuranceMode:'highest-current-aal/v1',totpVerify:true,phoneVerify:false,webAuthnVerify:false};
 const policyReader=Object.assign(async()=>policy,{isCurrent:()=>true});
 const identityOptions={projectID:policy.projectID,policyReader,getUser:async(token)=>{
  assert.equal(token,bearer);events.push('auth');authCount++;
  return {data:{user:authCount===failAt?null:{id:user}},error:null};
 }};
 const query=async(sql,args)=>{
  if(sql.includes('verified_at'))return {rows:[{verified_at:Date.now(),epoch_id:epoch,session_aal:'aal1',has_verified_factor:false,session_current:true}]};
  if(sql.includes('pg_advisory_xact_lock')){events.push('advisory');assert.deepEqual(args,[user]);return {rows:[]};}
  if(sql.includes('pg_catalog.pg_constraint')){events.push('constraints');return {rows:[{supported}]};}
  if(sql.startsWith('select id from auth.users')){events.push('user');return {rows:[{id:user}]};}
  if(sql.startsWith('select id from auth.sessions')){events.push('session');return {rows:[{id:session}]};}
  if(sql.startsWith('select id from auth.mfa_factors')){events.push('factors');return {rows:[]};}
  if(sql.includes('for update of e,a,b')){events.push('enrollment');return {rows:[{epoch_id:epoch}]};}
  assert.match(sql,/^select public\.(request|read|cancel)_maintenance_closure_review/);
  assert.deepEqual(args,[user,session,epoch,submission]);events.push('operation');afterOperation(scope);
  return {rows:[{receipt:receiptOverride===undefined?{kind:'app-closure-review/v2',state:'review_required',reviewRequestID:'55555555-5555-4555-8555-555555555555',epochID:epoch,submissionID:submission}:receiptOverride}]};
 };
 const transactions={run:async(signal,work)=>{
  events.push('begin');try{const value=await work({query});signal.throwIfAborted();events.push('commit');committed=true;return value;}catch(error){events.push('rollback');throw error;}
 }};
 const port=createAccountClosureReviewTransactionPort({bearer,identityOptions,transactions,verifyReauthentication});
 return {port,scope,events,committed:()=>committed,signal:new AbortController().signal};
}
test('review writes and final original-bearer verification finish before owner COMMIT',async()=>{
 const f=fixture();assert.equal((await f.port.request(f.scope,f.signal)).state,'review_required');
 assert.deepEqual(f.events,['begin','auth','advisory','constraints','user','session','factors','enrollment','auth','operation','auth','commit']);
});
test('identity refusal before locks, after pins, or before commit always rolls back',async()=>{
 for(const failAt of [1,2,3]){const f=fixture({failAt});await assert.rejects(f.port.request(f.scope,f.signal));assert.equal(f.committed(),false);assert.equal(f.events.at(-1),'rollback');assert.equal(f.events.includes('operation'),failAt===3);}
});
test('unsupported Auth FK pin contract refuses mutation',async()=>{
 const f=fixture({supported:false});await assert.rejects(f.port.cancel(f.scope,f.signal),/pin constraints/);assert.equal(f.events.includes('operation'),false);assert.equal(f.committed(),false);
});
test('request requires bound reauthentication both after pins and immediately before commit',async()=>{
 const missing=fixture({verifyReauthentication:null});await assert.rejects(missing.port.request(missing.scope,missing.signal),/Bound reauthentication/);assert.deepEqual(missing.events,[]);
 for(const failAt of [1,2]){
  let checks=0;const f=fixture({verifyReauthentication:async()=>++checks!==failAt});
  await assert.rejects(f.port.request(f.scope,f.signal));assert.equal(f.committed(),false);assert.equal(f.events.includes('operation'),failAt===2);
 }
});
test('scope changes or malformed receipts cannot commit an apparent acknowledgement',async()=>{
 for(const options of [{afterOperation:scope=>{scope.epochID=submission;}},{receiptOverride:{kind:'app-account-deletion/v1',state:'complete'}}]){
  const f=fixture(options);await assert.rejects(f.port.request(f.scope,f.signal));assert.equal(f.committed(),false);
 }
});
test('missing read/cancel is scoped null; request cannot claim acceptance without receipt',async()=>{
 for(const action of ['read','cancel']){const f=fixture({receiptOverride:null});assert.equal(await f.port[action](f.scope,f.signal),null);assert.equal(f.events.at(-2),'auth');assert.equal(f.committed(),true);}
 const f=fixture({receiptOverride:null});await assert.rejects(f.port.request(f.scope,f.signal));assert.equal(f.committed(),false);
});
test('cancellation and foreign scope stop before review mutation',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.port.request(f.scope,controller.signal));assert.deepEqual(f.events,[]);
 const foreign=fixture();foreign.scope.userID=submission;await assert.rejects(foreign.port.read(foreign.scope,foreign.signal));assert.equal(foreign.events.includes('operation'),false);
});

test('actual review SQL rolls back inserted intake on failed commit check, then supports committed read/cancel',async()=>{
 const db=await seedHomeHandoffFullSchemaFixture();
 try{
  await db.exec(`reset role;
   alter table auth.sessions add column aal text default 'aal1';
   alter table auth.sessions add column refreshed_at timestamp;
   create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
  `);
  await db.exec(readFileSync('supabase/migrations/20261014061605_ouchi_account_closure_review.sql','utf8'));
  await db.exec('update maintenance_private.account_closure_review_policy set enabled=true');
  const bearer='e30.'+Buffer.from(JSON.stringify({sub:owner,session_id:os,aal:'aal1',exp:4102444800})).toString('base64url')+'.c2ln';
  let checks=0,refuseFinal=true;
  const policy={projectID:'abcdefghijklmnopqrst',singleSession:false,timeboxSeconds:null,inactivitySeconds:null,assuranceMode:'highest-current-aal/v1',totpVerify:true,phoneVerify:false,webAuthnVerify:false};
  const identityOptions={projectID:policy.projectID,policyReader:Object.assign(async()=>policy,{isCurrent:()=>true}),getUser:async(token)=>{
   assert.equal(token,bearer);checks++;return {data:{user:refuseFinal&&checks===3?null:{id:owner}},error:null};
  }};
  const transactions={run:async(signal,work)=>{
   await db.exec('begin');try{const value=await work({query:(sql,args)=>db.query(sql,args)});signal.throwIfAborted();await db.exec('commit');return value;}catch(error){await db.exec('rollback');throw error;}
  }};
  const port=createAccountClosureReviewTransactionPort({bearer,identityOptions,transactions,verifyReauthentication:async()=>true}),scope={userID:owner,sessionID:os,epochID:oe,submissionID:submission},signal=new AbortController().signal;
  await assert.rejects(port.request(scope,signal),/verification required/);
  assert.equal((await db.query('select count(*)::int as n from maintenance_private.account_closure_reviews')).rows[0].n,0);
  refuseFinal=false;const receipt=await port.request(scope,signal);
  assert.deepEqual(await port.read(scope,signal),receipt);
  assert.equal((await port.cancel(scope,signal)).state,'cancelled');
  assert.equal((await port.request(scope,signal)).state,'cancelled','same submission must not revive cancelled intake');
  assert.equal((await db.query('select count(*)::int as n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
