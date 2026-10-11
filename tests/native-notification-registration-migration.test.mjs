import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('native registration requires exact live session and isolates destinations',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);');
 for(const name of ['20261010141353_ouchi_billing_identity.sql','20261011004515_ouchi_native_notification_registry.sql','20261011004715_ouchi_native_notification_registration.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 const u='11111111-1111-4111-8111-111111111111',v='22222222-2222-4222-8222-222222222222',s='33333333-3333-4333-8333-333333333333',t='44444444-4444-4444-8444-444444444444';
 await db.query('insert into auth.users values($1),($2)',[u,v]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[s,u,t,v]);await db.exec('set role service_role');
 const epoch=async(a,b)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as e',[a,b])).rows[0].e;
 const e=await epoch(u,s),f=await epoch(v,t);
 const reg=async(a=u,b=s,c=e,env='Sandbox')=>(await db.query('select public.register_maintenance_native_push($1,$2,$3,$4,$5) as id',[a,b,c,'ab'.repeat(32),env])).rows[0].id;
 const allowed=async id=>(await db.query("select public.maintenance_native_push_allowed($1) as value",[id])).rows[0].value;
 const id=await reg();assert.equal(await allowed(id),true);assert.equal(await reg(),id);await assert.rejects(()=>reg(v,t,f));await assert.rejects(()=>reg(u,t,e));await assert.rejects(()=>reg(u,s,f));assert.notEqual(await reg(u,s,e,'Production'),id);
 const disable=async(a,b,c,d)=>(await db.query('select public.disable_maintenance_native_push($1,$2,$3,$4) as value',[a,b,c,d])).rows[0].value;
 assert.equal(await disable(v,t,f,id),false);assert.equal(await allowed(id),true);
 await db.query("insert into maintenance_private.native_notification_jobs(device_id,due_at,state) values($1,now(),'pending')",[id]);
 assert.equal(await disable(u,s,e,id),true);assert.equal(await disable(u,s,e,id),true);assert.equal(await allowed(id),false);
 assert.deepEqual((await db.query('select id from maintenance_private.native_notification_jobs')).rows,[]);
 const replacement=await reg();assert.notEqual(replacement,id);
 assert.equal(await disable(u,s,e,id),true);assert.equal(await allowed(replacement),true);
 await db.exec('reset role');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[s]);await db.exec('set role service_role');await assert.rejects(()=>reg());assert.equal(await allowed(replacement),false);
 await db.exec('reset role');await db.query('update auth.sessions set not_after=null where id=$1',[s]);await db.exec('set role service_role');assert.equal(await allowed(replacement),true);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[u]);assert.equal(await allowed(replacement),false);await assert.rejects(()=>reg());
 await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[u]);await db.query('update maintenance_private.app_epochs set epoch_id=gen_random_uuid() where user_id=$1',[u]);assert.equal(await allowed(replacement),false);await assert.rejects(()=>reg());
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>reg());await assert.rejects(()=>allowed(id));await assert.rejects(()=>db.query('select * from maintenance_private.native_notification_devices'));
 }finally{await db.close();}
});
