import {randomBytes,randomUUID} from 'node:crypto';

// Disposable synthetic destinations only. No external notification is sent.
export const deviceTables=['public.maintenance_push_subscriptions','public.maintenance_push_test_limits',
 'maintenance_private.native_notification_devices','maintenance_private.native_notification_jobs',
 'maintenance_private.native_delivery_identities'];
export async function seedSharedNativeDevices(db,actors){
 for(const [user,epoch] of actors){
  await db.query(`insert into public.maintenance_push_subscriptions(user_id,endpoint,p256dh,auth)
   values($1,$2,$3,$4)`,[user,'https://web.push.apple.com/'+randomUUID(),'x'.repeat(87),'x'.repeat(22)]);
  await db.query('insert into public.maintenance_push_test_limits(user_id) values($1) on conflict(user_id) do nothing',[user]);
  const device=(await db.query(`insert into maintenance_private.native_notification_devices(user_id,app_epoch_id,environment,device_token,topic)
   values($1,$2,'Sandbox',$3,'jp.ouchi.maintenance') returning id`,[user,epoch,randomBytes(32).toString('hex')])).rows[0].id;
  for(const state of ['pending','sent'])await db.query(`insert into maintenance_private.native_notification_jobs(device_id,due_at,state,send_started_at)
   values($1,clock_timestamp(),$2,case when $2='sent' then clock_timestamp() else null end)`,[device,state]);
  await db.query(`insert into maintenance_private.native_delivery_identities values($1,current_date,$2,$3,$4,$5,clock_timestamp()+interval '1 day')`,
   [randomBytes(32).toString('hex'),user,epoch,randomUUID(),randomUUID()]);
 }
}
export async function deviceRows(db,user){
 const result={};
 for(const table of deviceTables){
  const predicate=table.endsWith('.native_notification_jobs')
   ?`exists(select 1 from maintenance_private.private_writer_routes route where route.kind='device' and route.object_id=r.device_id and route.principal=$1)`
   :'r.user_id=$1';
  result[table]=(await db.query(`select to_jsonb(r) row from ${table} r where ${predicate} order by to_jsonb(r)::text`,[user])).rows.map(r=>r.row);
 }
 return result;
}
