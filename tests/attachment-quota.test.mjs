import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('attachment reservation counts in-flight bytes, pins ownership and refuses closed enrollment',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to service_role;create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid);create table public.home_members("homeId" uuid,user_id uuid);grant select on public.homes,public.products,public.home_members to service_role;');
 await db.exec(readFileSync('ios/Tests/Fixtures/account-epochs-prototype.sql','utf8'));await db.exec(readFileSync('tests/fixtures/attachment-quota-prototype.sql','utf8'));
 const user=randomUUID(),session=randomUUID(),home=randomUUID(),product=randomUUID();await db.query('insert into auth.users values($1)',[user]);await db.query('insert into public.homes values($1,$2)',[home,user]);await db.query('insert into public.products values($1,$2)',[product,home]);await db.exec('set role service_role');
 const epoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,session])).rows[0].epoch;
 const reserve=(id,size=5242880,target=product)=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7)',[user,session,epoch,target,id,size,'image/png']);
 const first=randomUUID();await reserve(first);await reserve(first);await assert.rejects(()=>reserve(first,1));await assert.rejects(()=>reserve(randomUUID(),1,randomUUID()));await assert.rejects(()=>reserve(randomUUID(),5242881));
 const hash='a'.repeat(64),finalize=(size=5242880,digest=hash)=>db.query('select public.finalize_maintenance_attachment($1,$2,$3,$4,$5,$6)',[user,session,epoch,first,size,digest]);
 await assert.rejects(()=>finalize(1));await assert.rejects(()=>finalize(5242880,'invalid'));
 assert.equal((await db.query('select state from maintenance_private.product_attachments where id=$1',[first])).rows[0].state,'reserved');
 await finalize();await finalize();await assert.rejects(()=>finalize(5242880,'b'.repeat(64)));
 const read=()=>db.query('select public.read_maintenance_attachment($1,$2,$3,$4) as item',[user,session,epoch,first]);
 assert.equal((await read()).rows[0].item.id,first);
 assert.equal((await db.query('select state,sha256 from maintenance_private.product_attachments where id=$1',[first])).rows[0].state,'stored');
 for(let i=1;i<20;i++)await reserve(randomUUID());await assert.rejects(()=>reserve(randomUUID(),1));
 assert.equal((await db.query('select count(*) as n from maintenance_private.product_attachments')).rows[0].n,20);
 await db.query('select maintenance_private.close_app_epoch($1,$2)',[user,epoch]);await assert.rejects(()=>reserve(first));await assert.rejects(()=>finalize());assert.equal((await read()).rows[0].item,null);
 const freshSession=randomUUID(),freshEpoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,freshSession])).rows[0].epoch;
 await assert.rejects(()=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7)',[user,freshSession,freshEpoch,product,randomUUID(),1,'image/png']));
 await db.exec('reset role');
 const smallUser=randomUUID(),smallSession=randomUUID(),smallHome=randomUUID(),smallProduct=randomUUID();
 await db.query('insert into auth.users values($1)',[smallUser]);await db.query('insert into public.homes values($1,$2)',[smallHome,smallUser]);await db.query('insert into public.products values($1,$2)',[smallProduct,smallHome]);await db.exec('set role service_role');
 const smallEpoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[smallUser,smallSession])).rows[0].epoch;
 const smallReserve=()=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7)',[smallUser,smallSession,smallEpoch,smallProduct,randomUUID(),1,'application/pdf']);
 for(let i=0;i<100;i++)await smallReserve();await assert.rejects(smallReserve);
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>reserve(randomUUID()));await assert.rejects(()=>db.query('select * from maintenance_private.product_attachments'));
 }finally{await db.close();}
});
