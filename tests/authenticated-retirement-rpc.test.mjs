import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reviewedCleanupFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {owner,recipient,other,home,product,request,os,rs} from './fixtures/home-handoff-identifiers.mjs';
import {expected,snapshot,retirementRpcCases} from './fixtures/retirement-rpc-cases.mjs';
async function act(db,user,session,sql,args=[]){
 await db.exec('begin');try{
  await db.exec('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated',session_id:session})]);
  const result=await db.query(sql,args);await db.exec('commit');return result.rows;
 }catch(error){await db.exec('rollback');throw error;}
}
async function fixture(){
 const ownHome=randomUUID(),ownProduct=randomUUID(),ownTask=randomUUID(),thirdSession=randomUUID(),thirdEpoch=randomUUID();
 let token;const f=await reviewedCleanupFixture({beforeCoverage:async f=>{
  await f.db.query('insert into public.homes(id,owner_id,name) values($1,$2,$3)',[ownHome,recipient,'Synthetic unshared RPC home']);await f.db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[ownProduct,ownHome,'air','Synthetic unshared RPC product']);await f.db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[ownTask,ownProduct,'Synthetic unshared task','掃除','ユーザー設定']);
  await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[thirdSession,other]);await f.db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[other,thirdEpoch]);await f.db.query('insert into maintenance_private.account_access values($1,true)',[other]);await f.db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[thirdSession,other,thirdEpoch]);
  token=(await act(f.db,owner,os,'select public.create_home_invite($1) token',[home]))[0].token;
 }});
 await f.db.exec(readFileSync('supabase/migrations/20261016224912_ouchi_legacy_erasure_review_guard.sql','utf8'));
 const productTemplate=(await f.db.query('select to_jsonb(p) value from public.products p where id=$1',[product])).rows[0].value,taskTemplate=(await f.db.query('select to_jsonb(t) value from public.maintenance_tasks t where id=$1',[request])).rows[0].value;
 const cases=retirementRpcCases({home,ownHome,ownTask,productTemplate,taskTemplate,token,other,thirdSession});return {...f,cases};
}
test('catalog of effective authenticated public RPCs is exactly the reviewed nine invokers',async()=>{
 const f=await fixture();try{
  const rows=(await f.db.query("select p.oid::regprocedure::text signature,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and has_function_privilege('authenticated',p.oid,'EXECUTE') order by signature")).rows;
  assert.deepEqual(rows.map(r=>r.signature),expected);for(const r of rows){assert.equal(r.prosecdef,false);assert.ok(r.proconfig.includes('search_path=""'));}
 }finally{await f.db.close();}
});
test('all nine original RPCs refuse retired identity including retained own home; no public/private/Auth metadata changes',async()=>{
 const f=await fixture();try{
  await f.retire.execute(f.execute,f.signal);const baseline=await snapshot(f.db);
  for(const c of f.cases){await assert.rejects(act(f.db,recipient,rs,c.sql,c.closed),undefined,c.sig);assert.deepEqual(await snapshot(f.db),baseline,c.sig+' must leave every local app/Auth table unchanged');}
 }finally{await f.db.close();}
});
test('valid active family controls still join/add/complete/invite/create/import/load/restore; old destructive erase stays refused in reviewed mode',async()=>{
 const f=await fixture();try{
  await f.retire.execute(f.execute,f.signal);
  for(const c of f.cases){
   if(c.activeDenied){const before=await snapshot(f.db);await assert.rejects(act(f.db,owner,os,c.sql,c.active),/Legacy maintenance erasure disabled/);assert.deepEqual(await snapshot(f.db),before);}
   else await act(f.db,c.user??owner,c.session??os,c.sql,c.active);
  }
  assert.equal((await f.db.query('select count(*)::int n from public.home_members where "homeId"=$1 and user_id=$2',[home,other])).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from public.home_members where user_id=$1',[recipient])).rows[0].n,0);
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in ($1,$2,$3)',[owner,recipient,other])).rows[0].n,3);
 }finally{await f.db.close();}
});
