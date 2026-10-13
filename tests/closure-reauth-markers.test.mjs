import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,os,oe} from './fixtures/home-handoff-identifiers.mjs';
const marker='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',temporary='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ordinary='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const agent='OuchiMaintenance/closure-reauth/v1/'+marker;
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec(`reset role;
 alter table auth.users add column email text;alter table auth.users add column encrypted_password text;
 alter table auth.sessions add column aal text default 'aal1';alter table auth.sessions add column refreshed_at timestamp;alter table auth.sessions add column user_agent text;
 create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
 create table auth.refresh_tokens(session_id uuid references auth.sessions(id) on delete cascade,token text);`);
 await db.exec(readFileSync('tests/fixtures/account-closure-review.sql','utf8'));await db.exec(readFileSync('tests/fixtures/closure-review-private-access.sql','utf8'));await db.exec(readFileSync('tests/fixtures/closure-reauth-markers.sql','utf8'));
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner})]);return db;
}
const call=(db,verb,args=[owner,os,oe,marker])=>db.query(`select maintenance_private.closure_reauth_${verb}(${args.map((_,i)=>'$'+(i+1)+'::uuid').join(',')}) as value`,args);
test('closing a marker removes only its temporary sessions/tokens and fences late inserts',async()=>{
 const db=await fixture();try{
  await db.exec('set role ouchi_closure_review_executor');assert.equal((await call(db,'register')).rows[0].value,true);
  await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3),($4,$2,$5)',[temporary,owner,agent,ordinary,'ordinary-device']);
  await db.query('insert into auth.refresh_tokens values($1,$2),($3,$4)',[temporary,'synthetic-temporary-token',ordinary,'synthetic-ordinary-token']);
  await db.exec('set role ouchi_closure_review_executor');assert.equal((await call(db,'observe')).rows[0].value,1);assert.equal((await call(db,'close')).rows[0].value,1);assert.equal((await call(db,'close')).rows[0].value,0);
  await assert.rejects(call(db,'register'),/marker unavailable/);
  await db.exec('reset role');await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]),/agent closed/);
  assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[owner])).rows.map(r=>r.id),[os,ordinary].sort());
  assert.deepEqual((await db.query('select token from auth.refresh_tokens')).rows,[{token:'synthetic-ordinary-token'}]);
 }finally{await db.close();}
});
test('missing, expired and foreign markers refuse marked inserts; clients cannot manipulate registry',async()=>{
 const db=await fixture();try{
  await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]),/agent closed/);
  await call(db,'register');
  await assert.rejects(call(db,'close',[owner,null,oe,marker]),/scope changed/);
  await assert.rejects(call(db,'close',[owner,os,null,marker]),/scope changed/);
  await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,recipient,agent]),/agent closed/);
  await db.query("update maintenance_private.closure_reauth_markers set expires_at=clock_timestamp()-interval '1 second'");
  await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]),/agent closed/);
  for(const role of ['anon','authenticated','service_role']){await db.exec('reset role;set role '+role);await assert.rejects(call(db,'close'),/permission denied/);}
  await db.exec('reset role;set role ouchi_closure_review_executor');await assert.rejects(db.query('delete from maintenance_private.closure_reauth_markers'),/permission denied/);
 }finally{await db.close();}
});
test('sweep recovers expired process-loss marker and purges aged closed metadata; missing-marker fence remains',async()=>{
 const db=await fixture();try{
  await call(db,'register');await db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]);
  await db.query("update maintenance_private.closure_reauth_markers set expires_at=clock_timestamp()-interval '1 second'");
  await db.exec('set role ouchi_closure_review_executor');assert.deepEqual((await call(db,'sweep',[owner,oe])).rows[0].value,{closed:1,purged:0});
  await db.exec("reset role;update maintenance_private.closure_reauth_markers set closed_at=clock_timestamp()-interval '2 days';set role ouchi_closure_review_executor");
  assert.deepEqual((await call(db,'sweep',[owner,oe])).rows[0].value,{closed:0,purged:1});
  await db.exec('reset role');await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]),/agent closed/);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[os])).rows[0].n,1);
 }finally{await db.close();}
});
