import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {AuthApiError,AuthError} from '@supabase/supabase-js';
import {seedSharedMaintenanceComposition} from './shared-maintenance-composition.mjs';
import {requireDeletionPrerequisites} from './kakei-completion/lib/shared-deletion-journal.mjs';
import {metadataRows} from './shared-native-metadata.mjs';
import {deviceRows} from './shared-native-devices.mjs';

// Explicit disposable GoTrue/PG/Storage only. Synthetic inventory/enrollment,
// retention and SQL-owner role; one Ouchi-only actor, no family handoff or files.
export async function verifyDisposableSharedMaintenanceComposition({db,account,admin,origin,bytes,retainedPath,dropAuthReplies}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 assert.equal(admin.supabaseUrl,origin);for(const name of ['start','stop','count','requests'])assert.equal(typeof dropAuthReplies?.[name],'function');
 assert.equal(db.connectionParameters.host,'127.0.0.1');assert.equal(db.connectionParameters.port,54323);
 const dispatch=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:2000,query_timeout:5000});await dispatch.connect();
 const ok=result=>{assert.equal(result.error,null);return result.data;};
 try{
  assert.equal(Number((await db.query("select count(*) n from pg_constraint where conrelid='maintenance_private.account_deletion_requests'::regclass and confrelid='auth.users'::regclass")).rows[0].n),0);
  await dispatch.query('create table private.composition_fixture_auth_dispatch(request_id uuid primary key,scope jsonb not null);alter table private.composition_fixture_auth_dispatch enable row level security;revoke all on private.composition_fixture_auth_dispatch from public,anon,authenticated,service_role');
  const actor=await account(),bystander=await account();assert.match(actor.email,/^family-ci-[a-f0-9-]+@example\.invalid$/);
  const home=randomUUID(),product=randomUUID(),task=randomUUID();
  ok(await actor.client.from('homes').insert({id:home,owner_id:actor.user,name:'Synthetic global retirement',kind:'home'}));
  ok(await actor.client.from('products').insert({id:product,homeId:home,categoryId:'air',name:'Synthetic global product'}));
  ok(await actor.client.from('maintenance_tasks').insert({id:task,productId:product,name:'Synthetic global task',kind:'掃除',intervalDays:30,nextDueAt:'2030-01-01',sourceKind:'ユーザー設定'}));
  ok(await actor.client.from('maintenance_history').insert({taskId:task,productId:product,completedAt:'2026-01-01'}));
  const foreignAuth=(await db.query('select id from auth.users where id<>$1 order by id',[actor.user])).rows;
  const readAuth=async()=>{
   const result=await admin.auth.admin.getUserById(actor.user);
   if(!result.error&&result.data.user?.id===actor.user)return 'present';
   if(!result.data.user&&result.error instanceof AuthApiError&&result.error.status===404&&result.error.code==='user_not_found')return 'absent';
   return 'unknown';
  };
  let deletes=0,unknownReplies=0;
  const receipt=async scope=>(await dispatch.query('select scope=$2::jsonb matches from private.composition_fixture_auth_dispatch where request_id=$1',[scope.requestID,scope])).rows[0]?.matches===true;
  const eraseAuth=async(scope,tx)=>{
   assert.equal(scope.userID,actor.user);await requireDeletionPrerequisites(tx,scope,'erase-auth');
   const before=await readAuth();if(before==='absent')return receipt(scope);if(before!=='present')return false;
   // Independent committed intent has no Auth/journal FK or dependency on the
   // transaction's row locks. Unknown dispatch is NEVER repeated while present.
   const inserted=await dispatch.query('insert into private.composition_fixture_auth_dispatch values($1,$2) on conflict(request_id) do nothing returning request_id',[scope.requestID,scope]);
   if(inserted.rows.length!==1)return false;
   await requireDeletionPrerequisites(tx,scope,'erase-auth');
   assert.equal(await receipt(scope),true);
   deletes++;try{
    const result=await admin.auth.admin.deleteUser(actor.user,false);
    if(result.error){assert.ok(result.error instanceof AuthError);unknownReplies++;return false;}
    assert.equal(result.data.user?.id,actor.user);
   }catch(error){if(!(error instanceof AuthError))throw error;unknownReplies++;return false;}
   return await readAuth()==='absent';
  };
  const f=await seedSharedMaintenanceComposition({lostStage:'erase:ouchi-maintenance',postAuthFailure:true,
   services:{origin,actor,bystander,db:{query:(...args)=>db.query(...args),exec:sql=>db.query(sql)},eraseAuth,
    verifyAuth:async scope=>{assert.equal(scope.userID,actor.user);return await receipt(scope)&&await readAuth()==='absent';}}});
  assert.deepEqual(await f.run(),{state:'pending',stage:'erase:ouchi-maintenance'});
  const sealed=(await db.query('select id,user_id,app_epoch_id,requested_at,completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows;
  assert.equal(await readAuth(),'present');assert.equal(deletes,0);f.calls.length=0;
  dropAuthReplies.start(actor.user);try{assert.deepEqual(await f.run(),{state:'pending',stage:'erase-auth'});}finally{dropAuthReplies.stop();}
  assert.equal(dropAuthReplies.count(),1);assert.equal(dropAuthReplies.requests(),1);assert.equal(deletes,1);assert.equal(unknownReplies,1);
  assert.equal(await readAuth(),'absent');assert.equal(await receipt(f.scope),true);assert.equal(await f.journal.readReceipt(f.scope,'erase-auth'),null);
  assert.equal(f.calls.some(name=>name.startsWith('native:erase')),false);f.calls.length=0;
  assert.deepEqual(await f.run(),{state:'pending',stage:'verify-family-after-auth'});assert.equal(deletes,1);assert.equal(await f.journal.readReceipt(f.scope,'complete'),null);
  f.calls.length=0;f.allowPostAuth();assert.deepEqual(await f.run(),{state:'complete',notification:'unconfirmed'});assert.equal(f.calls.includes('auth:erase'),false);assert.equal(f.calls.some(name=>name.startsWith('native:erase')),false);assert.ok(f.calls.includes('native:familyAfterAuth'));assert.ok(f.calls.includes('native:sessionsAfterAuth'));
  assert.deepEqual((await db.query('select id,user_id,app_epoch_id,requested_at,completion_lease,receipt_expires_at from maintenance_private.account_deletion_requests where id=$1',[f.native.requestID])).rows,sealed);
  assert.deepEqual(await metadataRows(db,bystander.user),f.keptMetadata);assert.deepEqual(await deviceRows(db,bystander.user),f.keptDevices);
  assert.deepEqual((await db.query('select id from auth.users where id<>$1 order by id',[actor.user])).rows,foreignAuth);
  assert.ok((await actor.client.auth.getUser()).error);assert.deepEqual(ok(await actor.client.from('products').select('id')),[]);
  for(const [table,column,id] of [['homes','id',home],['products','id',product],['maintenance_tasks','id',task],['maintenance_history','taskId',task]])assert.equal(Number((await db.query(`select count(*) n from public.${table} where "${column}"=$1`,[id])).rows[0].n),0);
  const kept=ok(await admin.storage.from('ouchi-product-attachments').download(retainedPath));assert.deepEqual(Buffer.from(await kept.arrayBuffer()),bytes);
  console.log('full shared coordinator actual GoTrue/PostgreSQL/Storage: started with empty prior receipts, actual Ouchi worker and canonical SQL completed, committed app-stage reply loss resumed without native replay; independently committed Auth dispatch survived dropped successful DELETE response, definitive SDK user_not_found recovered without second DELETE, mandatory post-Auth readback failure stayed pending and resumed; original sealed receipt, bystander metadata/devices/private bytes and all other real Auth users preserved; single Ouchi-only actor, synthetic inventory/enrollment/retention and operator role, no production intake/coverage/outbox policy or file-transfer proof');
 }finally{dropAuthReplies.stop();await dispatch.end();}
}
