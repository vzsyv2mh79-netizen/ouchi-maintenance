import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('service entitlement read requires live binding and isolates environment, refunds and tips',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010220727_ouchi_verified_entitlement_read.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',session='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const token=(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
 const read=async(env='Sandbox',epoch=token)=>(await db.query('select public.read_maintenance_verified_entitlement($1,$2,$3,$4) as value',[user,session,epoch,env])).rows[0].value;
 const now=Date.now(),event={environment:'Sandbox',transactionId:'1',originalTransactionId:'1',accountToken:token,productId:'ouchi.premium.monthly',signedAt:now,purchasedAt:now-10000,expiresAt:now+3600000};
 const save=payload=>db.query('select public.apply_maintenance_verified_transaction($1,$2)',[JSON.stringify(payload),'a'.repeat(64)]);
 assert.equal((await read()).plan,'free');await save(event);assert.equal((await read()).plan,'premium');assert.equal((await read('Production')).plan,'free');
 await save({...event,signedAt:now+1,revokedAt:now});assert.equal((await read()).plan,'free');
 await save({...event,transactionId:'2',originalTransactionId:'2',productId:'ouchi.tip.small',expiresAt:undefined});assert.equal((await read()).plan,'free');
 await save({...event,transactionId:'3',originalTransactionId:'3',purchasedAt:now-20000,expiresAt:now-10000});assert.equal((await read()).plan,'free');
 await save({...event,transactionId:'4',originalTransactionId:'4',purchasedAt:now+3600000,expiresAt:now+7200000});assert.equal((await read()).plan,'free');
 await save({...event,transactionId:'5',originalTransactionId:'5',isUpgraded:true});assert.equal((await read()).plan,'free');
 await save({...event,environment:'Production'});assert.equal((await read('Production')).plan,'premium');assert.equal((await read()).plan,'free');
 await assert.rejects(()=>read('Other'));await assert.rejects(()=>read('Sandbox','44444444-4444-4444-8444-444444444444'));
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>read());await db.exec('reset role;set role service_role');
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await assert.rejects(()=>read());
 }finally{await db.close();}
});
