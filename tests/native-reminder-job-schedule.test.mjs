import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('stored paid schedule drives actual native enqueue/count/start SQL with expiry, day, membership and duplicate fences',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid);create table public.maintenance_tasks(id uuid primary key,"productId" uuid,"nextDueAt" date);create table public.home_members("homeId" uuid,user_id uuid);grant select on public.homes,public.products,public.maintenance_tasks,public.home_members to service_role;');
 for(const name of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010220727_ouchi_verified_entitlement_read.sql','20261011004515_ouchi_native_notification_registry.sql','20261011004715_ouchi_native_notification_registration.sql','20261011041519_ouchi_native_push_job_leases.sql','20261011042308_ouchi_native_push_daily_jobs.sql','20261011042826_ouchi_native_push_delivery_day_gate.sql','20261011054420_ouchi_reminder_schedule.sql','20261011102245_ouchi_native_reminder_job_schedule.sql','20261011103523_ouchi_native_push_purchase_scope.sql','20261011105102_ouchi_native_push_registration_lookup.sql','20261011105847_ouchi_native_push_scoped_jobs.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',foreign='33333333-3333-4333-8333-333333333333',home='44444444-4444-4444-8444-444444444444',product='55555555-5555-4555-8555-555555555555';
 await db.query('insert into auth.users values($1),($2)',[user,foreign]);await db.query('insert into auth.sessions values($1,$2,null)',[sid,user]);await db.query('insert into public.homes values($1,$2)',[home,user]);await db.query('insert into public.products values($1,$2)',[product,home]);
 await db.query(`insert into public.maintenance_tasks select gen_random_uuid(),$1,(clock_timestamp() at time zone 'Asia/Tokyo')::date+delta from unnest(array[-1,0,1,3,4]) delta`,[product]);
 await db.exec('set role service_role');
 const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as v',[user,sid])).rows[0].v;
 const register=async(token,environment='Sandbox')=>(await db.query('select public.register_maintenance_native_push($1,$2,$3,$4,$5) as v',[user,sid,epoch,token.repeat(32),environment])).rows[0].v;
 const device=await register('ab'),production=await register('cd','Production');
 const schedule=async(id=device)=>(await db.query('select maintenance_private.native_effective_schedule($1) as v',[id])).rows[0].v;
 const count=async()=>(await db.query('select maintenance_private.native_due_count($1) as v',[device])).rows[0].v;
 const enqueue=async(id=device)=>(await db.query('select public.enqueue_maintenance_native_daily_job($1) as v',[id])).rows[0].v;
 const free={minuteOfDay:540,weekdays:[1,2,3,4,5,6,7],leadDays:0,includeOverdue:true};assert.deepEqual(await schedule(),free);assert.equal(Number(await count()),2);assert.equal(await enqueue(production),null);
 const now=Date.now();await db.query("insert into maintenance_private.transaction_ownership values('Sandbox','synthetic-native-original',$1,$2)",[user,epoch]);await db.query("insert into maintenance_private.verified_transactions values('Sandbox','synthetic-native-transaction','synthetic-native-original',$1,$2,'ouchi.premium.monthly',$3,$4,$5,null,false,$6)",[user,epoch,now,now-1000,now+3600000,'a'.repeat(64)]);
 const weekday=(await db.query("select extract(dow from clock_timestamp() at time zone 'Asia/Tokyo')::integer+1 as v")).rows[0].v;
 let revision=0;const save=async(minute,days=[weekday],lead=3,overdue=false)=>{const v=(await db.query('select public.save_maintenance_reminder_schedule($1,$2,$3,$4,$5,$6,$7::smallint[],$8,$9) as v',[user,sid,epoch,'Sandbox',revision,minute,days,lead,overdue])).rows[0].v;revision=v.revision;return v;};
 await save(0,[weekday===7?1:weekday+1]);assert.equal(Number(await count()),3);assert.equal(await enqueue(),null,'unselected weekday');
 const minute=(await db.query("select extract(hour from clock_timestamp() at time zone 'Asia/Tokyo')::integer*60+extract(minute from clock_timestamp() at time zone 'Asia/Tokyo')::integer as v")).rows[0].v;
 if(minute<1439){await save(minute+1);assert.equal(await enqueue(),null,'future minute');}
 await save(0);assert.deepEqual(await schedule(production),free,'Legacy Production registration has no Sandbox purchase scope');
 const scopedArgs=[user,sid,epoch,'de'.repeat(32),'Production','Sandbox'];
 const scopedRegister=async(args=scopedArgs)=>(await db.query('select public.register_maintenance_native_scoped_push($1,$2,$3,$4,$5,$6) as v',args)).rows[0].v;
 const scopedDevice=await scopedRegister();assert.equal(await scopedRegister(),scopedDevice);
 const lookup=async(args=scopedArgs)=>(await db.query('select public.read_maintenance_native_scoped_registration($1,$2,$3,$4,$5,$6) as v',args)).rows[0].v;
 const registryCount=async()=>Number((await db.query('select count(*) as n from maintenance_private.native_notification_devices')).rows[0].n);
 const beforeLookup=await registryCount();assert.deepEqual(await lookup(),{registrationId:scopedDevice,enabled:true});assert.equal(await registryCount(),beforeLookup);
 assert.equal(await lookup([...scopedArgs.slice(0,3),'ef'.repeat(32),...scopedArgs.slice(4)]),null);assert.equal(await registryCount(),beforeLookup,'absent lookup does not register');
 assert.equal(await lookup([...scopedArgs.slice(0,5),'Production']),null);await assert.rejects(()=>lookup([foreign,...scopedArgs.slice(1)]),/Purchase account unavailable/);

 assert.deepEqual(await schedule(scopedDevice),{minuteOfDay:0,weekdays:[weekday],leadDays:3,includeOverdue:false},'distribution APNs uses independently scoped Sandbox purchase rights');
 await assert.rejects(()=>scopedRegister([...scopedArgs.slice(0,5),'Production']),/Destination already bound/);
 await assert.rejects(()=>scopedRegister([foreign,...scopedArgs.slice(1)]),/Purchase account unavailable/);
 const pageScoped=async(push='Production',purchase='Sandbox')=>(await db.query('select public.page_maintenance_native_scoped_devices($1,$2,null,25) as v',[push,purchase])).rows[0].v;
 assert.deepEqual(await pageScoped(),[scopedDevice]);assert.deepEqual(await pageScoped('Production','Production'),[]);assert.deepEqual(await pageScoped('Sandbox','Sandbox'),[],'legacy registrations are not formal scoped jobs');
 const scopedEnqueue=async(id=scopedDevice,purchase='Sandbox')=>(await db.query('select public.enqueue_maintenance_native_scoped_daily_job($1,$2,$3) as v',[id,'Production',purchase])).rows[0].v;
 assert.equal(await scopedEnqueue(scopedDevice,'Production'),null);const productionJob=await scopedEnqueue();assert.ok(productionJob);assert.equal(await scopedEnqueue(),productionJob);
 const scopedClaim=async(id=productionJob,purchase='Sandbox')=>(await db.query('select public.claim_maintenance_native_scoped_push_job($1,$2,$3) as v',[id,'Production',purchase])).rows[0].v;
 assert.equal(await scopedClaim(productionJob,'Production'),null);const productionLease=await scopedClaim();assert.ok(productionLease);assert.equal(await scopedClaim(),null);
 const scopedCount=async()=>(await db.query('select public.count_maintenance_native_scoped_job_due($1,$2,$3,$4) as v',[productionJob,productionLease,'Production','Sandbox'])).rows[0].v;
 assert.equal(Number(await scopedCount()),3);
 assert.equal((await db.query('select public.start_maintenance_native_scoped_push_job($1,$2,$3,$4) as v',[productionJob,productionLease,'Sandbox','Sandbox'])).rows[0].v,false);
 assert.equal((await db.query('select public.start_maintenance_native_scoped_push_job($1,$2,$3,$4) as v',[productionJob,productionLease,'Production','Sandbox'])).rows[0].v,true);
 const scopedFinish=async(id=productionJob,lease=productionLease,outcome='accepted',purchase='Sandbox')=>(await db.query('select public.finish_maintenance_native_scoped_push_job($1,$2,$3,$4,$5) as v',[id,lease,outcome,'Production',purchase])).rows[0].v;
 assert.equal(await scopedFinish(productionJob,productionLease,'accepted','Production'),false);assert.equal(await scopedFinish(),true);assert.equal(await scopedFinish(),true);assert.equal(await scopedClaim(),null);assert.equal(await scopedEnqueue(),productionJob);
 const invalidProduction=await scopedRegister([user,sid,epoch,'9a'.repeat(32),'Production','Sandbox']);const invalidProductionJob=await scopedEnqueue(invalidProduction),invalidLease=await scopedClaim(invalidProductionJob);assert.ok(invalidLease);
 assert.equal((await db.query('select public.start_maintenance_native_scoped_push_job($1,$2,$3,$4) as v',[invalidProductionJob,invalidLease,'Production','Sandbox'])).rows[0].v,true);
 assert.equal(await scopedFinish(invalidProductionJob,invalidLease,'disable-device'),true);assert.equal((await db.query('select public.maintenance_native_push_allowed($1) as v',[invalidProduction])).rows[0].v,false);
 const renewedProduction=await scopedRegister([user,sid,epoch,'9a'.repeat(32),'Production','Sandbox']);assert.notEqual(renewedProduction,invalidProduction);assert.equal(await scopedFinish(invalidProductionJob,invalidLease,'disable-device'),false);assert.equal((await db.query('select public.maintenance_native_push_allowed($1) as v',[renewedProduction])).rows[0].v,true);
 const scopedDisable=async(push='Production',purchase='Sandbox')=>(await db.query('select public.disable_maintenance_native_scoped_push($1,$2,$3,$4,$5,$6) as v',[user,sid,epoch,scopedDevice,push,purchase])).rows[0].v;
 assert.equal(await scopedDisable('Sandbox'),false);assert.equal(await scopedDisable('Production','Production'),false);

 const manual=(await db.query("insert into maintenance_private.native_notification_jobs(device_id,due_at,state) values($1,clock_timestamp()-interval '1 second','pending') returning id",[device])).rows[0].id;
 const manualLease=(await db.query('select public.claim_maintenance_native_push_job($1) as v',[manual])).rows[0].v;
 assert.equal((await db.query('select public.count_maintenance_native_job_due($1,$2) as v',[manual,manualLease])).rows[0].v,null,'historical manual work cannot bypass custom schedule');
 await db.query('delete from maintenance_private.native_notification_jobs where id=$1',[manual]);
 const job=await enqueue();assert.ok(job);assert.equal(await enqueue(),job);assert.equal(Number((await db.query('select count(*) as v from maintenance_private.native_notification_jobs where device_id=$1',[device])).rows[0].v),1);
 const lease=(await db.query('select public.claim_maintenance_native_push_job($1) as v',[job])).rows[0].v;assert.ok(lease);
 const due=async()=>(await db.query('select public.count_maintenance_native_job_due($1,$2) as v',[job,lease])).rows[0].v;
 const start=async()=>(await db.query('select public.start_maintenance_native_push_job($1,$2) as v',[job,lease])).rows[0].v;
 assert.equal(Number(await due()),3);
 // Family removal changes the trusted count, not a client-supplied badge.
 await db.exec('reset role');await db.query('update public.homes set owner_id=$1 where id=$2',[foreign,home]);await db.query('insert into public.home_members values($1,$2)',[home,user]);await db.exec('set role service_role');assert.equal(Number(await due()),3);
 await db.exec('reset role');await db.query('delete from public.home_members');await db.exec('set role service_role');assert.equal(Number(await due()),0);assert.equal(await start(),false);
 await db.exec('reset role');await db.query('update public.homes set owner_id=$1 where id=$2',[user,home]);await db.exec('set role service_role');
 await save(0,[weekday],1);assert.equal(await due(),null,'changed schedule invalidates queued job');assert.equal(await start(),false);assert.equal(await enqueue(),job,'same-day change cannot create second job');
 await save(0);assert.equal(Number(await due()),3);
 await db.query("update maintenance_private.verified_transactions set expires_at=$1",[now-1]);assert.deepEqual(await schedule(),free);assert.deepEqual(await schedule(scopedDevice),free);assert.equal(Number(await count()),2);assert.equal(await due(),null);assert.equal(await start(),false,'expired paid job cannot send custom count');
 await db.query("update maintenance_private.verified_transactions set expires_at=$1",[now+3600000]);assert.equal(Number(await due()),3);await db.query("update maintenance_private.verified_transactions set revoked_at=$1",[now]);assert.deepEqual(await schedule(),free);assert.equal(await start(),false);
 await db.query('update maintenance_private.verified_transactions set revoked_at=null');await db.query("update maintenance_private.native_notification_jobs set delivery_day=(clock_timestamp() at time zone 'Asia/Tokyo')::date-1 where id=$1",[job]);assert.equal(await due(),null);assert.equal(await start(),false);
 await db.query("update maintenance_private.native_notification_jobs set delivery_day=(clock_timestamp() at time zone 'Asia/Tokyo')::date where id=$1",[job]);assert.equal(await start(),true);assert.equal(await start(),false);
 await db.query("select public.finish_maintenance_native_push_job($1,$2,'accepted')",[job,lease]);assert.equal(await enqueue(),job,'accepted notification never gets re-enqueued');
 const beforeStoppedLookup=await registryCount();assert.equal(await scopedDisable(),true);assert.equal(await schedule(scopedDevice),null);assert.deepEqual(await lookup(),{registrationId:scopedDevice,enabled:false});assert.equal(await registryCount(),beforeStoppedLookup,'stopped lookup does not reactivate');
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[user]);assert.equal(await schedule(),null);assert.equal(await count(),null);assert.equal(await enqueue(),null);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>schedule());await assert.rejects(()=>count());await assert.rejects(()=>enqueue());await assert.rejects(()=>start());await assert.rejects(()=>scopedRegister());await assert.rejects(()=>scopedDisable());await assert.rejects(()=>lookup());await assert.rejects(()=>pageScoped());await assert.rejects(()=>scopedEnqueue());await assert.rejects(()=>scopedClaim());await assert.rejects(()=>scopedFinish());await assert.rejects(()=>scopedCount());}
 }finally{await db.close();}
});
