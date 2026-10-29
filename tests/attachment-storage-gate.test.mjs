import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('storage object writes require active reserved epoch while unrelated buckets remain untouched',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid);create table public.home_members("homeId" uuid,user_id uuid);grant usage on schema public to service_role;grant select on public.homes,public.products,public.home_members to service_role;create schema storage;create table storage.buckets(id text primary key);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);');
 for(const file of ['ios/Tests/Fixtures/account-epochs-prototype.sql','tests/fixtures/attachment-quota-prototype.sql','tests/fixtures/auth/storage-bootstrap.sql'])await db.exec(readFileSync(file,'utf8'));
 const user=randomUUID(),session=randomUUID(),home=randomUUID(),product=randomUUID(),first=randomUUID(),pending=randomUUID();
 await db.query('insert into auth.users values($1)',[user]);await db.query('insert into public.homes values($1,$2)',[home,user]);await db.query('insert into public.products values($1,$2)',[product,home]);await db.exec('set role service_role');
 const epoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,session])).rows[0].epoch;
 for(const id of [first,pending])await db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7,$8)',[user,session,epoch,product,id,8,'image/png','a'.repeat(64)]);
 const path=id=>`${user}/${epoch}/${id}.png`,insert=(name,bucket='ouchi-product-attachments-test')=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,name]);
 await insert(path(first));await assert.rejects(()=>insert(path(randomUUID())));await assert.rejects(()=>insert(path(pending).replace('.png','.pdf')));
 await insert('unrelated-object','another-app');await db.query('select maintenance_private.close_app_epoch($1,$2)',[user,epoch]);
 await assert.rejects(()=>insert(path(pending)));await insert('another-unrelated-object','another-app');
 assert.equal((await db.query('select count(*) as n from maintenance_private.attachment_erasure_jobs')).rows[0].n,2);
 assert.equal((await db.query('select count(*) as n from maintenance_private.product_attachments')).rows[0].n,2);
 assert.equal((await db.query('select count(*) as n from storage.objects')).rows[0].n,3);
 const finish=()=>db.query('select public.finish_maintenance_attachment_erasure($1) as done',[first]);await assert.rejects(finish);
 await db.query('delete from storage.objects where name=$1',[path(first)]);assert.equal((await finish()).rows[0].done,true);assert.equal((await finish()).rows[0].done,true);
 assert.equal((await db.query('select count(*) as n from maintenance_private.attachment_erasure_jobs')).rows[0].n,1);
 await db.exec('reset role;set role authenticated');await assert.rejects(finish);await assert.rejects(()=>db.query('select public.pending_maintenance_attachment_erasures(25)'));

 }finally{await db.close();}
});
