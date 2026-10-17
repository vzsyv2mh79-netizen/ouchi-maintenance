import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

import {seedHomeHandoffFixture,owner,recipient,other,home,product,request,os,rs,oe,re} from './fixtures/home-handoff.mjs';

async function fixture(){return seedHomeHandoffFixture(new PGlite());}
const prepare=(db,id=request)=>db.query('select public.request_maintenance_home_handoff($1,$2,$3,$4,$5,$6) as value',[id,home,owner,os,oe,recipient]).then(r=>r.rows[0].value);
const decide=(db,accepted=true,user=recipient,session=rs,epoch=re)=>db.query('select public.decide_maintenance_home_handoff($1,$2,$3,$4,$5) as value',[request,user,session,epoch,accepted]).then(r=>r.rows[0].value);
async function change(db,sql,args=[]){await db.exec('reset role');await db.query(sql,args);await db.exec('set role service_role');}
async function enabled(db){await change(db,'update maintenance_private.home_handoff_policy set enabled=true');}

test('handoff defaults disabled; service cannot enable policy and browser cannot invoke it',async()=>{
 const db=await fixture();try{
  await assert.rejects(prepare(db),/Live explicit enrollment required/);
  await assert.rejects(db.exec('update maintenance_private.home_handoff_policy set enabled=true'),/permission denied/);
  await db.exec('set role authenticated');await assert.rejects(prepare(db),/permission denied/);
 }finally{await db.close();}
});

test('owner request is not acceptance; recipient acceptance preserves products, tasks and history atomically',async()=>{
 const db=await fixture();try{
  await enabled(db);const first=await prepare(db);assert.equal(first.state,'pending');
  assert.deepEqual(await prepare(db),first);
  await assert.rejects(decide(db,true,owner,os,oe),/Recipient acceptance required/);
  await db.exec('reset role');assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,owner);await db.exec('set role service_role');
  const done=await decide(db);assert.equal(done.state,'completed');assert.deepEqual(await decide(db),done);
  await db.exec('reset role');assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,recipient);
  for(const table of ['products','maintenance_tasks','maintenance_history'])assert.equal((await db.query('select count(*)::int as n from public.'+table)).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.home_members')).rows[0].n,0);
 }finally{await db.close();}
});

test('cancelled or expired requests never transfer ownership and retries never extend expiry',async()=>{
 for(const expired of [false,true]){const db=await fixture();try{
  await enabled(db);const initial=await prepare(db);
  if(expired){await change(db,"update maintenance_private.home_handoffs set created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day'");await assert.rejects(decide(db),/Handoff expired/);}
  else{assert.equal((await decide(db,false,owner,os,oe)).state,'cancelled');await assert.rejects(decide(db),/Decision conflict/);}
  await db.exec('reset role');assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,owner);
  if(!expired)assert.equal((await db.query('select expires_at=$1::timestamptz as unchanged from maintenance_private.home_handoffs',[initial.expiresAt])).rows[0].unchanged,true);
 }finally{await db.close();}}
});

test('removed member, changed enrollment, closure, and unresolved files prevent the ownership change',async()=>{
 const cases=[
  ['delete from public.home_members',[],/Membership changed/],
  ['update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner],/Owner enrollment changed/],
  ['insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id) values($1,$2)',[owner,oe],/Account closure pending/],
  ['insert into maintenance_private.product_attachments values($1,$2,$3)',[other,product,'stored'],/Attachment handoff required/],
 ];
 for(const [sql,args,error] of cases){const db=await fixture();try{
  await enabled(db);await prepare(db);await change(db,sql,args);await assert.rejects(decide(db),error);
  await db.exec('reset role');assert.equal((await db.query('select owner_id from public.homes')).rows[0].owner_id,owner);
  assert.equal((await db.query('select state from maintenance_private.home_handoffs')).rows[0].state,'pending');
 }finally{await db.close();}}
});

test('family retirement guard refuses capture and erasure before any account or record mutation',async()=>{
 const db=await fixture();try{
  await db.exec('reset role');
  await db.exec(readFileSync('supabase/migrations/20261010234907_ouchi_account_deletion_leases.sql','utf8'));
  await db.exec(`alter table maintenance_private.account_deletion_requests add column inventory_captured boolean not null default false,add column records_erased boolean not null default false;
   grant update(inventory_captured,records_erased) on maintenance_private.account_deletion_requests to service_role;
   alter table maintenance_private.product_attachments add column user_id uuid,add column app_epoch_id uuid,add column captured_owner_id uuid,add column object_path text;
   create table maintenance_private.account_deletion_objects(request_id uuid,attachment_id uuid,uploader_id uuid,uploader_epoch uuid,bucket text,object_path text,primary key(request_id,attachment_id));
   grant select,insert on maintenance_private.account_deletion_objects to service_role;`);
  await db.exec(readFileSync('supabase/migrations/20261013043100_ouchi_family_retirement_guard.sql','utf8'));
  await db.exec('set role service_role');
  await assert.rejects(db.query('select public.request_maintenance_account_deletion($1,$2,$3)',[owner,os,oe]),/Family handoff required/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int as n from maintenance_private.account_deletion_requests')).rows[0].n,0);
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,now()+interval '2 minutes')",[request,owner,oe,other]);
  await db.exec('set role service_role');
  for(const fn of ['capture_maintenance_deletion_objects','erase_maintenance_deletion_records']){
   assert.equal((await db.query(`select public.${fn}($1,$2,$3,$4) as result`,[request,owner,oe,other])).rows[0].result,false);
  }
  await db.exec('reset role');
  assert.equal((await db.query('select enabled from maintenance_private.account_access where user_id=$1',[owner])).rows[0].enabled,true);
  assert.equal((await db.query('select enabled from maintenance_private.app_epochs where user_id=$1',[owner])).rows[0].enabled,true);
  assert.deepEqual((await db.query('select inventory_captured,records_erased from maintenance_private.account_deletion_requests')).rows,[{inventory_captured:false,records_erased:false}]);
  for(const table of ['homes','products','maintenance_tasks','maintenance_history'])assert.equal((await db.query('select count(*)::int as n from public.'+table)).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from maintenance_private.account_deletion_objects')).rows[0].n,0);
  // Once there is no remaining family, retirement can close the app. A later
  // invitation must not introduce new members into that closed owned home.
  await db.query('delete from public.home_members where "homeId"=$1',[home]);
  // A durable pending request alone must also fence new invitations, before
  // capture has changed any enabled/account flags.
  await db.query("update maintenance_private.account_deletion_requests set state='pending',lease_token=null,lease_until=null where id=$1",[request]);
  await assert.rejects(db.query('insert into public.home_members values($1,$2,$3)',[home,other,'pending invite']),/Owner closure pending/);
  await db.query("update maintenance_private.account_deletion_requests set state='running',lease_token=$2,lease_until=now()+interval '2 minutes' where id=$1",[request,other]);
  await db.exec('set role service_role');
  assert.equal((await db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) as result',[request,owner,oe,other])).rows[0].result,true);
  await db.exec('reset role');
  await assert.rejects(db.query('insert into public.home_members values($1,$2,$3)',[home,other,'new member']),/Home owner closed/);
  assert.equal((await db.query('select count(*)::int as n from public.home_members')).rows[0].n,0);
 }finally{await db.close();}
});
