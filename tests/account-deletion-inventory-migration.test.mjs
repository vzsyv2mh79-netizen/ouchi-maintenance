import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('deletion captures uploader and owned-home object paths before erasing records',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 await db.exec('create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,\"homeId\" uuid);grant select on public.homes,public.products to service_role;grant update on public.homes to service_role;');
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261010234907_ouchi_account_deletion_leases.sql','20261010235205_ouchi_attachment_erasure_inventory.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',session='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const epoch=(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
 const request=async(u=user,s=session,e=epoch)=>(await db.query('select public.request_maintenance_account_deletion($1,$2,$3) as value',[u,s,e])).rows[0].value;
 const id=await request();assert.match(id,/^[0-9a-f-]{36}$/);assert.equal(await request(),id);
 const rows=(await db.query('select user_id,app_epoch_id,state from maintenance_private.account_deletion_requests')).rows;assert.deepEqual(rows,[{user_id:user,app_epoch_id:epoch,state:'pending'}]);
 const claim=async()=>(await db.query('select public.claim_maintenance_account_deletion() as value')).rows[0].value;
 const current=async j=>(await db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) as value',[j.requestID,j.userID,j.epochID,j.leaseToken])).rows[0].value;
 const defer=async j=>(await db.query('select public.defer_maintenance_account_deletion($1,$2,$3,$4) as value',[j.requestID,j.userID,j.epochID,j.leaseToken])).rows[0].value;
 const first=await claim();assert.equal(first.requestID,id);assert.equal(first.epochID,epoch);assert.equal(await current(first),true);assert.equal(await claim(),null);assert.equal(await request(),id);
 const attachment='55555555-5555-4555-8555-555555555555',otherAttachment='66666666-6666-4666-8666-666666666666',home='77777777-7777-4777-8777-777777777777',product='88888888-8888-4888-8888-888888888888';
 await db.exec('reset role');await db.query('insert into public.homes values($1,$2)',[home,user]);await db.query('insert into public.products values($1,$2)',[product,home]);await db.exec('set role service_role');
 for(const [id,owner] of [[attachment,user],[otherAttachment,other]])await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime) values($1,$2,$3,$4,100,'image/png')",[id,owner,epoch,product]);
 const capture=async j=>(await db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) as value',[j.requestID,j.userID,j.epochID,j.leaseToken])).rows[0].value;
 assert.equal(await capture({...first,userID:other}),false);assert.equal(await capture(first),true);assert.equal(await capture(first),true);
 const inventory=(await db.query('select attachment_id,uploader_id,object_path,absence_confirmed from maintenance_private.account_deletion_objects order by attachment_id')).rows;assert.equal(inventory.length,2);assert.equal(inventory[0].object_path,`${user}/${epoch}/${attachment}.png`);assert.equal(inventory[1].uploader_id,other);assert.equal(inventory.every(x=>!x.absence_confirmed),true);
 assert.equal((await db.query('select enabled from maintenance_private.account_access where user_id=$1',[user])).rows[0].enabled,false);assert.equal((await db.query('select count(*) as n from public.products')).rows[0].n,1);
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>capture(first));await assert.rejects(()=>db.query('select * from maintenance_private.account_deletion_objects'));
 }finally{await db.close();}
});
