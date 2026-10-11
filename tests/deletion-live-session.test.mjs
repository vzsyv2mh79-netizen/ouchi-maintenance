import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';import {PGlite} from '@electric-sql/pglite';
const modules=new Map();function moduleURL(name){if(modules.has(name))return modules.get(name);let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>'from '+JSON.stringify(moduleURL(dependency)));const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;}
const {deletionProgressDependencies}=await import(moduleURL('account-deletion-progress-store'));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const bearer=encode({alg:'synthetic'})+'.'+encode({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+3600})+'.synthetic';
test('progress checks signed session after Auth and again at read time without trusting user metadata',async()=>{
 let active=true,reads=0;const calls=[];
 const db={auth:{getUser:async token=>{assert.equal(token,bearer);return {data:{user:{id:user}},error:null};}},rpc:async(name,args)=>{calls.push([name,args]);if(name==='maintenance_auth_session_is_current')return {data:active,error:null};assert.equal(name,'read_maintenance_session_deletion_progress');reads++;return {data:active?{state:'running'}:null,error:null};}};
 const deps=deletionProgressDependencies(db);assert.equal(await deps.verify(bearer),user);active=false;
 assert.equal(await deps.read({requestID:null,userID:user},bearer),null);assert.equal(reads,1);assert.equal(await deps.verify(bearer),null);
 assert.deepEqual(calls[1][1],{target_user:user,verified_session:session,target_request:null});
 const unavailable=deletionProgressDependencies({...db,rpc:async()=>({error:{message:'offline'}})});await assert.rejects(()=>unavailable.verify(bearer));
});
test('actual SQL rejects expired, missing, foreign and client sessions and does not require an open app enrollment',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);grant usage on schema auth to service_role;grant select on auth.sessions to service_role;');
 await db.exec("create function public.read_maintenance_current_deletion_progress(uuid) returns jsonb language sql as $$ select jsonb_build_object('userID',$1,'state','running') $$;create function public.read_maintenance_deletion_progress(uuid,uuid) returns jsonb language sql as $$ select jsonb_build_object('requestID',$1,'userID',$2,'state','running') $$;");
 await db.query('insert into auth.sessions values($1,$2,null)',[session,user]);await db.exec(readFileSync('supabase/migrations/20261011052015_ouchi_deletion_live_session.sql','utf8'));await db.exec('set role service_role');
 const current=async(u=user,s=session)=>(await db.query('select public.maintenance_auth_session_is_current($1,$2) as v',[u,s])).rows[0].v;
 const read=async()=>(await db.query('select public.read_maintenance_session_deletion_progress($1,$2,null) as v',[user,session])).rows[0].v;
 assert.equal(await current(),true);assert.deepEqual(await read(),{userID:user,state:'running'});assert.equal(await current(other),false);assert.equal(await current(user,other),false);
 await db.exec('reset role');await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[session]);await db.exec('set role service_role');assert.equal(await current(),false);assert.equal(await read(),null);
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[session]);await db.exec('set role service_role');assert.equal(await current(),false);assert.equal(await read(),null);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>current());await assert.rejects(()=>read());}
 }finally{await db.close();}
});
