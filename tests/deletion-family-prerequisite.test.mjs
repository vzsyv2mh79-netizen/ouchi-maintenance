import test from 'node:test';
import assert from 'node:assert/strict';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,home,os,rs,oe} from './fixtures/home-handoff-identifiers.mjs';

test('populated family refuses closure before enqueue; member may leave without erasing records or Auth',async()=>{
 const db=await seedHomeHandoffFullSchemaFixture();try{
  const request=()=>db.query('select public.request_maintenance_account_deletion($1,$2,$3) id',[owner,os,oe]);
  await assert.rejects(request(),/Family handoff required/);
  await db.exec('reset role');
  const snapshot=async()=>({products:(await db.query('select to_jsonb(p) row from public.products p order by id')).rows,auth:(await db.query('select id from auth.users order by id')).rows});
  const before=await snapshot();
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests where user_id=$1',[owner])).rows[0].n,0);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[recipient,JSON.stringify({sub:recipient,role:'authenticated',session_id:rs})]);
  await db.query('delete from public.home_members where "homeId"=$1 and user_id=$2',[home,recipient]);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{}',false)");
  assert.equal((await db.query('select count(*)::int n from public.home_members where "homeId"=$1 and user_id=$2',[home,recipient])).rows[0].n,0);
  assert.deepEqual(await snapshot(),before);
  await db.exec('set role service_role');
  assert.match((await request()).rows[0].id,/^[0-9a-f-]{36}$/i);
 }finally{await db.close();}
});
