import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('notification SQL binds verified ownership and erases only the leased closed enrollment after prerequisites',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 await db.exec('create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid references public.homes(id) on delete cascade);create table public.home_members(user_id uuid,"homeId" uuid);create table public.maintenance_backup_restores(owner_id uuid);create table public.maintenance_push_subscriptions(user_id uuid);');
 for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010224129_ouchi_verified_notification_inbox.sql','20261010234402_ouchi_account_deletion_requests.sql','20261010234907_ouchi_account_deletion_leases.sql','20261010235205_ouchi_attachment_erasure_inventory.sql','20261010235933_ouchi_deletion_household_records.sql','20261011091753_ouchi_notification_account_erasure.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333',second='44444444-4444-4444-8444-444444444444';
 await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[session,user,second,other]);await db.exec('set role service_role');
 const bind=async(u,s)=>(await db.query('select public.current_maintenance_purchase_account($1,$2) as v',[u,s])).rows[0].v;
 const epoch=await bind(user,session),foreign=await bind(other,second);
 for(const [token,original] of [[epoch,'10'],[foreign,'20']])await db.query('select public.apply_maintenance_verified_transaction($1,$2)',[JSON.stringify({environment:'Sandbox',accountToken:token,transactionId:original,originalTransactionId:original,productId:'ouchi.tip.small',signedAt:100,purchasedAt:50}),'a'.repeat(64)]);
 const notice={environment:'Sandbox',notificationId:'55555555-5555-4555-8555-555555555555',notificationType:'SUBSCRIBED',signedAt:100,disposition:'transaction_applied',accountToken:epoch,originalTransactionId:'10'};
 const save=async(p)=>(await db.query('select public.record_maintenance_verified_notification($1,$2) as v',[JSON.stringify(p),'b'.repeat(64)])).rows[0].v;
 assert.equal(await save(notice),'inserted');assert.equal(await save(notice),'duplicate');
 const foreignNotice={...notice,notificationId:'66666666-6666-4666-8666-666666666666',accountToken:foreign,originalTransactionId:'20'};assert.equal(await save(foreignNotice),'inserted');
 const testNotice={environment:'Sandbox',notificationId:'77777777-7777-4777-8777-777777777777',notificationType:'TEST',signedAt:100,disposition:'test'};assert.equal(await save(testNotice),'inserted');
 for(const patch of [{accountToken:foreign},{originalTransactionId:'99'},{environment:'Production'}])await assert.rejects(()=>save({...notice,...patch}));
 const unscoped={...notice};delete unscoped.accountToken;delete unscoped.originalTransactionId;await assert.rejects(()=>save(unscoped));
 const request=(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) as v',[user,session,epoch])).rows[0].v;
 const lease=(await db.query('select public.claim_maintenance_account_deletion() as v')).rows[0].v;
 const erase=async(token=lease.leaseToken)=>(await db.query('select public.erase_maintenance_deletion_notifications($1,$2,$3,$4) as v',[request,user,epoch,token])).rows[0].v;
 assert.equal(await erase(),false);assert.equal(await erase(second),false);
 await db.exec('reset role');await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[user]);await db.query('update maintenance_private.account_deletion_requests set inventory_captured=true,records_erased=true where id=$1',[request]);await db.exec('set role service_role');
 assert.equal(await save({...notice,notificationId:'88888888-8888-4888-8888-888888888888'}),'retired');
 await db.exec('reset role');await db.query("insert into maintenance_private.account_deletion_objects(request_id,attachment_id,uploader_id,uploader_epoch,bucket,object_path) values($1,$2,$3,$4,'ouchi-product-attachments','synthetic')",[request,second,user,epoch]);await db.exec('set role service_role');
 assert.equal(await erase(),false);
 await db.exec('reset role');await db.query('update maintenance_private.account_deletion_objects set absence_confirmed=true where request_id=$1',[request]);await db.exec('set role service_role');
 assert.equal(await erase(),true);assert.equal(await erase(),true);
 assert.deepEqual((await db.query('select notification_id from maintenance_private.verified_notifications order by notification_id')).rows.map(r=>r.notification_id),[foreignNotice.notificationId,testNotice.notificationId]);
 assert.equal((await db.query('select count(*) as n from maintenance_private.verified_transactions')).rows[0].n,2);
 assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[request])).rows[0].state,'running');
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>save(testNotice));await assert.rejects(()=>erase());}
 }finally{await db.close();}
});
