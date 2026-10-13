import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {owner,recipient,home,product,re,rs} from './fixtures/home-handoff-identifiers.mjs';
import {createFamilyAttachmentActivation} from '../lib/family-attachment-activation.mjs';
import {createHouseholdHandoffPort} from './fixtures/handoff-controller-compatibility/handoff-port.mjs';
import {familyAttachmentActivationFixture as fixture} from './fixtures/family-attachment-activation.mjs';

test('measured copies compose with both family guards and atomically switch home, file custody, write routing and quota',async()=>{
 const f=await fixture();try{
  assert.deepEqual(await f.run(),{state:'pending'}); // old Storage cleanup is still pending
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  assert.deepEqual((await f.db.query('select maintenance_private.household_family_snapshot($1) as value',[home])).rows[0].value,f.saved);
  const files=(await f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  for(const file of files){assert.equal(file.user_id,recipient);assert.equal(file.app_epoch_id,re);assert.equal(file.captured_owner_id,recipient);assert.equal(file.state,'stored');}
  assert.equal(files.find(r=>r.id===f.member).object_path,f.plan.files.find(r=>r.id===f.member).source.path);
  const writes=(await f.db.query('select * from maintenance_private.attachment_write_attempts')).rows;
  assert.ok(writes.every(r=>r.owner_id===recipient&&r.uploader_id===recipient&&r.app_epoch_id===re&&r.state==='settled'));
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'consumed');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_handoff_receipts')).rows[0].n,1);
  await f.db.exec('set role service_role');
  const visible=(await f.db.query('select public.read_maintenance_attachment($1,$2,$3,$4) as value',[recipient,rs,re,f.owned])).rows[0].value;
  assert.equal(visible.user,recipient);assert.equal(visible.epoch,re);await f.db.exec('reset role');
  assert.ok(f.objects.has(f.plan.files.find(r=>r.id===f.owned).source.path));
  assert.equal((await f.db.query('select count(*)::int n from auth.users')).rows[0].n,3);
  const oldContext=(await f.db.query('select token from maintenance_private.family_attachment_activation_contexts')).rows[0].token;
  await f.db.query("select set_config('maintenance.attachment_activation_context',$1,false)",[oldContext]);
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set sha256=$1 where id=$2',['f'.repeat(64),f.owned]),/Household principal stopped/);
  await assert.rejects(f.db.exec("update maintenance_private.family_attachment_quota set state='reserved'"),/Verified quota consumption/);
 }finally{await f.db.close();}
});

test('lost post-mutation authority rolls home, file rows, settled writes, quota and both receipts back together',async()=>{
 const f=await fixture({postAuthority:false});try{
  const before=(await f.db.query('select * from maintenance_private.product_attachments order by id')).rows;
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.deepEqual((await f.db.query('select * from maintenance_private.product_attachments order by id')).rows,before);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  for(const table of ['family_attachment_activation_receipts','household_handoff_receipts'])assert.equal((await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

test('a prepared client flag cannot replace exact quota, measured proof or private transaction context',async()=>{
 const f=await fixture({reserve:false});try{
  assert.deepEqual(await f.run(),{state:'pending'});assert.equal(f.removals,0);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.throws(()=>createFamilyAttachmentActivation({scope:f.scope,plan:f.plan,proof:{verified:true},signal:new AbortController().signal,authorize:async()=>true}),/Current measured/);
  assert.throws(()=>createHouseholdHandoffPort(f.key,{verified:true}),/Measured attachment/);
  await f.db.query("select set_config('maintenance.attachment_activation_context',$1,false)",[randomUUID()]);
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set user_id=$1 where id=$2',[recipient,f.owned]),/Household principal stopped/);
 }finally{await f.db.close();}
});

test('receiver enrollment loss before activation cannot consume quota or change household ownership',async()=>{
 const f=await fixture();try{
  await f.db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[recipient]);
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

test('deferred commit refuses quota consumption and home/files changes without a durable attachment receipt',async()=>{
 const f=await fixture({omitReceipt:true});try{
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  assert.equal((await f.db.query('select user_id from maintenance_private.product_attachments where id=$1',[f.owned])).rows[0].user_id,owner);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

test('deferred commit also protects member-only handoff with no receiver quota consumption event',async()=>{
 const f=await fixture({omitReceipt:true,memberOnly:true});try{
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select captured_owner_id from maintenance_private.product_attachments where id=$1',[f.member])).rows[0].captured_owner_id,owner);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_quota')).rows[0].n,0);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

for(const fault of ['missingRoute','expiredBinding','revokedConsent','foreignReceiptContext'])test(`deferred commit refuses ${fault} after final application authorization`,async()=>{
 const f=await fixture({commitFault:fault});try{
  assert.deepEqual(await f.run(),{state:'pending'});
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select state from maintenance_private.family_attachment_quota')).rows[0].state,'reserved');
  assert.equal((await f.db.query('select user_id from maintenance_private.product_attachments where id=$1',[f.owned])).rows[0].user_id,owner);
  assert.equal((await f.db.query('select owner_id from maintenance_private.household_write_routes where kind=$1 and object_id=$2',['products',product])).rows[0].owner_id,owner);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts')).rows[0].n,0);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});


test('committed activation receipt retains an immutable exact context and original row evidence',async()=>{
 const f=await fixture();try{
  await f.run();
  const receipt=(await f.db.query('select * from maintenance_private.family_attachment_activation_receipts')).rows[0];
  const context=(await f.db.query('select * from maintenance_private.family_attachment_activation_contexts where token=$1',[receipt.activation_token])).rows[0];
  assert.equal(context.request_id,receipt.request_id);assert.equal(context.home_id,receipt.home_id);
  for(const key of ['plan_digest','inventory_digest','expected_inventory_digest'])assert.equal(context[key],receipt[key]);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_rows where token=$1',[context.token])).rows[0].n,f.plan.files.length*2);
  for(const table of ['family_attachment_activation_contexts','family_attachment_activation_rows','family_attachment_activation_receipts']){
   const before=(await f.db.query('select to_jsonb(x) value from maintenance_private.'+table+' x')).rows;
   await assert.rejects(f.db.exec('delete from maintenance_private.'+table),/Immutable/);
   const assignment=table==='family_attachment_activation_contexts'?"scope='{}'::jsonb":table==='family_attachment_activation_rows'?"before_row='{}'::jsonb":"activation_token='00000000-0000-0000-0000-000000000001'::uuid";
   await assert.rejects(f.db.exec('update maintenance_private.'+table+' set '+assignment),/Immutable/);
   assert.deepEqual((await f.db.query('select to_jsonb(x) value from maintenance_private.'+table+' x')).rows,before);
  }
  await assert.rejects(f.db.query('insert into maintenance_private.family_attachment_activation_receipts(request_id,home_id,plan_digest,inventory_digest,expected_inventory_digest,activation_token) values($1,$2,$3,$4,$5,$6)',[receipt.request_id,receipt.home_id,receipt.plan_digest,receipt.inventory_digest,receipt.expected_inventory_digest,context.token]),/Exact committed activation receipt binding/);
 }finally{await f.db.close();}
});
