import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('actual notification SQL deduplicates proof per environment and refuses clients/conflicting identities',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema maintenance_private;grant usage on schema maintenance_private to service_role;');
  await db.exec(readFileSync('supabase/migrations/20261010224129_ouchi_verified_notification_inbox.sql','utf8'));
  const payload={environment:'Sandbox',notificationId:'11111111-1111-4111-8111-111111111111',notificationType:'SUBSCRIBED',signedAt:100,disposition:'transaction_applied'},hash='a'.repeat(64);
  const save=async(record,proof=hash)=>(await db.query('select public.record_maintenance_verified_notification($1::jsonb,$2) as result',[JSON.stringify(record),proof])).rows[0].result;
  await db.exec('set role service_role');assert.equal(await save(payload),'inserted');assert.equal(await save(payload),'duplicate');assert.equal(await save({...payload,environment:'Production'}),'inserted');
  await assert.rejects(()=>save(payload,'b'.repeat(64)));await assert.rejects(()=>save({...payload,notificationType:'REFUND'}));await assert.rejects(()=>save({...payload,disposition:'needs_reconciliation'}));
  assert.equal((await db.query('select * from maintenance_private.verified_notifications')).rows.length,2);
  assert.equal(await save({...payload,notificationId:'22222222-2222-4222-8222-222222222222',notificationType:'DID_CHANGE_RENEWAL_STATUS',disposition:'needs_reconciliation'}),'inserted');
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>save(payload));await assert.rejects(()=>db.query('select * from maintenance_private.verified_notifications'));}
  await db.exec('reset role');const row=(await db.query("select relrowsecurity from pg_class where relname='verified_notifications'")).rows[0];assert.equal(row.relrowsecurity,true);
 }finally{await db.close();}
});
