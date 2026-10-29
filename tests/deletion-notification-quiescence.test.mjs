import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {seedSharedNativeDevices,deviceTables} from './fixtures/shared-native-devices.mjs';
import {owner,recipient,oe,re} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role;delete from public.home_members');
 await seedSharedNativeDevices(db,[[owner,oe],[owner,randomUUID()],[recipient,re]]);
 const args=[randomUUID(),owner,oe,randomUUID()];
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes',true)",args);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
 const erase=kind=>db.query(`select public.erase_maintenance_deletion_${kind}($1,$2,$3,$4) erased`,args).then(r=>r.rows[0].erased);
 const snapshot=async()=>Object.fromEntries(await Promise.all(deviceTables.map(async table=>[table,(await db.query(`select to_jsonb(r) row from ${table} r order by to_jsonb(r)::text`)).rows])));
 return {db,args,erase,snapshot};
}

test('canonical Web cleanup refuses any claimed destination even when its deadline expired',async()=>{
 const f=await fixture();try{
  for(const marker of ["claim_token=gen_random_uuid(),claimed_until=clock_timestamp()-interval '1 hour'","claim_token=null,claimed_until=clock_timestamp()-interval '1 hour'","claim_token=gen_random_uuid(),claimed_until=null"]){
   await f.db.exec(`update public.maintenance_push_subscriptions set ${marker} where user_id='${owner}'`);
   const before=await f.snapshot();assert.equal(await f.erase('web_push'),false);assert.equal(await f.erase('records'),false);assert.deepEqual(await f.snapshot(),before);
  }
 }finally{await f.db.close();}
});

test('canonical native cleanup retains unknown and started sends after lease expiry',async()=>{
 const f=await fixture();try{
  for(const state of ['claimed','unknown']){
   await f.db.query("update maintenance_private.native_notification_jobs set state=$1,lease_id=$2,lease_until=clock_timestamp()-interval '1 hour',send_started_at=clock_timestamp()-interval '2 hours' where device_id in(select id from maintenance_private.native_notification_devices where user_id=$3)",[state,randomUUID(),owner]);
   const before=await f.snapshot();assert.equal(await f.erase('native_push'),false);assert.equal(await f.erase('records'),false);assert.deepEqual(await f.snapshot(),before);
  }
 }finally{await f.db.close();}
});

test('known quiet registrations retire across epochs without changing another actor or Auth',async()=>{
 const f=await fixture();try{
  await f.db.query("update public.maintenance_push_subscriptions set claim_token=$1,claimed_until=clock_timestamp()-interval '1 hour' where user_id=$2",[randomUUID(),recipient]);
  await f.db.query("update maintenance_private.native_notification_jobs set state='unknown',send_started_at=clock_timestamp() where device_id in(select id from maintenance_private.native_notification_devices where user_id=$1)",[recipient]);
  const before=await f.snapshot();
  for(let attempt=0;attempt<2;attempt++)for(const kind of ['web_push','native_push','native_delivery_identities'])assert.equal(await f.erase(kind),true);
  assert.equal(await f.erase('records'),true);
  const after=await f.snapshot();
  for(const table of deviceTables){
   const kept=table.endsWith('.native_notification_jobs')?before[table].filter(r=>before['maintenance_private.native_notification_devices'].some(d=>d.row.user_id===recipient&&d.row.id===r.row.device_id)):before[table].filter(r=>r.row.user_id===recipient);
   assert.deepEqual(after[table],kept);
  }
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in($1,$2)',[owner,recipient])).rows[0].n,2);
 }finally{await f.db.close();}
});

test('exact late sender acknowledgements resolve uncertainty before registration retirement',async()=>{
 const f=await fixture();try{
  const webLease=randomUUID();
  await f.db.query("update public.maintenance_push_subscriptions set claim_token=$1,claimed_until=clock_timestamp()-interval '1 hour' where user_id=$2",[webLease,owner]);
  const subscriptions=(await f.db.query('select id from public.maintenance_push_subscriptions where user_id=$1',[owner])).rows;
  assert.equal(await f.erase('web_push'),false);
  for(const row of subscriptions){
   const args=[row.id,randomUUID()];
   await f.db.query('select public.finish_maintenance_push($1,$2,current_date,true,false)',args);
   assert.equal((await f.db.query('select claim_token from public.maintenance_push_subscriptions where id=$1',[row.id])).rows[0].claim_token,webLease);
   await f.db.query('select public.finish_maintenance_push($1,$2,current_date,true,false)',[row.id,webLease]);
  }
  assert.equal(await f.erase('web_push'),true);
  const jobs=(await f.db.query('select j.id from maintenance_private.native_notification_jobs j join maintenance_private.native_notification_devices d on d.id=j.device_id where d.user_id=$1',[owner])).rows;
  const nativeLease=randomUUID();
  await f.db.query("update maintenance_private.native_notification_jobs set state='unknown',lease_id=$1,lease_until=clock_timestamp()-interval '1 hour',send_started_at=clock_timestamp()-interval '2 hours' where device_id in(select id from maintenance_private.native_notification_devices where user_id=$2)",[nativeLease,owner]);
  assert.equal(await f.erase('native_push'),false);
  for(const row of jobs){
   assert.equal((await f.db.query("select public.finish_maintenance_native_push_job($1,$2,'accepted') accepted",[row.id,randomUUID()])).rows[0].accepted,false);
   assert.equal((await f.db.query("select public.finish_maintenance_native_push_job($1,$2,'accepted') accepted",[row.id,nativeLease])).rows[0].accepted,true);
  }
  assert.equal(await f.erase('native_push'),true);
 }finally{await f.db.close();}
});
