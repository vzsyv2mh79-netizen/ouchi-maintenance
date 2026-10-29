import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,os,oe} from './fixtures/home-handoff-identifiers.mjs';
const modules=new Map();
function moduleURL(name){
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(dependency.endsWith('.mjs')?import.meta.resolve('../lib/'+dependency):moduleURL(dependency))}`);
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
}
const {createAccountClosureReviewPrivateTransactions}=await import(moduleURL('account-closure-review-private-transactions'));
const {HOME_HANDOFF_AUTH_USER_PIN_SQL,HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL}=await import(moduleURL('home-handoff-identity'));
const submission='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec(`reset role;
 alter table auth.users add column email text;alter table auth.users add column encrypted_password text;
 alter table auth.sessions add column aal text default 'aal1';alter table auth.sessions add column refreshed_at timestamp;
 create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,secret text);`);
 await db.query('update auth.users set email=$2,encrypted_password=$3 where id=$1',[owner,'synthetic@example.invalid','synthetic-password-hash']);
 await db.query('insert into auth.mfa_factors values($1,$2,$3,$4)',['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner,'unverified','synthetic-factor-secret']);
 await db.exec(readFileSync('supabase/migrations/20261014061605_ouchi_account_closure_review.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261014061618_ouchi_closure_review_private_access.sql','utf8'));
 return db;
}
async function context(db,user=owner){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user})]);}
test('private executor cannot read or edit underlying Auth/family/review tables or enable intake',async()=>{
 const db=await fixture();try{
  await context(db);await db.exec('set role ouchi_closure_review_executor');
  for(const sql of ['select encrypted_password from auth.users','update auth.users set encrypted_password=encrypted_password','delete from auth.sessions','select * from public.products','delete from public.homes','select * from maintenance_private.account_closure_reviews','update maintenance_private.account_closure_review_policy set enabled=true','select public.erase_maintenance_data()'])await assert.rejects(db.query(sql),/permission denied/);
  const flags=(await db.query("select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname=current_user")).rows[0];
  assert.deepEqual(flags,{rolcanlogin:false,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false});
  const state=(await db.query('select * from maintenance_private.closure_review_auth_state($1)',[owner])).rows[0].reauthentication_state;
  assert.match(state.password,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify(state).includes('synthetic-password-hash'),false);assert.equal(JSON.stringify(state).includes('synthetic-factor-secret'),false);assert.match(state.factors[0].digest,/^[0-9a-f]{64}$/);
  await assert.rejects(db.query('select * from maintenance_private.closure_review_auth_state($1)',[recipient]),/actor context required/);
 }finally{await db.close();}
});
test('private helpers deny anonymous/authenticated/service callers and require own actor context',async()=>{
 const db=await fixture();try{
  for(const role of ['anon','authenticated','service_role']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from maintenance_private.closure_review_auth_state($1)',[owner]),/permission denied/);}
  await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");await db.exec('set role ouchi_closure_review_executor');
  await assert.rejects(db.query('select * from maintenance_private.closure_review_pin_constraints()'),/actor context required/);
 }finally{await db.close();}
});
test('restricted helpers support current pins and review/cancel without family mutation or policy activation',async()=>{
 const db=await fixture();try{
  await context(db);await db.exec('set role ouchi_closure_review_executor');
  await assert.rejects(db.query("select * from maintenance_private.closure_review_execute('request',$1,$2,$3,$4)",[owner,os,oe,submission]),/Review intake unavailable/);
  await db.exec('reset role;update maintenance_private.account_closure_review_policy set enabled=true');
  const before=(await db.query('select to_jsonb(h) value from public.homes h order by id')).rows;
  await db.exec('set role ouchi_closure_review_executor;begin');
  assert.equal((await db.query('select * from maintenance_private.closure_review_session($1,$2,null,null)',[os,owner])).rows[0].epoch_id,oe);
  assert.equal((await db.query('select * from maintenance_private.closure_review_pin_constraints()')).rows[0].supported,true);
  for(const [fn,args] of [['pin_user',[owner]],['pin_session',[os,owner]],['pin_factors',[owner]],['pin_enrollment',[owner,os]]])await db.query(`select * from maintenance_private.closure_review_${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
  const receipt=(await db.query("select * from maintenance_private.closure_review_execute('request',$1,$2,$3,$4)",[owner,os,oe,submission])).rows[0].receipt;assert.equal(receipt.state,'review_required');await db.exec('commit');
  assert.equal((await db.query("select * from maintenance_private.closure_review_execute('cancel',$1,$2,$3,$4)",[owner,os,oe,submission])).rows[0].receipt.state,'cancelled');
  await db.exec('reset role');assert.deepEqual((await db.query('select to_jsonb(h) value from public.homes h order by id')).rows,before);
 }finally{await db.close();}
});
test('private transport binds actor once and never sends raw Auth/table SQL to its connection',async()=>{
 const calls=[];const provider=createAccountClosureReviewPrivateTransactions({connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{id:owner}]};},abort:()=>{},close:async()=>{}})});
 await assert.rejects(provider.run(new AbortController().signal,async tx=>{await tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[owner]);await tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[recipient]);}),/Bound private review actor/);
 assert.equal(calls.some(([sql])=>sql===HOME_HANDOFF_AUTH_USER_PIN_SQL),false);
 assert.equal(calls.filter(([sql])=>sql.includes('request.jwt.claims')).length,1);
 assert.deepEqual(calls.find(([sql])=>sql.includes('request.jwt.claims'))[1],[JSON.stringify({sub:owner}),owner]);
 await assert.rejects(provider.run(new AbortController().signal,tx=>tx.query(HOME_HANDOFF_AUTH_PIN_CONSTRAINT_SQL,[])),/Bound private review actor/);
});

// A shared app may use the legacy actor GUC. The composed private transport
// must bind its server-verified actor in both forms, with no cross-user reuse.
test('private transport executes restricted SQL with legacy auth.uid and restores the prior transaction context',async()=>{
 const db=await fixture();try{
  await db.exec("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$");
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false)",[JSON.stringify({sub:recipient}),recipient]);
  await db.exec('set role ouchi_closure_review_executor');
  const provider=createAccountClosureReviewPrivateTransactions({connect:async()=>({query:(sql,args)=>db.query(sql,args),abort:()=>{},close:async()=>{}})});
  const result=await provider.run(new AbortController().signal,tx=>tx.query(HOME_HANDOFF_AUTH_USER_PIN_SQL,[owner]));
  assert.equal(result.rows.length,1);
  await db.exec('reset role');
  const restored=(await db.query("select current_setting('request.jwt.claims') claims,current_setting('request.jwt.claim.sub') subject,auth.uid()::text actor")).rows[0];
  assert.deepEqual(restored,{claims:JSON.stringify({sub:recipient}),subject:recipient,actor:recipient});
 }finally{await db.close();}
});
