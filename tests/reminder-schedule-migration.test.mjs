import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const user='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',foreign='33333333-3333-4333-8333-333333333333';
test('actual schedule SQL requires live scoped paid rights, preserves expired settings and fences retry/concurrent edits',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
 await db.query('insert into auth.users values($1),($2)',[user,foreign]);await db.query('insert into auth.sessions values($1,$2,null)',[sid,user]);
 for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010220727_ouchi_verified_entitlement_read.sql','20261011054420_ouchi_reminder_schedule.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('set role service_role');
 const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as v',[user,sid])).rows[0].v;
 const read=async(env='Sandbox',u=user,s=sid,e=epoch)=>(await db.query('select public.read_maintenance_reminder_schedule($1,$2,$3,$4) as v',[u,s,e,env])).rows[0].v;
 const save=async(revision=0,minute=1230,days=[7],advance=1)=>(await db.query('select public.save_maintenance_reminder_schedule($1,$2,$3,$4,$5,$6,$7::smallint[],$8,false) as v',[user,sid,epoch,'Sandbox',revision,minute,days,advance])).rows[0].v;
 const free={minuteOfDay:540,weekdays:[1,2,3,4,5,6,7],leadDays:0,includeOverdue:true};
 assert.deepEqual((await read()).effective,free);await assert.rejects(()=>save(),/Premium required/);
 const now=Date.now();await db.query("insert into maintenance_private.transaction_ownership values('Sandbox','synthetic-original',$1,$2)",[user,epoch]);
 await db.query("insert into maintenance_private.verified_transactions values('Sandbox','synthetic-transaction','synthetic-original',$1,$2,'ouchi.premium.monthly',$3,$4,$5,null,false,$6)",[user,epoch,now,now-1000,now+3600000,'a'.repeat(64)]);
 let value=await save();assert.equal(value.revision,1);assert.equal(value.premiumActive,true);assert.deepEqual(value.effective,{minuteOfDay:1230,weekdays:[7],leadDays:1,includeOverdue:false});
 assert.deepEqual(await save(),value);await assert.rejects(()=>save(0,1200),/reload required/);value=await save(1,1200);assert.equal(value.revision,2);await assert.rejects(()=>save(),/reload required/);
 for(const args of [[2,1440,[7],1],[2,540,[],0],[2,540,[1,1],0],[2,540,[8],0],[2,540,[1],2]])await assert.rejects(()=>save(...args),/Invalid notification settings/);
 await assert.rejects(()=>read('Sandbox',foreign),/Purchase account unavailable/);await assert.rejects(()=>read('Sandbox',user,foreign),/Purchase account unavailable/);await assert.rejects(()=>read('Sandbox',user,sid,foreign),/Purchase account unavailable/);
 assert.deepEqual((await read('Production')).effective,free);assert.equal((await read('Production')).saved,null);
 await db.query("update maintenance_private.verified_transactions set revoked_at=$1",[now]);value=await read();assert.equal(value.premiumActive,false);assert.deepEqual(value.effective,free);assert.equal(value.saved.minuteOfDay,1200);await assert.rejects(()=>save(2),/Premium required/);
 await db.exec('reset role');await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[sid]);await db.exec('set role service_role');await assert.rejects(()=>read(),/Purchase account unavailable/);
 await db.exec('reset role');
 // The existing deletion lease is stubbed in this focused settings test; real
 // lease/storage integration remains a separate CI test.
 await db.exec(`create function public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid) returns boolean language sql as $$ select $1='44444444-4444-4444-8444-444444444444'::uuid and $2='${user}'::uuid and $3='${epoch}'::uuid and $4='55555555-5555-4555-8555-555555555555'::uuid $$;grant execute on function public.maintenance_deletion_lease_is_current(uuid,uuid,uuid,uuid) to service_role;`);
 await db.query("insert into maintenance_private.reminder_schedules values($1,$2,'Sandbox',540,array[1]::smallint[],0,true,1)",[foreign,epoch]);
 await db.exec('set role service_role');
 const erase=async(lease='55555555-5555-4555-8555-555555555555')=>(await db.query('select public.erase_maintenance_deletion_reminder_schedule($1,$2,$3,$4) as v',['44444444-4444-4444-8444-444444444444',user,epoch,lease])).rows[0].v;
 assert.equal(await erase(),false); // Open app cannot be wiped.
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[user]);await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);
 assert.equal(await erase(foreign),false);assert.equal(await erase(null),false);assert.equal(await erase(),true);assert.equal(await erase(),true);
 const remaining=(await db.query('select user_id from maintenance_private.reminder_schedules')).rows;assert.deepEqual(remaining,[{user_id:foreign}]);
 await assert.rejects(()=>read(),/Purchase account unavailable/);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>read());await assert.rejects(()=>save());await assert.rejects(()=>erase());await assert.rejects(()=>db.query('select * from maintenance_private.reminder_schedules'));}
 }finally{await db.close();}
});
