import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('private verified ledger isolates environments, identity and signed-event ordering',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
  for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
  const u='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',s='33333333-3333-4333-8333-333333333333',s2='44444444-4444-4444-8444-444444444444';
  await db.query('insert into auth.users values($1),($2)',[u,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[s,u,s2,other]);await db.exec('set role service_role');
  const bind=async(user,session)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as token',[user,session])).rows[0].token;
  const token=await bind(u,s),otherToken=await bind(other,s2),proof='a'.repeat(64);
  const event={environment:'Sandbox',transactionId:'100',originalTransactionId:'10',accountToken:token,productId:'ouchi.premium.monthly',signedAt:100,purchasedAt:50,expiresAt:200};
  const apply=async(payload)=>(await db.query('select public.apply_maintenance_verified_transaction($1,$2) as result',[JSON.stringify(payload),proof])).rows[0].result;
  assert.equal(await apply(event),'inserted');assert.equal(await apply(event),'ignored');assert.equal(await apply({...event,signedAt:101,revokedAt:101}),'updated');assert.equal(await apply(event),'ignored');
  assert.equal(await apply({...event,signedAt:101}),'ignored');assert.equal((await db.query('select revoked_at from maintenance_private.verified_transactions')).rows[0].revoked_at,101);
  await assert.rejects(()=>apply({...event,accountToken:otherToken,signedAt:102}));await assert.rejects(()=>apply({...event,originalTransactionId:'11',signedAt:102}));await assert.rejects(()=>apply({...event,productId:'ouchi.premium.annual',signedAt:102}));
  assert.equal(await apply({...event,environment:'Production'}),'inserted');assert.equal((await db.query('select * from maintenance_private.verified_transactions')).rows.length,2);
  assert.equal(await apply({...event,transactionId:'101',originalTransactionId:'20',productId:'ouchi.tip.small',expiresAt:undefined}),'inserted');
  await assert.rejects(()=>apply({...event,transactionId:'102',productId:'unlisted'}));await assert.rejects(()=>apply({...event,transactionId:'103',expiresAt:49}));
  await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[u]);assert.equal(await apply({...event,signedAt:102,revokedAt:102}),'updated');
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>apply(event));await assert.rejects(()=>db.query('select * from maintenance_private.verified_transactions'));
 }finally{await db.close();}
});
