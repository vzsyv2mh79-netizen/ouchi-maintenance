import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Synthetic trusted JWT claims in an isolated DB; no real Auth or shared project.
test('old JWT session cannot regain household access after a new enrollment epoch',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
 for(const file of ['20261001144732_household_storage.sql','20261001232931_atomic_import.sql','20261001233450_household_sharing.sql','20261001235138_account_data_erasure.sql','20261002004530_push_reminders.sql','20261005134316_cloud_backup_restore.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 for(const file of ['account-access-prototype.sql','account-epochs-prototype.sql'])await db.exec(readFileSync('ios/Tests/Fixtures/'+file,'utf8'));
 // Integration experiment only. Production needs authenticated session validation,
 // migration of existing sessions and consistent use at every privileged boundary.
 await db.exec(`create or replace function maintenance_private.account_enabled() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from maintenance_private.account_access x join maintenance_private.app_epochs a on a.user_id=x.user_id and a.enabled join maintenance_private.app_session_epochs s on s.user_id=a.user_id and s.epoch_id=a.epoch_id where x.user_id=auth.uid() and x.enabled and s.session_id=case when auth.jwt()->>'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (auth.jwt()->>'session_id')::uuid else null end)$$;`);
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',oldSession='33333333-3333-4333-8333-333333333333',newSession='44444444-4444-4444-8444-444444444444',otherSession='55555555-5555-4555-8555-555555555555';
 await db.query('insert into auth.users values($1),($2)',[a,b]);await db.query('insert into maintenance_private.account_access values($1,true),($2,true)',[a,b]);
 const service=()=>db.exec('reset role;set role service_role');
 const user=async(id,session)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify(session===undefined?{}:{session_id:session})]);await db.exec('set role authenticated');};
 await service();const epoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[a,oldSession])).rows[0].epoch;await db.query('select maintenance_private.enroll_app_epoch($1,$2)',[b,otherSession]);
 await user(a,oldSession);const oldHome=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];
 await db.exec(`reset role;create function public.fail_synthetic_home_cleanup() returns trigger language plpgsql as $$begin raise exception 'synthetic cleanup failure';end;$$;create trigger fail_cleanup before delete on public.homes for each row execute function public.fail_synthetic_home_cleanup();`);
 await service();await assert.rejects(()=>db.query('select maintenance_private.close_app_identity($1,$2)',[a,epoch]));
 await user(a,oldSession);assert.equal((await db.query('select * from public.homes')).rows.length,1);
 await db.exec('reset role;drop trigger fail_cleanup on public.homes;drop function public.fail_synthetic_home_cleanup();');
 await service();await db.query('select maintenance_private.close_app_identity($1,$2)',[a,epoch]);
 await user(a,oldSession);assert.equal((await db.query('select * from public.homes')).rows.length,0);await assert.rejects(()=>db.query('select public.load_household()'));
 await db.exec(`reset role;create function maintenance_private.fail_synthetic_reenroll() returns trigger language plpgsql as $$begin if new.enabled then raise exception 'synthetic reenroll failure';end if;return new;end;$$;create trigger fail_reenroll before update on maintenance_private.account_access for each row execute function maintenance_private.fail_synthetic_reenroll();`);
 await service();await assert.rejects(()=>db.query('select maintenance_private.reenroll_app_identity($1,$2)',[a,newSession]));
 assert.equal((await db.query('select enabled,epoch_id from maintenance_private.app_epochs where user_id=$1',[a])).rows[0].enabled,false);
 assert.equal((await db.query('select session_id from maintenance_private.app_session_epochs where session_id=$1',[newSession])).rows.length,0);
 await db.exec('reset role;drop trigger fail_reenroll on maintenance_private.account_access;drop function maintenance_private.fail_synthetic_reenroll();');
 await service();await db.query('select maintenance_private.reenroll_app_identity($1,$2)',[a,newSession]);
 for(const session of [oldSession,otherSession,undefined,'malformed']){
  await user(a,session);assert.equal((await db.query('select * from public.homes')).rows.length,0);await assert.rejects(()=>db.query('select public.load_household()'));await assert.rejects(()=>db.query('select public.create_maintenance_home($1,$2)',['forbidden','home']));
 }
 await service();assert.equal((await db.query('select maintenance_private.close_app_identity($1,$2) as changed',[a,epoch])).rows[0].changed,false);
 await user(a,newSession);const fresh=(await db.query('select public.load_household() as data')).rows[0].data.homes[0];assert.notEqual(fresh.id,oldHome.id);
 await user(a,oldSession);assert.equal((await db.query('select * from public.homes')).rows.length,0);assert.equal((await db.query('update public.homes set name=$1 where id=$2 returning id',['forbidden',fresh.id])).rows.length,0);
 await user(b,otherSession);assert.equal((await db.query('select public.load_household() as data')).rows[0].data.homes.length,1);
 }finally{await db.close();}
});
