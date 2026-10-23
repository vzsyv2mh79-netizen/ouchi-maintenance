import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('formal retained attachments require live shared membership, page safely and need no paid entitlement',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);create table public.homes(id uuid primary key,owner_id uuid);create table public.products(id uuid primary key,"homeId" uuid);create table public.home_members("homeId" uuid,user_id uuid);grant select on public.homes,public.products,public.home_members to service_role;grant update on public.homes to service_role;');
  for(const file of ['20261010141353_ouchi_billing_identity.sql','20261010234402_ouchi_account_deletion_requests.sql','20261010234907_ouchi_account_deletion_leases.sql','20261010235205_ouchi_attachment_erasure_inventory.sql','20261011005859_ouchi_attachment_upload_reservation.sql','20261011010239_ouchi_attachment_verified_completion.sql','20261011010724_ouchi_attachment_retained_read.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  const owner=randomUUID(),member=randomUUID(),stranger=randomUUID(),home=randomUUID(),product=randomUUID();
  const sessions=new Map(),epochs=new Map();
  for(const user of [owner,member,stranger]){
   const session=randomUUID();sessions.set(user,session);
   await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
  }
  await db.query('insert into public.homes values($1,$2)',[home,owner]);await db.query('insert into public.products values($1,$2)',[product,home]);await db.query('insert into public.home_members values($1,$2)',[home,member]);await db.exec('set role service_role');
  for(const user of [owner,member,stranger])epochs.set(user,(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,sessions.get(user)])).rows[0].value);
  const read=async(user,id,session=sessions.get(user),epoch=epochs.get(user))=>(await db.query('select public.read_maintenance_attachment($1,$2,$3,$4) as value',[user,session,epoch,id])).rows[0].value;
  const page=async(user,after=null)=>(await db.query('select public.page_maintenance_attachments($1,$2,$3,$4,$5) as value',[user,sessions.get(user),epochs.get(user),product,after])).rows[0].value;
  const usage=async user=>(await db.query('select public.maintenance_attachment_usage($1,$2,$3) as value',[user,sessions.get(user),epochs.get(user)])).rows[0].value;
  const reserve=async(user,id)=>(await db.query('select public.reserve_maintenance_attachment($1,$2,$3,$4,$5,8,\'image/png\',$6) as value',[user,sessions.get(user),epochs.get(user),product,id,'a'.repeat(64)])).rows[0].value;
  const finalize=async(user,id)=>(await db.query('select public.finalize_maintenance_attachment($1,$2,$3,$4,8,$5) as value',[user,sessions.get(user),epochs.get(user),id,'a'.repeat(64)])).rows[0].value;
  const ids=[];
  for(let i=0;i<27;i++){const id=randomUUID();ids.push(id);await reserve(owner,id);await finalize(owner,id);}
  const shared=randomUUID(),pending=randomUUID();await reserve(member,shared);await finalize(member,shared);await reserve(owner,pending);
  const first=await page(member);assert.equal(first.items.length,25);assert.ok(first.next);
  const second=await page(member,first.next);assert.equal(second.items.length,3);assert.equal(second.next,null);
  assert.deepEqual([...first.items,...second.items].map(x=>x.id).sort(),[...ids,shared].sort());
  assert.deepEqual(Object.keys(first.items[0]).sort(),['createdAt','id','mime','size']);assert.equal(await read(owner,pending),null);
  assert.equal((await read(member,ids[0])).id,ids[0]);assert.equal((await read(owner,shared)).user,member);
  assert.equal(await read(stranger,ids[0]),null);assert.deepEqual(await page(stranger),{items:[],next:null});
  assert.equal(await read(owner,ids[0],sessions.get(member)),null);assert.equal(await read(owner,ids[0],sessions.get(owner),randomUUID()),null);
  assert.deepEqual(await usage(owner),{usedBytes:224,usedFiles:28,reservedBytes:8,reservedFiles:1,limitBytes:104857600,limitFiles:100,fileLimitBytes:5242880});
  assert.equal((await usage(member)).usedFiles,1);
  // This fixture has no transaction ledger or paid flag: retained reads cannot depend on a current subscription.
  await db.exec('reset role');await db.query('delete from public.home_members where user_id=$1',[member]);await db.exec('set role service_role');
  assert.equal(await read(member,shared),null);assert.deepEqual(await page(member),{items:[],next:null});assert.equal((await read(owner,shared)).id,shared);
  await db.exec('reset role');await db.query('insert into public.home_members values($1,$2)',[home,member]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);await db.exec('set role service_role');
  assert.equal(await read(member,shared),null);assert.deepEqual(await page(member),{items:[],next:null});assert.equal(await usage(owner),null);await assert.rejects(()=>reserve(member,randomUUID()));await assert.rejects(()=>finalize(member,shared));
  await db.exec('reset role');await db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[owner]);await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[sessions.get(member)]);await db.exec('set role service_role');
  assert.equal(await read(member,ids[0]),null);assert.equal(await usage(member),null);
  await db.exec('reset role');await db.query('update maintenance_private.product_attachments set sha256=null where id=$1',[ids[0]]);await db.exec('set role service_role');assert.equal(await read(owner,ids[0]),null);
  await db.exec('reset role;set role authenticated');await assert.rejects(()=>read(owner,shared));await assert.rejects(()=>page(owner));await assert.rejects(()=>usage(owner));
 }finally{await db.close();}
});
