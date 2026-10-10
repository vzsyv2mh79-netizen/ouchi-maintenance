import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Repository-root invocation. In-memory DB only, no Supabase connection.
test('access gate denies old identity without deleting shared credentials',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const file of ['20261001144732_household_storage.sql','20261001232931_atomic_import.sql','20261001233450_household_sharing.sql','20261001235138_account_data_erasure.sql','20261002004530_push_reminders.sql','20261005134316_cloud_backup_restore.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(readFileSync('ios/Tests/Fixtures/account-access-prototype.sql','utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into maintenance_private.account_access values($1,true),($2,true)',[a,b]);
 await db.exec('create table public.other_app_records(user_id uuid references auth.users(id) on delete restrict,value text)');await db.query('insert into public.other_app_records values($1,$2)',[a,'preserved']);
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await user(a);const home=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];await assert.rejects(()=>db.query('update maintenance_private.account_access set enabled=true'));
 const endpoint='https://fcm.googleapis.com/wp/synthetic-lifecycle';
 await db.query('insert into public.maintenance_push_subscriptions(endpoint,p256dh,auth) values($1,$2,$3)',[endpoint,'B'+'A'.repeat(86),'a'.repeat(22)]);
 await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[a]);await user(a);
 assert.equal((await db.query('select * from public.homes')).rows.length,0);await assert.rejects(()=>db.query('select public.load_household()'));await assert.rejects(()=>db.query('select public.create_maintenance_home($1,$2)',['blocked','home']));assert.equal((await db.query('update public.homes set name=$1 where id=$2 returning id',['blocked',home.id])).rows.length,0);
 assert.equal((await db.query('select * from public.maintenance_push_subscriptions')).rows.length,0);
 await assert.rejects(()=>db.query('insert into public.maintenance_push_subscriptions(endpoint,p256dh,auth) values($1,$2,$3)',[endpoint+'-closed','B'+'A'.repeat(86),'a'.repeat(22)]));
 assert.equal((await db.query('update public.maintenance_push_subscriptions set endpoint=$1 returning id',[endpoint+'-changed'])).rows.length,0);
 const backup={homes:[{id:'44444444-4444-4444-8444-444444444444',name:'Restored',kind:'home'}],products:[],tasks:[],history:[]};
 await assert.rejects(()=>db.query('select public.restore_maintenance_backup($1,$2::jsonb)',['a'.repeat(64),JSON.stringify(backup)]));
 await db.exec('reset role');assert.equal((await db.query('select * from public.homes where id=$1',[backup.homes[0].id])).rows.length,0);assert.equal((await db.query('select * from public.maintenance_backup_restores')).rows.length,0);
 await user(b);assert.equal((await db.query('select public.load_household() as data')).rows[0].data.homes.length,1);assert.equal((await db.query('select public.restore_maintenance_backup($1,$2::jsonb) as ok',['a'.repeat(64),JSON.stringify(backup)])).rows[0].ok,true);const otherHome=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];
 const code=(await db.query('select public.create_home_invite($1) as code',[otherHome.id])).rows[0].code;
 await user(a);await assert.rejects(()=>db.query('select public.accept_home_invite($1,$2)',[code,'closed']));
 await db.exec('reset role');assert.equal((await db.query('select * from public.home_members where user_id=$1',[a])).rows.length,0);
 const unused=(await db.query("select used_at from public.home_invites where token_hash=sha256(convert_to($1,'UTF8'))",[code])).rows[0];assert.equal(unused.used_at,null);
 const c='33333333-3333-4333-8333-333333333333';await db.query('insert into auth.users values($1)',[c]);await db.query('insert into maintenance_private.account_access values($1,true)',[c]);
 await user(c);await db.query('select public.accept_home_invite($1,$2)',[code,'active']);await assert.rejects(()=>db.query('select public.accept_home_invite($1,$2)',[code,'replay']));
 await user(a);await assert.rejects(()=>db.query('select maintenance_private.close_account_access($1)',[b]));
 await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[a]);
 const lease='77777777-7777-4777-8777-777777777777';
 const device=(await db.query("update public.maintenance_push_subscriptions set claim_token=$1,claimed_until=now()+interval '5 minutes' where user_id=$2 returning id",[lease,a])).rows[0].id;
 await user(a);await assert.rejects(()=>db.query('select public.can_dispatch_maintenance_push($1,$2)',[device,lease]));
 await db.exec('reset role;set role service_role');assert.equal((await db.query('select public.can_dispatch_maintenance_push($1,$2) as allowed',[device,lease])).rows[0].allowed,true);assert.equal((await db.query('select public.can_dispatch_maintenance_push($1,$2) as allowed',[device,'88888888-8888-4888-8888-888888888888'])).rows[0].allowed,false);await db.exec('reset role');
 await db.exec('begin;set local role service_role');assert.equal((await db.query('select maintenance_private.close_account_access($1) as changed',[a])).rows[0].changed,true);await db.exec('rollback');
 assert.equal((await db.query('select enabled from maintenance_private.account_access where user_id=$1',[a])).rows[0].enabled,true);assert.equal((await db.query('select id from public.homes where id=$1',[home.id])).rows.length,1);assert.equal((await db.query('select id from public.maintenance_push_subscriptions where user_id=$1',[a])).rows.length,1);
 await db.exec(`create function public.synthetic_cleanup_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic cleanup failure';end;$$;create trigger synthetic_failure before delete on public.homes for each row execute function public.synthetic_cleanup_failure();`);
 await db.exec('set role service_role');await assert.rejects(()=>db.query('select maintenance_private.close_account_access($1)',[a]));await db.exec('reset role');assert.equal((await db.query('select enabled from maintenance_private.account_access where user_id=$1',[a])).rows[0].enabled,true);assert.equal((await db.query('select id from public.maintenance_push_subscriptions where user_id=$1',[a])).rows.length,1);assert.equal((await db.query('select id from public.homes where id=$1',[home.id])).rows.length,1);await db.exec('drop trigger synthetic_failure on public.homes;drop function public.synthetic_cleanup_failure()');
 await db.exec('set role service_role');assert.equal((await db.query('select maintenance_private.close_account_access($1) as changed',[a])).rows[0].changed,true);assert.equal((await db.query('select maintenance_private.close_account_access($1) as changed',[a])).rows[0].changed,false);assert.equal((await db.query('select public.can_dispatch_maintenance_push($1,$2) as allowed',[device,lease])).rows[0].allowed,false);await assert.rejects(()=>db.query('select maintenance_private.close_account_access($1)',['99999999-9999-4999-8999-999999999999']));
 await db.exec('reset role');assert.equal((await db.query('select id from public.homes where owner_id=$1',[a])).rows.length,0);assert.equal((await db.query('select id from public.maintenance_push_subscriptions where user_id=$1',[a])).rows.length,0);assert.equal((await db.query('select user_id from public.home_members where user_id=$1',[a])).rows.length,0);
 assert.equal((await db.query('select * from public.other_app_records')).rows[0].value,'preserved');assert.equal((await db.query('select * from auth.users')).rows.length,3);
 await user(a);await assert.rejects(()=>db.query('select public.load_household()'));await user(b);assert.equal((await db.query('select public.load_household() as data')).rows[0].data.homes.length,2);
 }finally{await db.close();}
});
