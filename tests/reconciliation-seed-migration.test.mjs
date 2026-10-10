import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('actual seed SQL selects only current owner/epoch/environment and denies clients or closed sessions',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010230223_ouchi_reconciliation_seed.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const token=(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
 const read=async(env='Sandbox',uid=user)=>(await db.query('select public.read_maintenance_reconciliation_seed($1,$2,$3,$4) as value',[uid,session,token,env])).rows[0].value;
 assert.equal(await read(),null);const event={environment:'Sandbox',transactionId:'1',originalTransactionId:'1',accountToken:token,productId:'ouchi.tip.small',signedAt:200,purchasedAt:100};
 const save=payload=>db.query('select public.apply_maintenance_verified_transaction($1,$2)',[JSON.stringify(payload),'a'.repeat(64)]);
 await save(event);assert.equal((await read()).productId,'ouchi.tip.small');assert.equal(await read('Production'),null);
 await save({...event,transactionId:'2',originalTransactionId:'2',productId:'ouchi.premium.monthly',signedAt:150,expiresAt:300});assert.equal((await read()).transactionId,'2');
 await assert.rejects(()=>read('Sandbox',other));
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>read());await db.exec('reset role;set role service_role');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await assert.rejects(()=>read());
 }finally{await db.close();}
});
