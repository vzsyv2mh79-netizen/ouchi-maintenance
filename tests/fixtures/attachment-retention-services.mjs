import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {readAttachmentRetentionObservation} from '../../lib/attachment-retention-observation.mjs';

// Actual disposable GoTrue/PostgreSQL transport. No Storage removal occurs.
// Operator fixture enrollment and privileged DB connection are not deployment
// least-privilege or effective-policy proof. No configurable remote endpoint.
export async function verifyDisposableAttachmentRetention({account,admin,origin}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 const actor=await account(),home=randomUUID(),product=randomUUID(),id=randomUUID();
 const db=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
 const ok=result=>{assert.equal(result.error,null);return result.data;};
 await db.connect();
 try{
  ok(await actor.client.from('homes').insert({id:home,owner_id:actor.user,name:'Synthetic retention',kind:'home'}));
  ok(await actor.client.from('products').insert({id:product,homeId:home,categoryId:'air',name:'Synthetic retention file'}));
  const identity={target_user:actor.user,verified_session:actor.session,expected_epoch:actor.epoch};
  assert.equal(ok(await admin.rpc('reserve_maintenance_attachment',{...identity,target_product:product,attachment_id:id,byte_count:8,media_type:'image/png',measured_sha256:'a'.repeat(64)})),id);
  await db.query('set role service_role');
  const date=async()=>(await db.query('select removal_requested_at::text as value from maintenance_private.product_attachments where id=$1',[id])).rows[0].value;
  assert.equal(await date(),null);
  const args={...identity,target_attachment:id};
  assert.equal(ok(await admin.rpc('begin_maintenance_attachment_removal',args)).id,id);
  const original=await date();assert.ok(Number.isFinite(Date.parse(original)));
  await Promise.all([admin.rpc('begin_maintenance_attachment_removal',args),admin.rpc('begin_maintenance_attachment_removal',args)].map(async result=>assert.equal(ok(await result).id,id)));
  assert.equal(await date(),original);
  await assert.rejects(db.query('update maintenance_private.product_attachments set removal_requested_at=null where id=$1',[id]),/immutable/);
  assert.equal((await db.query("select has_function_privilege('service_role','maintenance_private.capture_attachment_removal_time()','execute') as allowed")).rows[0].allowed,false);
  const report=await readAttachmentRetentionObservation((sql,args)=>db.query(sql,args),AbortSignal.timeout(5000));
  assert.ok(report.pendingFiles>=1);assert.ok(Number.isFinite(Date.parse(report.observedAt)));
  assert.equal(JSON.stringify(report).includes(actor.user),false);
  const row=(await db.query('select state,removal_pending from maintenance_private.product_attachments where id=$1',[id])).rows[0];
  assert.equal(row.state,'reserved');assert.equal(row.removal_pending,true);
  await db.query('reset role;set role authenticated');
  await assert.rejects(readAttachmentRetentionObservation((sql,args)=>db.query(sql,args),AbortSignal.timeout(5000)),/unavailable/);
  assert.equal(ok(await actor.client.auth.getUser()).user.id,actor.user);
  console.log('attachment retention actual PostgreSQL/Auth: first acceptance timestamp, concurrent RPC retry stability, service forgery refusal, aggregate-only report, client denial; no Storage deletion or SLA proof');
 }finally{await db.end();}
}
