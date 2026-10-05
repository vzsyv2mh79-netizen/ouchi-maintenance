import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const {outputText}=ts.transpileModule(readFileSync('lib/push-validation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {isPushEndpoint,validPushKeys,reminderPayload}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
test('push sender permits only HTTPS browser provider endpoints and valid key shapes',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/wp/test','https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test','https://wns2-by3p.notify.windows.com/w/?token=test'])assert.equal(isPushEndpoint(endpoint),true);
 for(const endpoint of ['http://fcm.googleapis.com/fcm/send/test','https://localhost/fcm/send/test','https://127.0.0.1/','https://fcm.googleapis.com.evil.test/fcm/send/test','https://fcm.googleapis.com:8080/fcm/send/test','https://evil@fcm.googleapis.com/fcm/send/test','https://fcm.googleapis.com/fcm/send/test#secret','https://notify.windows.com/w/'])assert.equal(isPushEndpoint(endpoint),false);
 assert.equal(validPushKeys('B'+'A'.repeat(86),'a'.repeat(22)),true);
 assert.equal(validPushKeys('A'.repeat(87),'a'.repeat(22)),false);
 assert.equal(validPushKeys('B'+'A'.repeat(86),'a'.repeat(21)),false);
 assert.deepEqual(reminderPayload(3,'2026-10-02'),{title:'おうちメンテ',body:'期限が来たお手入れが3件あります。アプリで確認してください。',tag:'ouchi-maintenance-2026-10-02',url:'/'});
 assert.throws(()=>reminderPayload(0,'2026-10-02'));
});
test('Postgres push isolation, shared due counts, leases, successful deduplication and erasure',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for(const file of ['20261001144732_household_storage.sql','20261001232931_atomic_import.sql','20261001233450_household_sharing.sql','20261001235138_account_data_erasure.sql','20261002004530_push_reminders.sql','20261005135600_push_test_delivery.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values($1),($2)',[alice,bob]);
  const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const asSender=async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role service_role');};
  const endpoint=n=>'https://fcm.googleapis.com/wp/device'+n;
  const subscribe=async n=>db.query('insert into public.maintenance_push_subscriptions(endpoint,p256dh,auth) values($1,$2,$3) returning id',[endpoint(n),'B'+'A'.repeat(86),'a'.repeat(22)]);
  const claim=async (size=100)=>(await db.query('select * from public.claim_maintenance_push($1)',[size])).rows;
  const finish=async(job,sent,expired=false)=>db.query('select public.finish_maintenance_push($1,$2,$3,$4,$5)',[job.id,job.claim_token,job.delivery_day,sent,expired]);
  await asUser(alice);const home=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];
  const product={id:'44444444-4444-4444-8444-444444444444',homeId:home.id,categoryId:'aircon',maker:'Test',name:'Air',modelNumber:'TEST'};
  const date=(await db.query("select (now() at time zone 'Asia/Tokyo')::date as d")).rows[0].d;
  const task={id:'55555555-5555-4555-8555-555555555555',productId:product.id,name:'Clean',kind:'掃除',intervalDays:14,nextDueAt:date,sourceKind:'ユーザー設定'};
  await db.query('select public.add_product_with_tasks($1,$2)',[JSON.stringify(product),JSON.stringify([task])]);
  const aliceId=(await subscribe(1)).rows[0].id;
  await db.query('insert into public.maintenance_push_subscriptions(endpoint,p256dh,auth) values($1,$2,$3) on conflict(endpoint) do update set endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth returning id',[endpoint(1),'B'+'A'.repeat(86),'b'.repeat(22)]);
  assert.equal((await db.query('select * from public.maintenance_push_subscriptions')).rows.length,1);
  await assert.rejects(()=>db.query("update public.maintenance_push_subscriptions set last_sent_on=current_date"));
  for(const [column,value] of [['last_sent_on','2099-12-31'],['claimed_until','2099-12-31T00:00:00Z'],['claim_token','99999999-9999-4999-8999-999999999999']]){
   await assert.rejects(()=>db.query(`insert into public.maintenance_push_subscriptions(endpoint,p256dh,auth,${column}) values($1,$2,$3,$4)`,[endpoint(98),'B'+'A'.repeat(86),'a'.repeat(22),value]));
  }
  await assert.rejects(()=>claim());
  await assert.rejects(()=>db.query('insert into public.maintenance_push_subscriptions(endpoint,p256dh,auth) values($1,$2,$3)',['https://localhost/','B'+'A'.repeat(86),'a'.repeat(22)]));
  await assert.rejects(()=>db.query('insert into public.maintenance_push_subscriptions(user_id,endpoint,p256dh,auth) values($1,$2,$3,$4)',[bob,endpoint(99),'B'+'A'.repeat(86),'a'.repeat(22)]));
  for(let i=2;i<=10;i++)await subscribe(i);
  await assert.rejects(()=>subscribe(11));
  await db.query('delete from public.maintenance_push_subscriptions where id<>$1',[aliceId]);
  const code=(await db.query('select public.create_home_invite($1) as code',[home.id])).rows[0].code;
  await asUser(bob);const bobId=(await subscribe(20)).rows[0].id;assert.equal((await db.query('select * from public.maintenance_push_subscriptions')).rows.length,1);
  assert.equal((await db.query('delete from public.maintenance_push_subscriptions where id=$1 returning id',[aliceId])).rows.length,0);
  await db.query('select public.accept_home_invite($1,$2)',[code,'Family']);
  await assert.rejects(()=>db.query('select * from public.claim_maintenance_push_test($1,$2)',[bob,endpoint(20)]));
  await assert.rejects(()=>db.query('select * from public.maintenance_push_test_limits'));
  await asSender();
  const testClaim=async(id,url)=>db.query('select * from public.claim_maintenance_push_test($1,$2)',[id,url]);
  await assert.rejects(()=>testClaim(alice,endpoint(20)));
  assert.equal((await testClaim(alice,endpoint(1))).rows.length,1);
  await assert.rejects(()=>testClaim(alice,endpoint(1)));
  assert.equal((await testClaim(bob,endpoint(20))).rows.length,1);
  await db.query("update public.maintenance_push_test_limits set requested_at=now()-interval '2 minutes' where user_id=$1",[alice]);
  assert.equal((await testClaim(alice,endpoint(1))).rows.length,1);
  const jobs=await claim();assert.equal(jobs.length,2);assert.ok(jobs.every(j=>Number(j.due_count)===1));assert.equal((await claim()).length,0);
  await finish(jobs[0],true);await finish(jobs[1],false);assert.equal((await claim()).length,0);
  await db.query("update public.maintenance_push_subscriptions set claimed_until=now()-interval '1 minute' where id=$1",[jobs[1].id]);
  const retry=(await claim())[0];assert.equal(retry.id,jobs[1].id);assert.notEqual(retry.claim_token,jobs[1].claim_token);
  await finish(jobs[1],true);assert.equal((await claim()).length,0); // stale worker cannot release the new lease
  await finish(retry,true);assert.equal((await claim()).length,0);
  await db.query('update public.maintenance_push_subscriptions set last_sent_on=null');
  await asUser(alice);await db.query('delete from public.home_members where user_id=$1',[bob]);
  await asSender();const afterLeave=await claim();assert.equal(Number(afterLeave.find(j=>j.id===aliceId).due_count),1);assert.equal(Number(afterLeave.find(j=>j.id===bobId).due_count),0);
  await finish(afterLeave.find(j=>j.id===aliceId),false,true);assert.equal((await db.query('select * from public.maintenance_push_subscriptions where id=$1',[aliceId])).rows.length,0);
  await asUser(bob);await db.query('select public.erase_maintenance_data()');assert.equal((await db.query('select * from public.maintenance_push_subscriptions')).rows.length,0);
  await asSender();assert.equal((await db.query('select * from public.maintenance_push_test_limits')).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from public.maintenance_push_subscriptions'));await assert.rejects(()=>claim());
 }finally{await db.close();}
});
