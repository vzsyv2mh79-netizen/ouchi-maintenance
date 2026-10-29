import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('owned retired renewal is distinct from missing ownership and cannot create or update renewal records',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010220727_ouchi_verified_entitlement_read.sql','20261010224749_ouchi_verified_renewal_state.sql','20261011084235_ouchi_retired_renewal_ingestion.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',session='33333333-3333-4333-8333-333333333333';await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as v',[user,session])).rows[0].v;
 const transaction={environment:'Sandbox',transactionId:'1',originalTransactionId:'1',accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:100,purchasedAt:50,expiresAt:200};
 await db.query('select public.apply_maintenance_verified_transaction($1,$2)',[JSON.stringify(transaction),'a'.repeat(64)]);
 const snapshot={environment:'Sandbox',originalTransactionId:'1',accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:100,renewalDate:200,autoRenewStatus:1,isInBillingRetryPeriod:false};
 const save=async value=>(await db.query('select public.apply_maintenance_verified_renewal($1,$2) as v',[JSON.stringify(value),'b'.repeat(64)])).rows[0].v;
 const retired=async(original='1',token=epoch,environment='Sandbox')=>(await db.query('select public.read_maintenance_renewal_retirement($1,$2,$3) as v',[environment,original,token])).rows[0].v;
 assert.equal(await retired(),false);assert.equal(await retired('2'),null);assert.equal(await retired('1',null,'Production'),null);assert.equal(await save(snapshot),'inserted');
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);assert.equal(await retired(),true);assert.equal(await retired('1',null),true);
 assert.equal(await save({...snapshot,signedAt:201,renewalDate:300,autoRenewStatus:0}),'retired');assert.equal((await db.query('select signed_at from maintenance_private.verified_renewals')).rows[0].signed_at,100);
 await assert.rejects(()=>retired('1','44444444-4444-4444-8444-444444444444'));await assert.rejects(()=>save({...snapshot,autoRenewStatus:2}));await assert.rejects(()=>save({...snapshot,originalTransactionId:'2'}));
 await db.exec('reset role');await db.exec('delete from maintenance_private.verified_renewals');await db.exec('set role service_role');assert.equal(await save(snapshot),'retired');assert.equal((await db.query('select count(*) as n from maintenance_private.verified_renewals')).rows[0].n,0);
 await db.exec('reset role');await db.query('update maintenance_private.app_epochs set enabled=true,epoch_id=gen_random_uuid() where user_id=$1',[user]);await db.exec('set role service_role');assert.equal(await retired(),true);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>retired());await assert.rejects(()=>save(snapshot));}
 }finally{await db.close();}
});
