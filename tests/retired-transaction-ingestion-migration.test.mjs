import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('retired enrollment cannot add ownership or periods; existing verified refunds remain ordered and other account stays open',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
  for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261011083324_ouchi_retired_transaction_ingestion.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',otherSession='44444444-4444-4444-8444-444444444444';
  await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[session,user,otherSession,other]);await db.exec('set role service_role');
  const bind=async(user,session)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as token',[user,session])).rows[0].token;
  const epoch=await bind(user,session),otherEpoch=await bind(other,otherSession),proof='a'.repeat(64);
  const event={environment:'Sandbox',transactionId:'100',originalTransactionId:'10',accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:100,purchasedAt:50,expiresAt:200};
  const apply=async value=>(await db.query('select public.apply_maintenance_verified_transaction($1,$2) as result',[JSON.stringify(value),proof])).rows[0].result;
  assert.equal(await apply(event),'inserted');
  await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[user]);
  assert.equal(await apply({...event,transactionId:'101',purchasedAt:150,expiresAt:250,signedAt:201}),'retired');
  assert.equal(await apply({...event,transactionId:'102',originalTransactionId:'20'}),'retired');
  assert.equal(await apply({...event,environment:'Production'}),'retired');
  assert.equal((await db.query('select count(*) as n from maintenance_private.transaction_ownership')).rows[0].n,1);assert.equal((await db.query('select count(*) as n from maintenance_private.verified_transactions')).rows[0].n,1);
  assert.equal(await apply({...event,signedAt:201,revokedAt:201}),'updated');assert.equal(await apply(event),'ignored');
  assert.equal((await db.query('select revoked_at from maintenance_private.verified_transactions')).rows[0].revoked_at,201);
  await assert.rejects(()=>apply({...event,productId:'ouchi.premium.annual',signedAt:202}));await assert.rejects(()=>apply({...event,transactionId:'103',signedAt:-1}));
  assert.equal(await apply({...event,accountToken:otherEpoch,transactionId:'200',originalTransactionId:'30'}),'inserted');
  await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[user]);await db.query('update maintenance_private.app_epochs set epoch_id=gen_random_uuid() where user_id=$1',[user]);await db.exec('set role service_role');
  assert.equal(await apply({...event,transactionId:'104',originalTransactionId:'40'}),'retired');
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>apply(event));await assert.rejects(()=>db.query('select * from maintenance_private.verified_transactions'));
 }finally{await db.close();}
});
