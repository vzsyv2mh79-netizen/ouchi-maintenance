import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('tracked writes block erasure until exact terminal settlement and cannot restart after closure',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid references public.homes(id) on delete cascade);create table public.home_members("homeId" uuid,user_id uuid);create table public.maintenance_push_subscriptions(user_id uuid);create table public.maintenance_backup_restores(owner_id uuid);grant select on public.homes,public.products,public.home_members to service_role;grant update on public.homes to service_role;create schema storage;create table storage.objects(bucket_id text,name text);grant usage on schema storage to service_role;grant select on storage.objects to service_role;');
  for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261010234907_ouchi_account_deletion_leases.sql','20261010235205_ouchi_attachment_erasure_inventory.sql','20261010235332_ouchi_deletion_object_progress.sql','20261010235933_ouchi_deletion_household_records.sql','20261011005859_ouchi_attachment_upload_reservation.sql','20261011010239_ouchi_attachment_verified_completion.sql','20261011012412_ouchi_attachment_write_attempts.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
  const owner=randomUUID(),member=randomUUID(),home=randomUUID(),product=randomUUID(),ownerSession=randomUUID(),memberSession=randomUUID();
  await db.query('insert into auth.users values($1),($2)',[owner,member]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[ownerSession,owner,memberSession,member]);await db.query('insert into public.homes values($1,$2)',[home,owner]);await db.query('insert into public.products values($1,$2)',[product,home]);await db.query('insert into public.home_members values($1,$2)',[home,member]);await db.exec('set role service_role');
  const epoch=async(user,session)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
  const ownerEpoch=await epoch(owner,ownerSession),memberEpoch=await epoch(member,memberSession);
  const ownFile=randomUUID(),memberFile=randomUUID(),neverStarted=randomUUID(),legacy=randomUUID(),ownAttempt=randomUUID(),memberAttempt=randomUUID();
  const reserve=(u,s,e,f)=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,\'image/png\',$6)',[u,s,e,product,f,'a'.repeat(64)]);
  const begin=async(u,s,e,f,a)=>(await db.query('select public.begin_maintenance_attachment_write($1,$2,$3,$4,$5) as value',[u,s,e,f,a])).rows[0].value;
  const settle=async(f,a)=>(await db.query('select public.settle_maintenance_attachment_write($1,$2) as value',[f,a])).rows[0].value;
  const quiet=async f=>(await db.query('select maintenance_private.attachment_write_is_quiet($1) as value',[f])).rows[0].value;
  for(const [u,s,e,f] of [[owner,ownerSession,ownerEpoch,ownFile],[member,memberSession,memberEpoch,memberFile],[owner,ownerSession,ownerEpoch,neverStarted]])await reserve(u,s,e,f);
  await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values($1,$2,$3,$4,8,'image/png')",[legacy,owner,ownerEpoch,product]);assert.equal(await quiet(legacy),false);await assert.rejects(()=>begin(owner,ownerSession,ownerEpoch,legacy,randomUUID()));
  // Remove only this synthetic unknown legacy fixture; no legacy settlement adapter exists.
  await db.exec('reset role');await db.query('delete from maintenance_private.product_attachments where id=$1',[legacy]);await db.exec('set role service_role');
  assert.equal(await quiet(neverStarted),true);
  assert.deepEqual(await begin(owner,ownerSession,ownerEpoch,ownFile,ownAttempt),{attemptID:ownAttempt,started:true,settled:false});assert.equal(await quiet(ownFile),false);
  assert.deepEqual(await begin(owner,ownerSession,ownerEpoch,ownFile,ownAttempt),{attemptID:ownAttempt,started:false,settled:false});await assert.rejects(()=>begin(owner,ownerSession,ownerEpoch,ownFile,randomUUID()));
  assert.equal((await begin(member,memberSession,memberEpoch,memberFile,memberAttempt)).started,true);
  assert.equal(await settle(ownFile,randomUUID()),false);
  await assert.rejects(()=>db.query('select public.finalize_maintenance_attachment($1,$2,$3,$4,8,$5)',[owner,ownerSession,ownerEpoch,ownFile,'a'.repeat(64)]),/not settled/);
  const requested=(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) as value',[owner,ownerSession,ownerEpoch])).rows[0].value;
  const job=(await db.query('select public.claim_maintenance_account_deletion() as value')).rows[0].value;assert.equal(job.requestID,requested);
  const scope=[job.requestID,owner,ownerEpoch,job.leaseToken];assert.equal((await db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) as value',scope)).rows[0].value,true);
  const confirm=async f=>(await db.query('select public.confirm_maintenance_deletion_object_absence($1,$2,$3,$4,$5) as value',[...scope,f])).rows[0].value;
  const erase=async()=>(await db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) as value',scope)).rows[0].value;
  assert.equal(await confirm(ownFile),false);assert.equal(await confirm(memberFile),false);assert.equal(await confirm(neverStarted),true);
  await assert.rejects(()=>begin(owner,ownerSession,ownerEpoch,neverStarted,randomUUID()));await assert.rejects(()=>begin(member,memberSession,memberEpoch,memberFile,memberAttempt));
  await db.exec('reset role');await db.exec("update maintenance_private.attachment_write_attempts set started_at=now()-interval '2 days'");await db.exec('set role service_role');assert.equal(await confirm(ownFile),false);
  // Even stale pre-acknowledged inventories cannot bypass the record-erasure gate.
  await db.exec('reset role');await db.exec('update maintenance_private.account_deletion_objects set absence_confirmed=true');await db.exec('set role service_role');assert.equal(await erase(),false);
  assert.equal(await settle(ownFile,ownAttempt),true);assert.equal(await settle(ownFile,ownAttempt),true);assert.equal(await confirm(ownFile),true);assert.equal(await erase(),false);
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>settle(memberFile,memberAttempt));await assert.rejects(()=>begin(owner,ownerSession,ownerEpoch,neverStarted,randomUUID()));await db.exec('reset role;set role service_role');
  assert.equal(await settle(memberFile,memberAttempt),true);assert.equal(await confirm(memberFile),true);assert.equal(await erase(),true);assert.equal(await erase(),true);
  assert.equal((await db.query('select count(*) as n from maintenance_private.attachment_write_attempts')).rows[0].n,0);assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[requested])).rows[0].state,'running');
 }finally{await db.close();}
});
