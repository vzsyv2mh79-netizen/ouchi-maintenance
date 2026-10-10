import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('explicit reenrollment isolates old sessions and delayed purchase epochs',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to service_role;');
 await db.exec(readFileSync('ios/Tests/Fixtures/account-epochs-prototype.sql','utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',oldSession='33333333-3333-4333-8333-333333333333',newSession='44444444-4444-4444-8444-444444444444',otherSession='55555555-5555-4555-8555-555555555555';
 await db.query('insert into auth.users values($1),($2)',[a,b]);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select maintenance_private.enroll_app_epoch($1,$2)',[a,oldSession]));await db.exec('reset role;set role service_role');
 const enroll=async(user,session)=>(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,session])).rows[0].epoch;
 const allowed=async(user,session,epoch=null)=>(await db.query('select maintenance_private.epoch_session_allowed($1,$2,$3) as allowed',[user,session,epoch])).rows[0].allowed;
 const oldEpoch=await enroll(a,oldSession),otherEpoch=await enroll(b,otherSession);
 assert.equal(await allowed(a,oldSession,oldEpoch),true);assert.equal(await allowed(a,otherSession),false);
 await assert.rejects(()=>enroll(a,newSession));
 assert.equal((await db.query('select maintenance_private.close_app_epoch($1,$2) as changed',[a,oldEpoch])).rows[0].changed,true);
 assert.equal(await allowed(a,oldSession),false);await assert.rejects(()=>enroll(a,oldSession));
 await db.exec(`reset role;create function maintenance_private.fail_synthetic_epoch() returns trigger language plpgsql as $$begin raise exception 'synthetic enrollment failure';end;$$;create trigger fail_epoch before insert on maintenance_private.app_session_epochs for each row execute function maintenance_private.fail_synthetic_epoch();set role service_role;`);
 await assert.rejects(()=>enroll(a,newSession));assert.equal(await allowed(a,newSession),false);
 await db.exec('reset role;drop trigger fail_epoch on maintenance_private.app_session_epochs;drop function maintenance_private.fail_synthetic_epoch();set role service_role');
 const newEpoch=await enroll(a,newSession);assert.notEqual(newEpoch,oldEpoch);
 assert.equal(await allowed(a,oldSession),false);assert.equal(await allowed(a,newSession,oldEpoch),false);assert.equal(await allowed(a,newSession,newEpoch),true);
 // A delayed old closure cannot disable the new identity.
 assert.equal((await db.query('select maintenance_private.close_app_epoch($1,$2) as changed',[a,oldEpoch])).rows[0].changed,false);
 assert.equal(await allowed(a,newSession),true);assert.equal(await allowed(b,otherSession,otherEpoch),true);
 await db.exec('reset role');assert.equal((await db.query('select * from auth.users')).rows.length,2);
 }finally{await db.close();}
});
