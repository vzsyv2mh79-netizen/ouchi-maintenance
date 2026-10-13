import test from 'node:test';
import assert from 'node:assert/strict';
import {owner,recipient,other,home,product,request,os,rs,oe,re} from './fixtures/home-handoff.mjs';
import {seedHomeHandoffFullSchemaFixture as fixture} from './fixtures/home-handoff-full-schema.mjs';

async function snapshot(db){
 await db.exec('reset role');
 const result={};
 for(const table of ['public.homes','public.home_members','public.products','public.maintenance_tasks','public.maintenance_history','maintenance_private.product_attachments','maintenance_private.account_access','maintenance_private.app_epochs','maintenance_private.account_deletion_requests','maintenance_private.account_deletion_objects'])result[table]=(await db.query('select * from '+table)).rows;
 await db.exec('set role service_role');return result;
}
const prepare=db=>db.query('select public.request_maintenance_home_handoff($1,$2,$3,$4,$5,$6)',[request,home,owner,os,oe,recipient]);
const accept=db=>db.query('select public.decide_maintenance_home_handoff($1,$2,$3,$4,true) as value',[request,recipient,rs,re]);

test('full existing schema preserves family records and attachment metadata when retirement or file-bearing handoff is refused',async()=>{
 const db=await fixture();try{
  await db.exec('reset role');
  await db.query('insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values($1,$2,$3,$4,8,$5)',[other,recipient,re,product,'image/png']);
  await db.exec('set role service_role');const before=await snapshot(db);
  await assert.rejects(db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[owner,os,oe]),/Family handoff required/);
  assert.deepEqual(await snapshot(db),before);
  await prepare(db);await assert.rejects(accept(db),/Attachment handoff required/);
  assert.deepEqual(await snapshot(db),before);
  assert.equal((await db.query('select state from maintenance_private.home_handoffs')).rows[0].state,'pending');
 }finally{await db.close();}
});

test('full existing schema accepts an attachment-free handoff and retains exact product, task and history records',async()=>{
 const db=await fixture();try{
  const before=await snapshot(db);await prepare(db);assert.equal((await accept(db)).rows[0].value.state,'completed');
  const after=await snapshot(db);
  for(const table of ['public.products','public.maintenance_tasks','public.maintenance_history'])assert.deepEqual(after[table],before[table]);
  assert.equal(after['public.homes'][0].owner_id,recipient);assert.deepEqual(after['public.home_members'],[]);
  const read=await db.query('select public.read_maintenance_home_handoff($1,$2,$3,$4) as value',[request,owner,os,oe]);assert.equal(read.rows[0].value.state,'completed');
 }finally{await db.close();}
});

test('legacy erasure and direct home deletion cannot bypass family preservation',async()=>{
 const db=await fixture();try{
  const before=await snapshot(db);
  await db.exec('reset role');
  await db.exec('grant select,delete on public.homes,public.home_members,public.maintenance_push_subscriptions to authenticated');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,session_id:os})]);
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('select public.erase_maintenance_data()'),/Family handoff required/);
  await assert.rejects(db.query('delete from public.homes where id=$1',[home]),/Family handoff required/);
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
