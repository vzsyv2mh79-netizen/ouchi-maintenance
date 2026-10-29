import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('actual renewal SQL preserves paid cancellation, ordered grace and account/environment isolation',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010220727_ouchi_verified_entitlement_read.sql','20261010224749_ouchi_verified_renewal_state.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',session='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const token=(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
 const read=async(env='Sandbox')=>(await db.query('select public.read_maintenance_verified_entitlement($1,$2,$3,$4) as value',[user,session,token,env])).rows[0].value;
 const now=Date.now(),transaction={environment:'Sandbox',transactionId:'1',originalTransactionId:'1',accountToken:token,productId:'ouchi.premium.monthly',signedAt:now,purchasedAt:now-20000,expiresAt:now-10000};
 const save=async(payload)=>(await db.query('select public.apply_maintenance_verified_transaction($1,$2) as value',[JSON.stringify(payload),'a'.repeat(64)])).rows[0].value;
 const renew=async(payload)=>(await db.query('select public.apply_maintenance_verified_renewal($1,$2) as value',[JSON.stringify(payload),'b'.repeat(64)])).rows[0].value;
 await save(transaction);assert.equal((await read()).plan,'free');
 const snapshot={environment:'Sandbox',originalTransactionId:'1',accountToken:token,productId:transaction.productId,signedAt:now,renewalDate:transaction.expiresAt,autoRenewStatus:1,isInBillingRetryPeriod:true,gracePeriodExpiresAt:now+3600000};
 assert.equal(await renew(snapshot),'inserted');assert.equal(await renew(snapshot),'ignored');let rights=await read();assert.equal(rights.plan,'premium');assert.equal(rights.expiresAt,snapshot.gracePeriodExpiresAt);assert.equal((await read('Production')).plan,'free');
 await assert.rejects(()=>renew({...snapshot,accountToken:'44444444-4444-4444-8444-444444444444'}));await assert.rejects(()=>renew({...snapshot,renewalDate:snapshot.renewalDate+1}));await assert.rejects(()=>renew({...snapshot,productId:'ouchi.tip.small'}));
 await assert.rejects(()=>renew({...snapshot,isInBillingRetryPeriod:false}));
 assert.equal(await renew({...snapshot,signedAt:now+1,isInBillingRetryPeriod:false,gracePeriodExpiresAt:undefined,autoRenewStatus:0}),'updated');assert.equal((await read()).plan,'free');assert.equal(await renew(snapshot),'ignored');assert.equal((await read()).plan,'free');
 await renew({...snapshot,signedAt:now+2,gracePeriodExpiresAt:now-1000});assert.equal((await read()).plan,'free');
 await renew({...snapshot,signedAt:now+3});assert.equal((await read()).plan,'premium');await save({...transaction,signedAt:now+4,revokedAt:now});assert.equal((await read()).plan,'free');
 const paid={...transaction,transactionId:'2',originalTransactionId:'2',expiresAt:now+7200000};await save(paid);await renew({...snapshot,originalTransactionId:'2',renewalDate:paid.expiresAt,autoRenewStatus:0,isInBillingRetryPeriod:false,gracePeriodExpiresAt:undefined});assert.equal((await read()).expiresAt,paid.expiresAt);
 const olderGrace={...transaction,transactionId:'3',originalTransactionId:'3'};await save(olderGrace);const longGrace=now+14400000;
 await renew({...snapshot,originalTransactionId:'3',gracePeriodExpiresAt:longGrace});assert.equal((await read()).expiresAt,longGrace);
 await save({...olderGrace,transactionId:'4',signedAt:now+5,purchasedAt:now-15000,expiresAt:now-1000});assert.equal((await read()).expiresAt,paid.expiresAt);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>renew(snapshot));await assert.rejects(()=>db.query('select * from maintenance_private.verified_renewals'));}
 await db.exec('reset role;set role service_role');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await assert.rejects(()=>read());
 }finally{await db.close();}
});
