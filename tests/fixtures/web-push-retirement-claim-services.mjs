/** Real PostgreSQL independent-connection lock witness. Disposable users only.
 * Auth/epoch/closure-state setup here is privileged fixture input; actual full
 * reviewed-retirement behavior is separately exercised by the parent suite.
 */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
export async function verifyWebPushRetirementClaimServices({db,options}){
 assert.equal(process.env.OUCHI_WEB_PUSH_CLAIM_SERVICE_TEST,'true');
 const migration='supabase/migrations/20261016234937_ouchi_retired_web_push_claim_guard.sql';await db.query(readFileSync(migration,'utf8'));
 const users=[randomUUID(),randomUUID()],epochs=[randomUUID(),randomUUID()],ids=['00000000-0000-4000-9000-000000000001','00000000-0000-4000-9000-000000000002'];
 for(let i=0;i<2;i++){
  const h=randomUUID(),p=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[users[i],randomUUID()+'@example.invalid']);
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[users[i],epochs[i]]);await db.query('insert into maintenance_private.account_access values($1,true)',[users[i]]);
  await db.query('insert into public.homes(id,owner_id,name) values($1,$2,$3)',[h,users[i],'Synthetic push concurrency home']);await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[p,h,'air','Synthetic push concurrency product']);
  await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[randomUUID(),p,'Synthetic due work','掃除','ユーザー設定']);
  await db.query('insert into public.maintenance_push_subscriptions(id,user_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5)',[ids[i],users[i],'https://web.push.apple.com/'+ids[i],'a'.repeat(87),'a'.repeat(22)]);
 }
 await db.query("create role ouchi_web_claim_ci_login login password 'synthetic-web-claim-ci-only';grant service_role to ouchi_web_claim_ci_login");
 const claim=new Client({...options,user:'ouchi_web_claim_ci_login',password:'synthetic-web-claim-ci-only',application_name:'ouchi-web-claim-ci'}),retire=new Client({...options,application_name:'ouchi-web-retirement-ci'});await claim.connect();await retire.connect();
 const row=async()=>(await db.query('select * from public.maintenance_push_subscriptions where id=$1',[ids[0]])).rows[0];
 const setOpen=async(c,open)=>{await c.query('update maintenance_private.account_access set enabled=$2 where user_id=$1',[users[0],open]);await c.query('update maintenance_private.app_epochs set enabled=$2 where user_id=$1',[users[0],open]);};
 let waiting;const cases=[];
 try{
  await claim.query('set role service_role');await assert.rejects(claim.query('set role postgres'),/permission denied/);
  const before=await row();await retire.query('begin');await retire.query('select pg_advisory_xact_lock(hashtext($1))',[users[0]]);await setOpen(retire,false);
  // Retirement holds the common account lock with its changes uncommitted.
  // Claim sees an old open snapshot but skips that account without a row lock.
  const first=(await claim.query('select * from public.claim_maintenance_push(2)')).rows;assert.ok(first.some(r=>r.id===ids[1]));assert.ok(first.every(r=>r.id!==ids[0]));assert.deepEqual(await row(),before);await retire.query('commit');
  await claim.query('select * from public.claim_maintenance_push(100)');assert.deepEqual(await row(),before);
  cases.push('actual restricted service login skips account whose retirement lock is held, does not deadlock or modify its row despite prior open snapshot, and still claims the next active family account');
  await setOpen(db,true);await db.query('update public.maintenance_push_subscriptions set claimed_until=null,claim_token=null,last_sent_on=null where id=any($1::uuid[])',[ids]);
  await claim.query('begin');const granted=(await claim.query('select * from public.claim_maintenance_push(1)')).rows;assert.equal(granted[0].id,ids[0]);assert.ok(granted[0].claim_token);
  await retire.query('begin');let resolved=false;waiting=retire.query('select pg_advisory_xact_lock(hashtext($1))',[users[0]]).then(()=>{resolved=true;});
  let lockSeen=false;for(let i=0;i<80;i++){if((await db.query("select exists(select 1 from pg_stat_activity where application_name='ouchi-web-retirement-ci' and wait_event_type='Lock') found")).rows[0].found){lockSeen=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(lockSeen,true);assert.equal(resolved,false);await claim.query('commit');await waiting;waiting=null;await setOpen(retire,false);await retire.query('commit');
  const leased=await row();await claim.query('select * from public.claim_maintenance_push(100)');assert.deepEqual(await row(),leased);
  await db.query("update public.maintenance_push_subscriptions set claimed_until=clock_timestamp()-interval '1 second' where id=$1",[ids[0]]);const expired=await row();await claim.query('select * from public.claim_maintenance_push(100)');assert.deepEqual(await row(),expired);
  cases.push('opposite order: actual retirement connection is observed waiting for claimant account lock; after claim commits retirement closes context, and neither live nor expired old lease is renewed');
  const p=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('web_push_account_is_open','claim_maintenance_push') and n.nspname in ('public','maintenance_private')")).rows;assert.equal(p.length,2);for(const f of p){assert.equal(f.prosecdef,false);assert.equal(f.anon,false);assert.equal(f.authenticated,false);assert.equal(f.service,true);assert.ok(f.proconfig.includes('search_path=""'));}
  await claim.query('begin isolation level repeatable read');await assert.rejects(claim.query('select * from public.claim_maintenance_push(100)'),/read committed/);await claim.query('rollback');
  cases.push('actual non-superuser runtime cannot become postgres; both functions remain service-only invokers with empty search_path and reject repeatable-read dispatch snapshots');
  return {status:'passed',passed:cases.length,cases,migrationSHA256:createHash('sha256').update(readFileSync(migration)).digest('hex'),driverSHA256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),productionChanged:false,fullReviewedRetirementConcurrency:false};
 }finally{
  await claim.query('rollback').catch(()=>{});await waiting?.catch(()=>{});await retire.query('rollback').catch(()=>{});await claim.end();await retire.end();
 }
}
