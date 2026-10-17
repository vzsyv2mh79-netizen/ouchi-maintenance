import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {seedClosureReauthenticationDatabase} from './fixtures/closure-reauth-database.mjs';
import {owner,os,oe,recipient,re} from './fixtures/home-handoff-identifiers.mjs';
const marker='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',temporary='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',requestID='cccccccc-cccc-4ccc-8ccc-cccccccccccc',lease='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const agent='OuchiMaintenance/closure-reauth/v1/'+marker;
async function seed(db){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner})]);await db.query('select maintenance_private.closure_reauth_register($1,$2,$3,$4)',[owner,os,oe,marker]);await db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]);}
test('private worker recovers expired markers, purges aged metadata and restores caller context',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await seed(db);await db.query("update maintenance_private.closure_reauth_markers set expires_at=clock_timestamp()-interval '1 second'");
  await db.exec('set role ouchi_closure_reauth_worker');
  await assert.rejects(db.query('select * from auth.sessions'),/permission denied/);await assert.rejects(db.query('select * from maintenance_private.closure_reauth_markers'),/permission denied/);
  assert.deepEqual((await db.query('select maintenance_private.closure_reauth_maintenance(1) as value')).rows[0].value,{closed:1,purged:0});
  assert.equal(JSON.parse((await db.query("select current_setting('request.jwt.claims') as value")).rows[0].value).sub,owner);
  await db.exec("reset role;update maintenance_private.closure_reauth_markers set closed_at=clock_timestamp()-interval '2 days';set role ouchi_closure_reauth_worker");
  assert.deepEqual((await db.query('select maintenance_private.closure_reauth_maintenance(1) as value')).rows[0].value,{closed:0,purged:1});
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[os])).rows[0].n,1);
  await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]),/agent closed/);
  for(const role of ['anon','authenticated','service_role','ouchi_closure_review_executor']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select maintenance_private.closure_reauth_maintenance(1)'),/permission denied/);}
 }finally{await db.close();}
});
test('erasure requires matching live lease and retired enrollment; completion refuses retained markers',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await seed(db);await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes')",[requestID,owner,oe,lease]);
  const args=[requestID,owner,oe,lease],erase=values=>db.query('select public.erase_maintenance_deletion_reauth_markers($1,$2,$3,$4) as value',values);
  await assert.rejects(db.query("update maintenance_private.account_deletion_requests set state='complete',lease_token=null,lease_until=null where id=$1",[requestID]),/marker erasure required/);
  await db.exec('set role service_role');assert.equal((await erase(args)).rows[0].value,false,'active enrollment cannot declare scope cleanup');
  await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
  await db.exec('set role service_role');assert.equal((await erase([requestID,owner,oe,marker])).rows[0].value,false);assert.equal((await erase(args)).rows[0].value,true);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_reauth_markers')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[temporary])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[os])).rows[0].n,1);
  await assert.rejects(db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[temporary,owner,agent]),/agent closed/);
 }finally{await db.close();}
});
test('closure metadata erasure requires a retired exact live lease, removes all own review generations and preserves other actors',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await seed(db);
  const priorEpoch=randomUUID();
  for(const [user,epoch,state] of [[owner,oe,'review_required'],[owner,oe,'cancelled'],[owner,priorEpoch,'review_required'],[recipient,re,'review_required']]){
   await db.query("insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id,state,cancelled_at) values($1,$2,$3,$4,case when $4='cancelled' then clock_timestamp() end)",[user,epoch,randomUUID(),state]);
  }
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes')",[requestID,owner,oe,lease]);
  const args=[requestID,owner,oe,lease],erase=values=>db.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4) as value',values);
  const snapshot=async()=>(await db.query('select to_jsonb(r) row from maintenance_private.account_closure_reviews r order by submission_id')).rows;
  const before=await snapshot();
  await db.query('insert into maintenance_private.closure_reauth_markers(marker_id,user_id,original_session,app_epoch,closed_at) values($1,$2,$3,$4,clock_timestamp())',[randomUUID(),owner,os,priorEpoch]);
  await db.exec('set role service_role');assert.equal((await erase(args)).rows[0].value,false);
  await db.exec('reset role');await db.query('update maintenance_private.app_epochs set epoch_id=$1 where user_id=$2',[priorEpoch,owner]);
  await db.exec('set role service_role');assert.equal((await erase(args)).rows[0].value,false,'stale job cannot erase a later active enrollment');
  await db.exec('reset role');await db.query('update maintenance_private.app_epochs set epoch_id=$1 where user_id=$2',[oe,owner]);
  await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
  await db.exec('set role service_role');
  for(const values of [[randomUUID(),owner,oe,lease],[requestID,recipient,re,lease],[requestID,owner,priorEpoch,lease],[requestID,owner,oe,randomUUID()]])assert.equal((await erase(values)).rows[0].value,false);
  await db.exec('reset role');assert.deepEqual(await snapshot(),before);
  await db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[requestID]);
  await db.exec('set role service_role');assert.equal((await erase(args)).rows[0].value,false);
  await db.exec('reset role');await db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()+interval '2 minutes' where id=$1",[requestID]);
  // Legacy marker-only workers cannot mark complete while review metadata remains.
  await db.exec('set role service_role');assert.equal((await db.query('select public.erase_maintenance_deletion_reauth_markers($1,$2,$3,$4) value',args)).rows[0].value,true);
  await db.exec('reset role');await db.query('delete from maintenance_private.closure_reauth_markers where app_epoch=$1',[priorEpoch]);
  await assert.rejects(db.query("update maintenance_private.account_deletion_requests set state='complete',lease_token=null,lease_until=null where id=$1",[requestID]),/Closure review erasure required/);
  await db.query('insert into maintenance_private.closure_reauth_markers(marker_id,user_id,original_session,app_epoch,closed_at) values($1,$2,$3,$4,clock_timestamp())',[randomUUID(),owner,os,priorEpoch]);
  for(const role of ['anon','authenticated','ouchi_closure_review_executor','ouchi_closure_reauth_worker']){
   await db.exec('set role '+role);await assert.rejects(erase(args),/permission denied/);await db.exec('reset role');
  }
  await db.exec('set role service_role');assert.equal((await erase(args)).rows[0].value,true);assert.equal((await erase(args)).rows[0].value,true);
  await db.exec('reset role');
  assert.deepEqual(await snapshot(),before.filter(({row})=>row.user_id!==owner));
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[os])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_reauth_markers where user_id=$1',[owner])).rows[0].n,0);
  assert.equal((await db.query('select enabled from maintenance_private.account_closure_review_policy')).rows[0].enabled,false);
 }finally{await db.close();}
});
test('review cleanup failure rolls back temporary-session and marker erasure in the same transaction',async()=>{
 const db=await seedClosureReauthenticationDatabase();try{
  await seed(db);
  await db.query('insert into maintenance_private.account_closure_reviews(user_id,app_epoch_id,submission_id) values($1,$2,$3)',[owner,oe,randomUUID()]);
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes')",[requestID,owner,oe,lease]);
  await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
  await db.exec("create function maintenance_private.synthetic_review_delete_failure() returns trigger language plpgsql as $$begin raise exception 'Synthetic review cleanup unavailable';end;$$;create trigger synthetic_review_delete_failure before delete on maintenance_private.account_closure_reviews for each row execute function maintenance_private.synthetic_review_delete_failure();set role service_role");
  const erase=()=>db.query('select public.erase_maintenance_deletion_closure_metadata($1,$2,$3,$4) as value',[requestID,owner,oe,lease]);
  await assert.rejects(erase(),/Synthetic review cleanup unavailable/);
  await db.exec('reset role');assert.equal((await db.query('select closed_at from maintenance_private.closure_reauth_markers where marker_id=$1',[marker])).rows[0].closed_at,null);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[temporary])).rows[0].n,1);
  await db.exec('drop trigger synthetic_review_delete_failure on maintenance_private.account_closure_reviews;set role service_role');assert.equal((await erase()).rows[0].value,true);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews')).rows[0].n,0);
 }finally{await db.close();}
});
const compile=name=>ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const {withClosureReauthenticationErasure}=await import(dataURL(compile('closure-reauth-erasure')));
const {createClosureReauthenticationMaintenance}=await import(dataURL(compile('closure-reauth-maintenance').replace("'./deletion-receipt-transactions.mjs'",JSON.stringify(import.meta.resolve('../lib/deletion-receipt-transactions.mjs')))));
test('maintenance stays disabled without acquisition and rejects unbounded batches before connecting',async()=>{
 let connects=0;const run=createClosureReauthenticationMaintenance({connect:async()=>{connects++;throw Error('not configured');}});
 assert.deepEqual(await run(new AbortController().signal),{state:'disabled'});
 for(const batch of [0,101,1.5,null])await assert.rejects(run(new AbortController().signal,batch),/Bounded cleanup/);
 assert.equal(connects,0);
});
test('reviewed records precede parent marker erasure and completion still requires durable marker acknowledgement',async()=>{
 const events=[],scope={requestID,userID:owner,epochID:oe,leaseToken:lease};let allowed=false;
 const deps={eraseRecords:async()=>{events.push('records');return true;},markComplete:async()=>{events.push('complete');return true;}};
 const wrapped=withClosureReauthenticationErasure(deps,{rpc:async(name,args)=>{assert.equal(name,'erase_maintenance_deletion_closure_metadata');assert.deepEqual(args,{target_request:requestID,target_user:owner,target_epoch:oe,target_lease:lease});events.push('markers');return {data:allowed,error:null};}});
 assert.equal(await wrapped.eraseRecords(scope),false);assert.equal(await wrapped.markComplete(scope),false);assert.deepEqual(events,['records','markers','markers']);
 allowed=true;assert.equal(await wrapped.eraseRecords(scope),true);assert.equal(await wrapped.markComplete(scope),true);assert.deepEqual(events.slice(-4),['records','markers','markers','complete']);
});

test('failed reviewed record cleanup preserves parent markers',async()=>{
 const events=[],scope={requestID,userID:owner,epochID:oe,leaseToken:lease};
 const deps={eraseRecords:async()=>{events.push('records-unconfirmed');return false;},markComplete:async()=>{events.push('complete');return true;}};
 const wrapped=withClosureReauthenticationErasure(deps,{rpc:async()=>{events.push('parent-markers');return {data:true,error:null};}});
 assert.equal(await wrapped.eraseRecords(scope),false);
 assert.deepEqual(events,['records-unconfirmed'],'Do not cascade the parent review while reviewed references remain');
});
