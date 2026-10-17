import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('fresh one-use enrollment proof binds exact session atomically, never reopens deletion or transfers rights',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz,created_at timestamptz default statement_timestamp());create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
 for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261011122749_ouchi_explicit_enrollment_guard.sql','20261011123511_ouchi_explicit_enrollment_consent.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',fresh='44444444-4444-4444-8444-444444444444',request='55555555-5555-4555-8555-555555555555',newRequest='66666666-6666-4666-8666-666666666666';
 await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2)',[session,user,fresh]);await db.exec('set role service_role');
 const grant=async(u=user,s=session,r=fresh,q=request)=>(await db.query('select public.enroll_maintenance_app_with_consent($1,$2,$3,$4) as value',[u,s,r,q])).rows[0].value;
 await assert.rejects(()=>grant());await db.exec('update maintenance_private.enrollment_policy set require_explicit=true where id=1');
 await assert.rejects(()=>grant(user,session,session));await assert.rejects(()=>grant(other));
 const receipt=await grant();assert.equal(receipt.userID,user);assert.equal(receipt.sessionID,session);assert.equal(receipt.requestID,request);assert.ok(receipt.epochID);assert.deepEqual(await grant(),receipt);
 await assert.rejects(()=>grant(user,session,fresh,newRequest));
 assert.equal((await db.query('select count(*)::int as n from maintenance_private.enrollment_consents')).rows[0].n,1);
 await db.exec('reset role');await db.query("insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id,state) values($1,$2,'pending')",[user,receipt.epochID]);await db.exec('set role service_role');await assert.rejects(()=>grant());
 await db.exec('reset role');await db.query("update maintenance_private.account_deletion_requests set state='complete' where user_id=$1",[user]);await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');await assert.rejects(()=>grant());
 await db.exec('reset role');await db.query('update maintenance_private.app_epochs set enabled=true where user_id=$1',[user]);await db.query("update auth.sessions set created_at=statement_timestamp()-interval '6 minutes' where id=$1",[fresh]);await db.exec('set role service_role');await assert.rejects(()=>grant());
 // Only expired proof bookkeeping is pruned; enrollment and Auth remain intact.
 await db.exec('reset role');await db.exec("update maintenance_private.enrollment_consents set expires_at=statement_timestamp()-interval '1 second'");await db.exec('set role service_role');assert.equal((await db.query('select public.prune_maintenance_enrollment_consents(1) as n')).rows[0].n,1);await assert.rejects(()=>grant());assert.equal((await db.query('select count(*)::int as n from maintenance_private.app_epochs')).rows[0].n,1);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,2);await db.exec('set role authenticated');await assert.rejects(()=>grant());await assert.rejects(()=>db.query('select public.prune_maintenance_enrollment_consents(1)'));
 }finally{await db.close();}
});
