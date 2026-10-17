import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,oe,re} from './fixtures/home-handoff-identifiers.mjs';

async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 const scope={request:randomUUID(),user:owner,epoch:oe,lease:randomUUID()};
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '5 minutes',true)",[scope.request,owner,oe,scope.lease]);
 for(const [user,epoch] of [[owner,oe],[owner,randomUUID()],[recipient,re]])await db.query("insert into maintenance_private.native_delivery_identities values($1,current_date,$2,$3,$4,$5,clock_timestamp()+interval '1 day')",[randomBytes(32).toString('hex'),user,epoch,randomUUID(),randomUUID()]);
 await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
 const rows=()=>db.query('select to_jsonb(r) row from maintenance_private.native_delivery_identities r order by destination_hash').then(r=>r.rows);
 const erase=(s=scope)=>db.query('select public.erase_maintenance_deletion_native_delivery_identities($1,$2,$3,$4) erased',[s.request,s.user,s.epoch,s.lease]).then(r=>r.rows[0].erased);
 return {db,scope,rows,erase};
}

test('native notification retirement removes this account across retained epochs and preserves another account',async()=>{
 const f=await fixture();try{
  const foreign=(await f.rows()).filter(x=>x.row.user_id===recipient);
  await f.db.exec('set role service_role');
  assert.equal(await f.erase(),true);assert.equal(await f.erase(),true,'exact retry remains harmless');
  assert.deepEqual(await f.rows(),foreign);
  await f.db.exec('reset role'); // Operator-only readback; no Auth read grant is added.
  assert.equal((await f.db.query('select count(*)::int n from auth.users where id in($1,$2)',[owner,recipient])).rows[0].n,2);
 }finally{await f.db.close();}
});

test('wrong request, user, epoch, lease, expiry and open access retain all delivery identities',async()=>{
 const f=await fixture();try{
  const original=await f.rows();
  for(const s of [{...f.scope,request:randomUUID()},{...f.scope,user:recipient},{...f.scope,epoch:randomUUID()},{...f.scope,lease:randomUUID()}]){
   assert.equal(await f.erase(s),false);assert.deepEqual(await f.rows(),original);
  }
  await f.db.query('update maintenance_private.account_access set enabled=true where user_id=$1',[owner]);
  assert.equal(await f.erase(),false);assert.deepEqual(await f.rows(),original);
  await f.db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[owner]);
  await f.db.query('update maintenance_private.app_epochs set enabled=true where user_id=$1',[owner]);
  assert.equal(await f.erase(),false);assert.deepEqual(await f.rows(),original);
  await f.db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
  await f.db.query('update maintenance_private.account_deletion_requests set inventory_captured=false where id=$1',[f.scope.request]);
  assert.equal(await f.erase(),false);assert.deepEqual(await f.rows(),original);
  await f.db.query('update maintenance_private.account_deletion_requests set inventory_captured=true where id=$1',[f.scope.request]);
  await f.db.query("update maintenance_private.account_deletion_requests set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.scope.request]);
  assert.equal(await f.erase(),false);assert.deepEqual(await f.rows(),original);
 }finally{await f.db.close();}
});

test('browser roles cannot invoke native delivery erasure or read the private identities',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated']){
   await f.db.exec('set role '+role);await assert.rejects(f.erase(),/permission denied/);
   await assert.rejects(f.rows(),/permission denied/);await f.db.exec('reset role');
  }
  assert.equal((await f.rows()).length,3);
 }finally{await f.db.close();}
});
