import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,os,oe,product} from './fixtures/home-handoff-identifiers.mjs';
import {ATTACHMENT_RETENTION_OBSERVATION_SQL,readAttachmentRetentionObservation} from '../lib/attachment-retention-observation.mjs';
const migration='supabase/migrations/20261015023355_ouchi_attachment_retention_observation.sql';
const reserve=(db,id)=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,$6,$7)',[owner,os,oe,product,id,'image/png','a'.repeat(64)]);
const begin=(db,id)=>db.query('select public.begin_maintenance_attachment_removal($1,$2,$3,$4)',[owner,os,oe,id]);
const observe=db=>readAttachmentRetentionObservation((sql,args)=>db.query(sql,args),new AbortController().signal);

test('canonical removal records first accepted time, retries cannot renew/forge it, and aborted changes remain absent',async()=>{
 const db=await seedHomeHandoffFullSchemaFixture();try{
  await db.exec('reset role');await db.exec(readFileSync(migration,'utf8'));await db.exec('set role service_role');
  const id=randomUUID();await reserve(db,id);
  assert.equal((await db.query('select removal_requested_at from maintenance_private.product_attachments where id=$1',[id])).rows[0].removal_requested_at,null);
  await db.exec('begin');await begin(db,id);await db.exec('rollback');
  assert.equal((await observe(db)).pendingFiles,0);
  const started=Date.now();await begin(db,id);
  const first=(await db.query('select removal_requested_at from maintenance_private.product_attachments where id=$1',[id])).rows[0].removal_requested_at;
  assert.ok(Date.parse(first)>=started-1000&&Date.parse(first)<=Date.now()+1000);
  await begin(db,id);
  assert.equal(new Date((await db.query('select removal_requested_at from maintenance_private.product_attachments where id=$1',[id])).rows[0].removal_requested_at).getTime(),new Date(first).getTime());
  await assert.rejects(db.query('update maintenance_private.product_attachments set removal_requested_at=clock_timestamp()+interval \'1 day\' where id=$1',[id]),/immutable/);
  await assert.rejects(db.query('update maintenance_private.product_attachments set removal_requested_at=null where id=$1',[id]),/immutable/);
  const report=await observe(db);assert.equal(report.pendingFiles,1);assert.equal(report.unknownRequestTimeFiles,0);assert.equal(report.olderThan30DaysFiles,0);
  assert.equal(report.unsettledWriteFiles,0);assert.equal(report.legacyUnknownWriteFiles,0);
  assert.equal(Date.parse(report.oldestKnownRequestAt),new Date(first).getTime());
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(observe(db),/unavailable/);}
 }finally{await db.close();}
});

test('historical unknown time is never backfilled, uncertain writes and old pending files remain visible without deletion',async()=>{
 const db=await seedHomeHandoffFullSchemaFixture();try{
  const old=randomUUID(),unknown=randomUUID(),writing=randomUUID();
  for(const id of [old,unknown,writing])await reserve(db,id);
  await begin(db,old);await begin(db,unknown);
  await db.query('select public.begin_maintenance_attachment_write($1,$2,$3,$4,$5)',[owner,os,oe,writing,randomUUID()]);
  await db.exec('reset role');
  await db.query('update maintenance_private.product_attachments set removal_pending=true,write_tracking=false where id=$1',[writing]);
  await db.exec(readFileSync(migration,'utf8'));
  // Disposable DB owner seeds an aged event to model a later observation.
  // The service cannot disable this guard or forge the production timestamp.
  await db.exec('alter table maintenance_private.product_attachments disable trigger attachment_removal_time_capture');
  await db.query("update maintenance_private.product_attachments set removal_requested_at=clock_timestamp()-interval '31 days' where id=$1",[old]);
  await db.exec('alter table maintenance_private.product_attachments enable trigger attachment_removal_time_capture');
  await db.exec('set role service_role');await begin(db,unknown);
  const report=await observe(db);
  assert.equal(report.pendingFiles,3);assert.equal(report.unknownRequestTimeFiles,2);assert.equal(report.olderThan30DaysFiles,1);
  assert.equal(report.unsettledWriteFiles,1);assert.equal(report.legacyUnknownWriteFiles,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.product_attachments')).rows[0].n,3);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,3);
  assert.equal(JSON.stringify(report).includes(owner),false);
 }finally{await db.close();}
});

test('missing, malformed, unsafe or cancelled observations never turn into an empty backlog or disclose backend data',async()=>{
 const controller=new AbortController();
 const good={observedAt:new Date().toISOString(),oldestKnownRequestAt:null,pendingFiles:0,unknownRequestTimeFiles:0,futureRequestTimeFiles:0,olderThan30DaysFiles:0,unsettledWriteFiles:0,legacyUnknownWriteFiles:0};
 for(const rows of [[],[{observation:{...good,pendingFiles:-1}}],[{observation:{...good,pendingFiles:Number.MAX_SAFE_INTEGER+1}}],[{observation:{...good,unknownRequestTimeFiles:1}}],[{observation:{...good,path:'private/path'}}],[{observation:{...good,pendingFiles:1}}],[{observation:{...good,observedAt:'unknown'}}]]){
  await assert.rejects(readAttachmentRetentionObservation(async()=>({rows}),controller.signal),/^Error: Attachment retention observation unavailable$/);
 }
 await assert.rejects(readAttachmentRetentionObservation(async()=>{throw Error('secret SQL content');},controller.signal),error=>!error.message.includes('secret'));
 const future=await readAttachmentRetentionObservation(async()=>({rows:[{observation:{...good,pendingFiles:1,futureRequestTimeFiles:1}}]}),controller.signal);
 assert.equal(future.futureRequestTimeFiles,1);assert.equal(future.oldestKnownRequestAt,null);
 assert.match(ATTACHMENT_RETENTION_OBSERVATION_SQL,/^with observed/);
 controller.abort();let calls=0;await assert.rejects(readAttachmentRetentionObservation(async()=>{calls++;},controller.signal));assert.equal(calls,0);
});
