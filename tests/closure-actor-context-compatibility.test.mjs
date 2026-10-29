import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedClosureReauthenticationDatabase} from './fixtures/closure-reauth-database.mjs';
import {owner,recipient,os,oe} from './fixtures/home-handoff-identifiers.mjs';
const context=db=>db.query("select current_setting('request.jwt.claims',true) claims,current_setting('request.jwt.claim.sub',true) subject,auth.uid()::text actor").then(r=>r.rows[0]);
async function fixture(){
 const db=await seedClosureReauthenticationDatabase(),marker=randomUUID(),temporary=randomUUID(),request=randomUUID(),lease=randomUUID();
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner})]);
 await db.query('select maintenance_private.closure_reauth_register($1,$2,$3,$4)',[owner,os,oe,marker]);
 await db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,'OuchiMaintenance/closure-reauth/v1/'+marker]);
 await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[owner,oe,randomUUID()]);
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes')",[request,owner,oe,lease]);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
 await db.exec("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$");
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false)",[JSON.stringify({sub:recipient,role:'synthetic-preserved-context'}),recipient]);
 return {db,marker,temporary,args:[request,owner,oe,lease],erase:()=>db.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4) erased',[request,owner,oe,lease])};
}
test('legacy auth.uid cleanup binds its exact native actor and restores both prior contexts on success and failure',async()=>{
 const f=await fixture();try{
  const before=await context(f.db);
  await f.db.exec("create function maintenance_private.context_test_failure() returns trigger language plpgsql as $$begin raise exception 'Synthetic cleanup failure';end;$$;create trigger context_test_failure before delete on maintenance_private.account_closure_reviews for each row execute function maintenance_private.context_test_failure()");
  await assert.rejects(f.erase(),/Synthetic cleanup failure/);
  assert.deepEqual(await context(f.db),before);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id=$1',[f.temporary])).rows[0].n,1);
  await f.db.exec('drop trigger context_test_failure on maintenance_private.account_closure_reviews');
  assert.equal((await f.db.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4) erased',[...f.args.slice(0,3),randomUUID()])).rows[0].erased,false);
  assert.deepEqual(await context(f.db),before);
  assert.equal((await f.erase()).rows[0].erased,true);
  assert.deepEqual(await context(f.db),before);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id=$1',[f.temporary])).rows[0].n,0);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id=$1',[os])).rows[0].n,1);
 }finally{await f.db.close();}
});
test('restricted recovery worker supports legacy auth.uid and restores an unrelated caller context',async()=>{
 const f=await fixture();try{
  await f.db.query("update maintenance_private.closure_reauth_markers set expires_at=clock_timestamp()-interval '1 second' where marker_id=$1",[f.marker]);
  const before=await context(f.db);
  await f.db.exec('set role ouchi_closure_reauth_worker');
  assert.deepEqual((await f.db.query('select maintenance_private.closure_reauth_maintenance(1) result')).rows[0].result,{closed:1,purged:0});
  await assert.rejects(f.db.exec('select * from auth.sessions'),/permission denied/);
  await f.db.exec('reset role');
  assert.deepEqual(await context(f.db),before);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id=$1',[f.temporary])).rows[0].n,0);
 }finally{await f.db.close();}
});
