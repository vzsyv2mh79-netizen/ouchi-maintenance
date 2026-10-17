import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {seedSharedNativeDevices,deviceTables} from './fixtures/shared-native-devices.mjs';
import {owner,recipient,oe,re} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role;delete from public.home_members');await db.exec(readFileSync('supabase/migrations/20261016181203_ouchi_deletion_tail_checkpoints.sql','utf8'));
 await seedSharedNativeDevices(db,[[owner,oe],[owner,randomUUID()],[recipient,re]]);
 const args=[randomUUID(),owner,oe,randomUUID()];
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes',true)",args);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
 const erase=kind=>db.query(`select public.erase_maintenance_deletion_${kind}($1,$2,$3,$4) erased`,args).then(r=>r.rows[0].erased);
 const snapshot=async()=>Object.fromEntries(await Promise.all(deviceTables.map(async table=>[table,(await db.query(`select to_jsonb(r) row from ${table} r order by to_jsonb(r)::text`)).rows])));
 return {db,args,erase,snapshot};
}

test('server registration checkpoint requires every category absent across retained epochs and preserves bystander devices',async()=>{
 const f=await fixture();try{
  const confirmed=async args=>(await f.db.query('select public.maintenance_deletion_registrations_are_erased($1,$2,$3,$4) ok',args)).rows[0].ok;
  const before=(await f.db.query('select count(*)::int n from maintenance_private.native_notification_devices where user_id=$1',[recipient])).rows[0].n;
  assert.equal(await confirmed(f.args),false);assert.equal(await confirmed([f.args[0],recipient,f.args[2],f.args[3]]),false);
  for(const kind of ['web_push','native_push']){assert.equal(await f.erase(kind),true);assert.equal(await confirmed(f.args),false);}
  assert.equal(await f.erase('native_delivery_identities'),true);assert.equal(await confirmed(f.args),true);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.native_notification_devices where user_id=$1',[recipient])).rows[0].n,before);
  assert.equal(await confirmed([f.args[0],f.args[1],f.args[2],randomUUID()]),false);
  for(const role of ['anon','authenticated']){await f.db.exec('set role '+role);await assert.rejects(confirmed(f.args),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});
test('unknown sends still refuse canonical erasure and registration checkpoint after lease deadlines expire',async()=>{
 const f=await fixture();try{
  await f.db.query("update maintenance_private.native_notification_jobs set state='unknown',lease_id=$1,lease_until=clock_timestamp()-interval '1 hour',send_started_at=clock_timestamp()-interval '2 hours' where device_id in(select id from maintenance_private.native_notification_devices where user_id=$2)",[randomUUID(),owner]);
  assert.equal(await f.erase('native_push'),false);assert.equal((await f.db.query('select public.maintenance_deletion_registrations_are_erased($1,$2,$3,$4) ok',f.args)).rows[0].ok,false);
  await f.db.exec('set role service_role');await assert.rejects(f.db.query("insert into maintenance_private.deletion_retention_checks values($1,'forged',clock_timestamp(),clock_timestamp()+interval '5 minutes',600)",[f.args[0]]),/permission denied/);await f.db.exec('reset role');
  assert.equal((await f.db.query('select public.maintenance_deletion_retention_is_confirmed($1,$2,$3,$4) ok',f.args)).rows[0].ok,false);
 }finally{await f.db.close();}
});
