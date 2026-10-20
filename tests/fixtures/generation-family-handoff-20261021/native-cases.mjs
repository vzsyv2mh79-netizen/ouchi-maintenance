import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generationHandoffModule} from '../scoped-shared-consent-module.mjs';
export async function prepareGenerationHandoffFixture({admin,owner,receiver}){
 const privateHome=randomUUID(),outsideHome=randomUUID(),privateProduct=randomUUID();
 await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[privateHome,owner.user]);
 await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[privateProduct,privateHome,'air','Private home retained']);
 await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[outsideHome,receiver.user]);
 await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[outsideHome,owner.user,'Outside membership preserved']);
 return {privateHome,outsideHome,privateProduct};
}
export async function verifyGenerationFamilyHandoff({admin,coordinator,transaction,originalOptions,scope,generationID,owner,receiver,receiver2,home,home2,product,privateHome,outsideHome,privateProduct}){
 let admitted=true;const options={...originalOptions,verifyNoDispatch:async(...args)=>admitted&&await originalOptions.verifyNoDispatch(...args),verifyHandoffAdmission:async(s,tx,signal,phase)=>{assert.ok(['before','after'].includes(phase));return admitted&&await originalOptions.verifyNoDispatch(s,tx,signal);}};
 const port=generationHandoffModule.createGenerationFamilyHandoff(options);
 const originals=(await admin.query('select * from maintenance_private.generation_family_originals where generation_id=$1 order by home_id,actor_id',[generationID])).rows;
 const plans=(await admin.query('select * from maintenance_private.household_handoff_plans order by home_id')).rows;
 const snapshot=async()=>({homes:(await admin.query('select * from public.homes where id=any($1) order by id',[[home,home2,privateHome,outsideHome]])).rows,privateProduct:(await admin.query('select * from public.products where id=$1',[privateProduct])).rows,outsideMembership:(await admin.query('select * from public.home_members where "homeId"=$1 and user_id=$2',[outsideHome,owner.user])).rows,product:(await admin.query('select * from public.products where id=$1',[product])).rows,native:(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[scope.apps[0].requestID])).rows});
 const before=await snapshot();assert.equal(before.native[0].inventory_captured,false);
 assert.equal(await transaction(coordinator,tx=>port.verifyAfter(scope,tx)),false);
 await assert.rejects(coordinator.query('update public.homes set owner_id=$2 where id=$1',[home,receiver.user]),/permission denied/);
 await assert.rejects(transaction(coordinator,async tx=>{try{await port.execute(scope,tx);}catch(e){if(e.code)console.error('Handoff SQL diagnostic',JSON.stringify({code:e.code,where:e.where}));throw e;}admitted=false;}),/Current transaction verification/);admitted=true;
 assert.deepEqual(await snapshot(),before,'Late handoff/capture failure restores ownership, family content and native flags');
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_family_handoffs where generation_id=$1',[generationID])).rows[0].n,0);
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.family_preparation_dispatches where generation_id=$1',[generationID])).rows[0].n,0);
 await admin.query('begin');try{
  await admin.query("insert into maintenance_private.generation_family_handoffs select generation_id,after_state,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,null,null,'staging',pg_backend_pid(),txid_current() from maintenance_private.family_native_preparations where generation_id=$1",[generationID]);
  await assert.rejects(admin.query('commit'),/Exact generation handoff\/capture COMMIT/,'A raw staging witness cannot commit without actual full handoff/canonical capture');
 }finally{await admin.query('rollback');}
 assert.deepEqual(await snapshot(),before);
 assert.equal(await transaction(coordinator,tx=>port.execute(scope,tx)),true);
 const after=await snapshot();assert.equal(after.homes.find(x=>x.id===home).owner_id,receiver.user);assert.equal(after.homes.find(x=>x.id===home2).owner_id,receiver2.user);assert.deepEqual(after.product,before.product);assert.deepEqual(after.privateProduct,before.privateProduct);assert.deepEqual(after.outsideMembership,before.outsideMembership);assert.equal(after.homes.find(x=>x.id===privateHome).owner_id,owner.user);assert.equal(after.homes.find(x=>x.id===outsideHome).owner_id,receiver.user);
 await assert.rejects(admin.query('update public.products set name=$2 where id=$1',[product,'Must stay held after transfer']),/stop|fenc|closed/i);
 assert.equal(after.native[0].inventory_captured,true);assert.equal(after.native[0].records_erased,false);assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_family_handoff_contexts where generation_id=$1',[generationID])).rows[0].n,0);assert.equal(after.native[0].identity_erased,false);
 assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_family_home_handoffs where generation_id=$1',[generationID])).rows[0].n,2);
 const witness=(await admin.query('select * from maintenance_private.generation_family_handoffs where generation_id=$1',[generationID])).rows;
 assert.equal(await transaction(coordinator,tx=>port.verifyAfter(scope,tx)),true,'Fresh private post-handoff facts and SAME new-domain original HMACs verify');
 assert.equal(await transaction(coordinator,tx=>port.execute(scope,tx)),true,'Lost acknowledgement retry verifies durable state, never re-handoffs or renews originals');
 assert.deepEqual((await admin.query('select * from maintenance_private.generation_family_handoffs where generation_id=$1',[generationID])).rows,witness);
 assert.deepEqual((await admin.query('select * from maintenance_private.generation_family_originals where generation_id=$1 order by home_id,actor_id',[generationID])).rows,originals);
 assert.deepEqual((await admin.query('select * from maintenance_private.household_handoff_plans order by home_id')).rows,plans);
 await assert.rejects(coordinator.query('select maintenance_private.current_generation_handoff_context()'),/permission denied/);
 await assert.rejects(coordinator.query('select * from maintenance_private.generation_family_handoffs'),/permission denied/);
 await assert.rejects(admin.query('update maintenance_private.generation_family_handoffs set originals=\'[]\' where generation_id=$1',[generationID]),/Immutable generation handoff history/);
 assert.equal((await admin.query('select stopped from maintenance_private.household_principal_fences where user_id=$1',[owner.user])).rows[0].stopped,true,'Owner tombstone/write stop is not released by handoff');
 await admin.query("insert into maintenance_private.family_preparation_dispatches values($1,'erase','unknown')",[generationID]);
 assert.equal(await transaction(coordinator,tx=>port.verifyAfter(scope,tx)),false,'Unknown external dispatch invalidates post-handoff authority');
 await assert.rejects(transaction(coordinator,tx=>port.execute(scope,tx)),/Current same-generation originals\/dispatch admission/);
 assert.deepEqual(await snapshot(),after,'Unknown dispatch refusal does not repeat or erase household changes');
 console.log('Generation family handoff: actual2home lawful owner replacement with all4 SAME new-domain TOTP originals, full home/member/product/task/history preservation; unchanged canonical capture runs only AFTER all handoffs and records captured=true. Fresh post-delta Auth/HMAC reader and lost-ack retry preserve exact originals/expiry/witness. Late admission failure rolls ownership/native/context/dispatch back; raw private access refused. Root receipts stay empty: no global handoff-family checkpoint/erasure/family-write release/file/production/retention adoption.');
}
