import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createFamilyAttachmentStatus} from '../lib/family-attachment-status.mjs';
import {handoffFamilyAttachments} from '../lib/family-attachment-handoff.mjs';
import {normalizeFamilyAttachmentPlan} from '../lib/family-attachment-handoff.mjs';
import {createFamilyAttachmentJournal} from '../lib/family-attachment-journal.mjs';
import {familyAttachmentActivationFixture as fixture} from './fixtures/family-attachment-activation.mjs';
import {owner,recipient,home,product} from './fixtures/home-handoff-identifiers.mjs';

const reader=(f,authorize=async()=>true)=>createFamilyAttachmentStatus({transaction:cb=>f.db.transaction(cb),authorize});
const read=(f,status=reader(f))=>status(f.scope,f.plan,new AbortController().signal);

for(const memberOnly of [false,true])test(`initial frozen inventory starts preparation and reconciles a lost reserve reply (member-only: ${memberOnly})`,async()=>{
 const f=await fixture({prepared:false,memberOnly});try{
  const status=reader(f);assert.equal((await read(f,status)).state,'absent');
  let preparations=0,activations=0;const activate=f.ports.activate;
  f.ports.status=status;f.ports.prepare=async(...args)=>{preparations++;await f.journal.prepare(...args);throw Error('Reservation reply lost');};
  f.ports.activate=async(...args)=>{activations++;return activate(...args);};
  f.ports.removeSource=async()=>{throw Error('Cleanup separately gated');};
  assert.deepEqual(await f.run(),{state:'pending'});assert.equal(preparations,1);assert.equal(activations,1);
  assert.equal((await read(f,reader(f))).state,'activated');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_journals')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_quota')).rows[0].n,memberOnly?0:1);
  const restart={...f.ports,status:reader(f),prepare:async()=>{preparations++;throw Error('Do not prepare twice');},activate:async()=>{activations++;throw Error('Do not activate twice');}};
  assert.deepEqual(await handoffFamilyAttachments(f.scope,restart,new AbortController().signal),{state:'pending'});
  assert.equal(preparations,1);assert.equal(activations,1);
  assert.ok(f.objects.has(f.plan.files[0].source.path));
 }finally{await f.db.close();}
});

test('initial absence still requires complete original inventory and authority; failures never call prepare',async()=>{
 const f=await fixture({prepared:false});try{
  await assert.rejects(reader(f)(f.scope,{...f.plan,files:[f.plan.files[0]]},new AbortController().signal),/Complete initial/);
  let preparations=0;const ports={...f.ports,status:reader(f,async()=>false),prepare:async()=>{preparations++;}};
  assert.deepEqual(await handoffFamilyAttachments(f.scope,ports,new AbortController().signal),{state:'pending'});assert.equal(preparations,0);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_journals')).rows[0].n,0);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
 }finally{await f.db.close();}
});

test('failed initial preparation rolls journal and quota back; a foreign destination/digest cannot reserve',async()=>{
 const f=await fixture({prepared:false});try{
  let authorizations=0;const journal=createFamilyAttachmentJournal({transaction:cb=>f.db.transaction(cb),authorize:async()=>++authorizations===1});
  const ports={...f.ports,status:reader(f),prepare:journal.prepare};
  assert.deepEqual(await handoffFamilyAttachments(f.scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal((await read(f)).state,'absent');
  for(const table of ['family_attachment_journals','family_attachment_quota'])assert.equal((await f.db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n,0);
  const plan=structuredClone(normalizeFamilyAttachmentPlan(f.plan));plan.files[0].destination.path='foreign';
  assert.throws(()=>f.journal.prepare(f.scope,plan,'a'.repeat(64),new AbortController().signal),/Exact preparation/);
  assert.throws(()=>f.journal.prepare(f.scope,normalizeFamilyAttachmentPlan(f.plan),'a'.repeat(64),new AbortController().signal),/Exact preparation/);
 }finally{await f.db.close();}
});

test('an existing journal with missing capacity is partial evidence, never initial absence',async()=>{
 const f=await fixture({reserve:false});try{
  await assert.rejects(read(f),/Exact readback quota/);
  let prepared=0;const ports={...f.ports,status:reader(f),prepare:async()=>{prepared++;}};
  assert.deepEqual(await handoffFamilyAttachments(f.scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(prepared,0);assert.equal(f.removals,0);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_journals')).rows[0].n,1);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
 }finally{await f.db.close();}
});

test('durable status reconciles a lost activation reply and a fresh provider without another ownership mutation',async()=>{
 const f=await fixture();try{
  const first=reader(f);assert.equal((await read(f,first)).state,'prepared');
  let activations=0;const activate=f.ports.activate;
  f.ports.status=first;f.ports.activate=async(...args)=>{activations++;await activate(...args);throw Error('Commit reply lost');};
  f.ports.removeSource=async()=>{throw Error('Cleanup separately gated');};
  assert.deepEqual(await f.run(),{state:'pending'});assert.equal(activations,1);
  const fresh=reader(f);assert.equal((await read(f,fresh)).state,'activated');
  const restart={...f.ports,status:fresh,activate:async()=>{activations++;throw Error('Must not repeat committed activation');}};
  assert.deepEqual(await handoffFamilyAttachments(f.scope,restart,new AbortController().signal),{state:'pending'});
  assert.equal(activations,1);assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,recipient);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts')).rows[0].n,1);
  assert.ok(f.objects.has(f.plan.files.find(x=>x.id===f.owned).source.path));
 }finally{await f.db.close();}
});

test('readback does not require an expired write context and does not grant a new write capability',async()=>{
 const f=await fixture();try{
  await f.run();
  // Let the actual finite capability expire; historical evidence is immutable.
  await f.db.query('select pg_sleep(5.1)');
  assert.equal((await read(f)).state,'activated');
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set sha256=$1 where id=$2',['b'.repeat(64),f.owned]),/Household principal stopped/);
  assert.equal(f.removals,1); // only the deliberately unsuccessful fixture cleanup
 }finally{await f.db.close();}
});

test('member-only durable activation readback requires both receipts despite no receiver quota rows',async()=>{
 const f=await fixture({memberOnly:true});try{
  assert.equal((await read(f)).state,'prepared');await f.run();
  assert.equal((await read(f)).state,'activated');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.family_attachment_quota')).rows[0].n,0);
 }finally{await f.db.close();}
});

for(const fault of ['missingRoute','revokedConsent','expiredBinding','expiredNative','receiverDisabled'])test(`durable readback refuses ${fault} and preserves originals`,async()=>{
 const f=await fixture();try{
  await f.run();
  if(fault==='missingRoute')await f.db.query("delete from maintenance_private.household_write_routes where kind='products' and object_id=$1",[product]);
  if(fault==='revokedConsent')await f.db.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where home_id=$1 and actor_id=$2',[home,recipient]);
  if(fault==='expiredBinding')await f.db.query("update maintenance_private.household_stop_bindings set lease_until=clock_timestamp()-interval '1 second' where user_id=$1",[owner]);
  if(fault==='expiredNative'){
   // Private freeze forbids native job mutation here: simulate a clock advance
   // by replacing only the status adapter's current-lease result, not its data.
   const status=createFamilyAttachmentStatus({transaction:cb=>f.db.transaction(tx=>cb({query:async(sql,args)=>sql.startsWith('select exists(')?{rows:[{current:false}]}:tx.query(sql,args)})),authorize:async()=>true});
   await assert.rejects(read(f,status),/Current readback/);
  }else if(fault==='receiverDisabled'){
   await f.db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[recipient]);
   await assert.rejects(read(f),/Current readback/);
  }else await assert.rejects(read(f));
  assert.ok(f.objects.has(f.plan.files.find(x=>x.id===f.owned).source.path));
 }finally{await f.db.close();}
});

test('readback rejects a foreign inventory, native request, lost signed authority and cancellation',async()=>{
 const f=await fixture();try{
  const status=reader(f);
  await assert.rejects(status(f.scope,{...f.plan,snapshotDigest:'b'.repeat(64)},new AbortController().signal),/Original readback/);
  await assert.rejects(status({...f.scope,nativeRequestID:randomUUID()},f.plan,new AbortController().signal),/Foreign readback/);
  const foreign=structuredClone(normalizeFamilyAttachmentPlan(f.plan));foreign.files[0].destination.path='foreign';
  await assert.rejects(status(f.scope,foreign,new AbortController().signal),/Foreign readback destination/);
  await assert.rejects(read(f,reader(f,async()=>false)),/Signed readback/);
  let calls=0;await assert.rejects(read(f,reader(f,async()=>++calls===1)),/Signed readback/);assert.equal(calls,2);
  const c=new AbortController();await assert.rejects(status(f.scope,f.plan,AbortSignal.abort(Error('cancelled'))),/cancelled/);
  const cancelled=reader(f,async()=>{c.abort(Error('cancelled after consent'));return true;});
  await assert.rejects(cancelled(f.scope,f.plan,c.signal),/cancelled after consent/);
  assert.equal((await f.db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner);
  assert.equal(f.removals,0);
 }finally{await f.db.close();}
});

for(const state of ['prepared','activated'])test(`final consent revocation during ${state} readback refuses a successful result`,async()=>{
 const f=await fixture();try{
  if(state==='activated')await f.run();
  let calls=0;const status=reader(f,async tx=>{
   if(++calls===2)await tx.query('update maintenance_private.household_handoff_consents set revoked_at=clock_timestamp() where home_id=$1 and actor_id=$2',[home,recipient]);
   return true;
  });
  await assert.rejects(read(f,status),/Retained family consent/);assert.equal(calls,2);
  assert.equal((await f.db.query('select revoked_at from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2',[home,recipient])).rows[0].revoked_at,null);
  assert.ok(f.objects.has(f.plan.files.find(x=>x.id===f.owned).source.path));
 }finally{await f.db.close();}
});


test('activated readback requires the exact receipt-linked context rather than any matching retained context',async()=>{
 const f=await fixture();try{
  await f.run();
  const status=createFamilyAttachmentStatus({authorize:async()=>true,transaction:cb=>f.db.transaction(tx=>cb({query:async(sql,args)=>{
   const result=await tx.query(sql,args);
   if(sql.startsWith('select * from maintenance_private.family_attachment_activation_receipts'))return {...result,rows:result.rows.map(r=>({...r,activation_token:randomUUID()}))};
   return result;
  }}))});
  await assert.rejects(read(f,status),/Retained activation consent required/);
  assert.equal((await read(f)).state,'activated');
 }finally{await f.db.close();}
});
