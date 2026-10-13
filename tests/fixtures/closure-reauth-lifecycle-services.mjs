import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {REAUTH_REGISTER_SQL} from '../../lib/closure-reauth-producer.mjs';
export async function verifyDisposableClosureReauthLifecycle({db,actor,origin,options,createAttachmentFetch,transactions,maintenance}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const baseline=(await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows;
 async function abandoned(){
  const marker=randomUUID(),agent='OuchiMaintenance/closure-reauth/v1/'+marker;
  await transactions.run(AbortSignal.timeout(10000),tx=>tx.query(REAUTH_REGISTER_SQL,[actor.user,actor.session,actor.epoch,marker]));
  const client=createClient(origin,'synthetic-public-key',{...options,global:{headers:{'User-Agent':agent},fetch:createAttachmentFetch(AbortSignal.timeout(10000),5000,65536)}});
  const login=await client.auth.signInWithPassword({email:actor.email,password:actor.password});assert.equal(login.error,null);assert.ok(login.data.session);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1 and user_agent=$2',[actor.user,agent])).rows[0].n,1);
  // Intentionally omit producer finally, representing a terminated app worker.
  return {marker,agent};
 }
 const first=await abandoned();
 await db.query("update maintenance_private.closure_reauth_markers set expires_at=clock_timestamp()-interval '1 second' where marker_id=$1",[first.marker]);
 await db.query('begin');
 try{
  await db.query('select pg_advisory_xact_lock(hashtext($1::text))',[actor.user]);
  const skipped=await maintenance(AbortSignal.timeout(10000),1);assert.deepEqual(skipped,{state:'processed',closed:0,purged:0},'Background worker must skip a busy foreground actor without reversing lock order');
 }finally{await db.query('rollback');}
 const recovered=await maintenance(AbortSignal.timeout(10000),1);assert.deepEqual(recovered,{state:'processed',closed:1,purged:0});
 assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baseline);
 await db.query("update maintenance_private.closure_reauth_markers set closed_at=clock_timestamp()-interval '2 days' where marker_id=$1",[first.marker]);
 assert.deepEqual(await maintenance(AbortSignal.timeout(10000),1),{state:'processed',closed:0,purged:1});
 await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[randomUUID(),actor.user,first.agent]),/agent closed/);
 const second=await abandoned(),request=randomUUID(),lease=randomUUID();
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes')",[request,actor.user,actor.epoch,lease]);
 await assert.rejects(db.query("update maintenance_private.account_deletion_requests set state='complete',lease_token=null,lease_until=null where id=$1",[request]),/marker erasure required/);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[actor.user]);
 try{
  await db.query('set role service_role');
  const erase=values=>db.query('select public.erase_maintenance_deletion_reauth_markers($1,$2,$3,$4) as erased',values);
  assert.equal((await erase([request,actor.user,actor.epoch,randomUUID()])).rows[0].erased,false);
  assert.equal((await erase([request,actor.user,actor.epoch,lease])).rows[0].erased,true);
 }finally{await db.query('reset role');}
 assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_reauth_markers where user_id=$1 and app_epoch=$2',[actor.user,actor.epoch])).rows[0].n,0);
 assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[actor.user])).rows,baseline);
 await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[randomUUID(),actor.user,second.agent]),/agent closed/);
 console.log('closure-review lifecycle actual Auth/PostgreSQL: restricted maintenance LOGIN skips busy actor, recovers process-loss session, purges aged metadata; exact deletion lease erases marker scope and completion refuses retained markers; original Auth preserved, no whole-account completion');
}
