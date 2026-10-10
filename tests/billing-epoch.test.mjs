import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// Synthetic ledger payloads, not Apple signature or StoreKit proof.
test('late purchase events stay with closed enrollment and cannot transfer to a new enrollment',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to service_role,anon,authenticated;');
 await db.exec(readFileSync('ios/Tests/Fixtures/account-epochs-prototype.sql','utf8'));
 await db.exec(readFileSync('tests/fixtures/billing-schema.sql','utf8'));
 await db.exec(readFileSync('tests/fixtures/billing-epoch-prototype.sql','utf8'));
 const user='11111111-1111-4111-8111-111111111111',oldSession='22222222-2222-4222-8222-222222222222',newSession='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[user]);await db.exec('set role service_role');
 const enroll=async(session)=>(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,session])).rows[0].epoch;
 const old=await enroll(oldSession);
 const p={transactionId:'1',originalTransactionId:'1',accountToken:old,environment:'Sandbox',signedAt:100,productId:'ouchi.premium.monthly',expiresAt:300,purchasedAt:50};
 const save=value=>db.query('select public.apply_ouchi_sandbox_transaction($1::jsonb)',[JSON.stringify(value)]);
 await save(p);await save(p);
 await db.query('select maintenance_private.close_app_epoch($1,$2)',[user,old]);
 const fresh=await enroll(newSession);assert.notEqual(old,fresh);
 await save({...p,transactionId:'2',signedAt:200,expiresAt:400});
 assert.equal((await db.query('select * from public.ouchi_sandbox_transactions where app_epoch_id=$1',[fresh])).rows.length,0);
 await assert.rejects(()=>save({...p,transactionId:'3',accountToken:fresh}));
 await save({...p,signedAt:250,revokedAt:240});await save(p);
 assert.equal((await db.query('select payload from public.ouchi_sandbox_transactions where transaction_id=$1',['1'])).rows[0].payload.revokedAt,240);
 await assert.rejects(()=>save({...p,accountToken:user}));
 assert.equal((await db.query('select distinct user_id,app_epoch_id from public.ouchi_sandbox_transactions')).rows[0].user_id,user);
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>save(p));
 }finally{await db.close();}
});
