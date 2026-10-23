import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('attachment reservation counts in-flight bytes, pins ownership and refuses closed enrollment',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to service_role;create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid);create table public.home_members("homeId" uuid,user_id uuid);grant select on public.homes,public.products,public.home_members to service_role;');
 await db.exec(readFileSync('ios/Tests/Fixtures/account-epochs-prototype.sql','utf8'));await db.exec(readFileSync('tests/fixtures/attachment-quota-prototype.sql','utf8'));
 const user=randomUUID(),session=randomUUID(),home=randomUUID(),product=randomUUID();await db.query('insert into auth.users values($1)',[user]);await db.query('insert into public.homes values($1,$2)',[home,user]);await db.query('insert into public.products values($1,$2)',[product,home]);await db.exec('set role service_role');
 const epoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,session])).rows[0].epoch;
 const reserve=(id,size=5242880,target=product,digest='a'.repeat(64))=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7,$8)',[user,session,epoch,target,id,size,'image/png',digest]);
 const usage=()=>db.query('select public.maintenance_attachment_usage($1,$2,$3) as usage',[user,session,epoch]);
 assert.equal((await usage()).rows[0].usage.usedBytes,0);
 const first=randomUUID();await reserve(first);await reserve(first);await assert.rejects(()=>reserve(first,5242880,product,'b'.repeat(64)));await assert.rejects(()=>reserve(randomUUID(),1,product,'invalid'));await assert.rejects(()=>reserve(first,1));await assert.rejects(()=>reserve(randomUUID(),1,randomUUID()));await assert.rejects(()=>reserve(randomUUID(),5242881));
 const hash='a'.repeat(64),finalize=(size=5242880,digest=hash)=>db.query('select public.finalize_maintenance_attachment($1,$2,$3,$4,$5,$6)',[user,session,epoch,first,size,digest]);
 await assert.rejects(()=>finalize(1));await assert.rejects(()=>finalize(5242880,'invalid'));
 assert.equal((await db.query('select state from maintenance_private.product_attachments where id=$1',[first])).rows[0].state,'reserved');
 assert.equal((await usage()).rows[0].usage.reservedBytes,5242880);
 await finalize();assert.equal((await usage()).rows[0].usage.reservedBytes,0);assert.equal((await usage()).rows[0].usage.usedBytes,5242880);await finalize();await assert.rejects(()=>finalize(5242880,'b'.repeat(64)));
 const read=()=>db.query('select public.read_maintenance_attachment($1,$2,$3,$4) as item',[user,session,epoch,first]);
 assert.equal((await read()).rows[0].item.id,first);
 const list=()=>db.query('select public.list_maintenance_attachments($1,$2,$3,$4) as items',[user,session,epoch,product]);
 const listed=(await list()).rows[0].items;assert.equal(listed.length,1);assert.equal(listed[0].id,first);assert.deepEqual(Object.keys(listed[0]).sort(),['createdAt','id','mime','size']);
 assert.deepEqual((await db.query('select public.list_maintenance_attachments($1,$2,$3,$4) as items',[user,session,epoch,randomUUID()])).rows[0].items,[]);

 assert.equal((await db.query('select state,sha256 from maintenance_private.product_attachments where id=$1',[first])).rows[0].state,'stored');
 const member=randomUUID(),memberSession=randomUUID();await db.exec('reset role');await db.query('insert into auth.users values($1)',[member]);await db.exec('set role service_role');
 const memberEpoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[member,memberSession])).rows[0].epoch;
 const memberList=()=>db.query('select public.list_maintenance_attachments($1,$2,$3,$4) as items',[member,memberSession,memberEpoch,product]);
 assert.deepEqual((await memberList()).rows[0].items,[]);
 await db.exec('reset role');await db.query('insert into public.home_members values($1,$2)',[home,member]);await db.exec('set role service_role');
 assert.equal((await memberList()).rows[0].items[0].id,first);
 await db.exec('reset role');await db.query('delete from public.home_members where user_id=$1',[member]);await db.exec('set role service_role');
 assert.deepEqual((await memberList()).rows[0].items,[]);
 for(let i=1;i<20;i++)await reserve(randomUUID());await assert.rejects(()=>reserve(randomUUID(),1));
 assert.equal((await usage()).rows[0].usage.usedBytes,104857600);assert.equal((await usage()).rows[0].usage.reservedFiles,19);
 assert.equal((await db.query('select count(*) as n from maintenance_private.product_attachments')).rows[0].n,20);
 await db.query('select maintenance_private.close_app_epoch($1,$2)',[user,epoch]);assert.equal((await db.query('select count(*) as n from maintenance_private.attachment_erasure_jobs where user_id=$1',[user])).rows[0].n,20);assert.equal((await db.query('select object_path from maintenance_private.attachment_erasure_jobs where attachment_id=$1',[first])).rows[0].object_path,`${user}/${epoch}/${first}.png`);await assert.rejects(()=>reserve(first));await assert.rejects(()=>finalize());assert.equal((await read()).rows[0].item,null);assert.deepEqual((await list()).rows[0].items,[]);assert.equal((await usage()).rows[0].usage,null);
 const freshSession=randomUUID(),freshEpoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[user,freshSession])).rows[0].epoch;
 assert.equal((await db.query('select public.maintenance_attachment_usage($1,$2,$3) as usage',[user,freshSession,freshEpoch])).rows[0].usage.usedBytes,104857600);
 await assert.rejects(()=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7,$8)',[user,freshSession,freshEpoch,product,randomUUID(),1,'image/png','a'.repeat(64)]));
 await db.exec('reset role');
 const smallUser=randomUUID(),smallSession=randomUUID(),smallHome=randomUUID(),smallProduct=randomUUID();
 await db.query('insert into auth.users values($1)',[smallUser]);await db.query('insert into public.homes values($1,$2)',[smallHome,smallUser]);await db.query('insert into public.products values($1,$2)',[smallProduct,smallHome]);await db.exec('set role service_role');
 const smallEpoch=(await db.query('select maintenance_private.enroll_app_epoch($1,$2) as epoch',[smallUser,smallSession])).rows[0].epoch;
 const smallReserve=()=>db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,$6,$7,$8)',[smallUser,smallSession,smallEpoch,smallProduct,randomUUID(),1,'application/pdf','a'.repeat(64)]);
 for(let i=0;i<100;i++)await smallReserve();await assert.rejects(smallReserve);
 const allIDs=(await db.query('select id from maintenance_private.product_attachments where user_id=$1 order by id',[smallUser])).rows.map(x=>x.id);
 for(const id of allIDs)await db.query('select public.finalize_maintenance_attachment($1,$2,$3,$4,$5,$6)',[smallUser,smallSession,smallEpoch,id,1,'a'.repeat(64)]);
 const page=async(after=null)=>(await db.query('select public.page_maintenance_attachments($1,$2,$3,$4,$5) as page',[smallUser,smallSession,smallEpoch,smallProduct,after])).rows[0].page;
 let cursor=null;const received=[];
 for(let i=0;i<4;i++){const result=await page(cursor);assert.equal(result.items.length,25);received.push(...result.items.map(x=>x.id));cursor=result.next;assert.equal(cursor,i===3?null:received.at(-1));}
 assert.deepEqual(received,allIDs);assert.equal(new Set(received).size,100);
 assert.deepEqual(await page(allIDs.at(-1)),{items:[],next:null});
 assert.deepEqual((await db.query('select public.page_maintenance_attachments($1,$2,$3,$4,null) as page',[member,memberSession,memberEpoch,smallProduct])).rows[0].page,{items:[],next:null});
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>page());await db.exec('reset role;set role service_role');

 await db.exec('reset role;set role authenticated');await assert.rejects(()=>reserve(randomUUID()));await assert.rejects(list);await assert.rejects(usage);await assert.rejects(()=>db.query('select * from maintenance_private.product_attachments'));await assert.rejects(()=>db.query('select * from maintenance_private.attachment_erasure_jobs'));
 }finally{await db.close();}
});
