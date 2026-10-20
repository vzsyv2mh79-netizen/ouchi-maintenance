import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
export async function verifyFamilyBeforeClaimCompatibility({admin,auth}){
 const owner=randomUUID(),receiver=randomUUID(),epoch=randomUUID(),home=randomUUID(),native=randomUUID(),lease=randomUUID();
 for(const user of [owner,receiver])await auth.createFixtureUser(user,user+'@fixture.invalid',randomBytes(30).toString('base64url'));
 await admin.query('insert into maintenance_private.account_access values($1,true)',[owner]);await admin.query('insert into maintenance_private.app_epochs values($1,$2,true)',[owner,epoch]);
 await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner]);await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,receiver,'Before-claim compatibility fixture']);
 const facts=async()=>({access:(await admin.query('select * from maintenance_private.account_access where user_id=$1',[owner])).rows,epochs:(await admin.query('select * from maintenance_private.app_epochs where user_id=$1',[owner])).rows,homes:(await admin.query('select * from public.homes where id=$1',[home])).rows,members:(await admin.query('select * from public.home_members where "homeId"=$1 order by user_id',[home])).rows});
 const before=await facts();
 const bodies=(await admin.query("select p.oid::regprocedure::text as signature,p.prosrc,pg_get_functiondef(p.oid) definition from pg_proc p where p.oid in('public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)'::regprocedure,'maintenance_private.owned_homes_have_no_other_members(uuid)'::regprocedure) order by signature")).rows;
 assert.match(bodies.find(x=>x.signature.startsWith('capture_maintenance_deletion_objects')||x.signature.startsWith('public.capture_maintenance_deletion_objects')).prosrc,/if not maintenance_private\.owned_homes_have_no_other_members\(target_user\) then return false/);
 const metadata=(await admin.query("select c.oid::regclass::text as relation,con.conname,pg_get_constraintdef(con.oid) definition from pg_constraint con join pg_class c on c.oid=con.conrelid where con.conrelid in('maintenance_private.household_handoff_plans'::regclass,'maintenance_private.household_handoff_receipts'::regclass,'private.kb_shared_deletion_journal'::regclass) order by relation,conname")).rows;
 await admin.query('begin');try{
  await admin.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[native,owner,epoch,lease]);
  assert.equal((await admin.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) ok',[native,owner,epoch,lease])).rows[0].ok,true);
  assert.equal((await admin.query('select maintenance_private.owned_homes_have_no_other_members($1) ok',[owner])).rows[0].ok,false);
  assert.equal((await admin.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) ok',[native,owner,epoch,lease])).rows[0].ok,false,'Unchanged real canonical capture refuses live family BEFORE changing flags/inventory');
  assert.equal((await admin.query('select inventory_captured,records_erased,identity_erased from maintenance_private.account_deletion_requests where id=$1',[native])).rows[0].inventory_captured,false);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_objects where request_id=$1',[native])).rows[0].n,0);assert.deepEqual(await facts(),before);
 }finally{await admin.query('rollback');}
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_requests where id=$1',[native])).rows[0].n,0);
 assert.deepEqual(await facts(),before);
 assert.deepEqual((await admin.query("select p.oid::regprocedure::text as signature,p.prosrc,pg_get_functiondef(p.oid) definition from pg_proc p where p.oid in('public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)'::regprocedure,'maintenance_private.owned_homes_have_no_other_members(uuid)'::regprocedure) order by signature")).rows,bodies);
 assert.deepEqual((await admin.query("select c.oid::regclass::text as relation,con.conname,pg_get_constraintdef(con.oid) definition from pg_constraint con join pg_class c on c.oid=con.conrelid where con.conrelid in('maintenance_private.household_handoff_plans'::regclass,'maintenance_private.household_handoff_receipts'::regclass,'private.kb_shared_deletion_journal'::regclass) order by relation,conname")).rows,metadata);
 console.log('Family BEFORE-CLAIM compatibility: actual live native lease + actual family -> unchanged canonical capture returns false before enrollment/inventory mutation; owned-family guard, canonical function bodies, legacy PKs/constraints unchanged; synthetic native row rolled back. Therefore before-claim family inventory must remain a separate signed preparation snapshot, not canonical inventory_captured=true until lawful handoff. BodySHA256='+JSON.stringify(Object.fromEntries(bodies.map(x=>[x.signature,createHash('sha256').update(x.prosrc).digest('hex')]))));
}
