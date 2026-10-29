import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createOuchiAuthRecreationExclusion,OUCHI_AUTH_EXCLUSION_CALLER_SQL} from '../../lib/ouchi-auth-recreation-exclusion.mjs';
import {ouchiAuthRecreationKey,OUCHI_AUTH_INSERT_GUARD_BODY,OUCHI_AUTH_EXCLUSION_DOMAIN} from '../../lib/ouchi-auth-recreation-key.mjs';
import {AUTH_DELETE_LOCKS_SQL} from './auth-delete-locks-20261021.mjs';

// Disposable native matrix, not a production Auth/role provisioning service.
export async function installHeldAuthExclusionFixture(admin){
 await admin.query('create role ouchi_auth_insert_guard_owner nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ouchi_auth_exclusion_backend login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;create role ouchi_auth_insert_fixture login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant usage on schema auth to ouchi_auth_insert_fixture;grant insert(id) on auth.users to ouchi_auth_insert_fixture');
 await admin.query(readFileSync('tests/fixtures/auth-recreation-session-guard.sql','utf8'));
}

export async function runHeldAuthRemovalInterval({admin,coordinator,auth,scope,socket,transaction,postOptions,createInterval,createAfterAuth,oldAfterAuth,oldPostNative,stages,journal,actualAuthAbsent}){
 await admin.query(readFileSync('tests/fixtures/ouchi-owner-auth-interval-consent.sql','utf8'));
 await admin.query('grant execute on function maintenance_private.read_ouchi_owner_auth_interval_original(uuid,uuid,jsonb,uuid) to shared_retirement_backend');
 const exclusion=createOuchiAuthRecreationExclusion({target:{kind:'isolated-fixture',socket},verifyRemainingPaths:(tx,s,signal)=>postOptions.verifyReadAuthority(tx,s,signal)});
 let removed=false,deletes=0,original;
 await exclusion.withScope(scope,AbortSignal.timeout(15000),async held=>{
  const forTx=async tx=>{
   const binding=await held.bind(tx,scope,tx.signal);assert.ok(binding);
   return createInterval({...postOptions,verifyAuthRecreationFence:binding.verify,verifyPhaseAuthority:async(t,s,signal)=>{
    if(signal!==t.signal||JSON.stringify(s)!==JSON.stringify(scope)||(await t.query(AUTH_DELETE_LOCKS_SQL,[])).rows[0]?.clear!==true)return false;
    // Actual remote presence/absence is checked. Dispatch reservation/unknown
    // delivery policy is explicitly a fixture; production uses the root port.
    return removed?await actualAuthAbsent():!await actualAuthAbsent();
   }});
  };
  await assert.rejects(transaction(coordinator,async tx=>{
   const reader=await forTx(tx);assert.ok(await oldPostNative.readSnapshot(tx),'Old reader deliberately takes its required Auth-parent lock');
   await assert.rejects(reader.read(tx),/phase authority/,'A parent-locking reader cannot enter the new external DELETE interval');
  }),/Current transaction verification/);
  assert.equal(deletes,0);assert.equal(await actualAuthAbsent(),false);
  // A future Auth-FK coupling on a row-locking custody relation must refuse
  // BEFORE the API call. This synthetic column is removed without changing
  // the original's payload/signature or weakening its immutable trigger.
  const ddl=(await admin.query("select format('alter table maintenance_private.ouchi_owner_originals add column auth_interval_fixture uuid default %L::uuid references auth.users(id) on delete cascade', $1::text) sql",[scope.userID])).rows[0].sql;
  await admin.query(ddl);
  try{await transaction(coordinator,async tx=>{const reader=await forTx(tx);assert.equal(await reader.readSnapshot(tx),null,'Auth descendant custody must not become a row-locking deletion interval');});}
  finally{await admin.query('alter table maintenance_private.ouchi_owner_originals drop column auth_interval_fixture');}
  assert.equal(await actualAuthAbsent(),false);assert.equal(deletes,0);
  stages['erase-auth']=async(s,tx)=>{
   assert.equal(JSON.stringify(s),JSON.stringify(scope));const reader=await forTx(tx);
   original=await reader.read(tx);assert.ok(original);assert.equal(original.kind,'owner-only-auth-removal-interval-history');
   assert.equal((await tx.query(AUTH_DELETE_LOCKS_SQL,[])).rows[0].clear,true,'Root owns no Auth/cascade/partition non-AccessShare lock before independent DELETE');
   assert.equal((await tx.query("select count(*)::int n from pg_catalog.pg_locks where pid=pg_backend_pid() and locktype='advisory'",[])).rows[0].n,1,'Interval caller owns only the dedicated identity shared key, no generic app-principal key');
   assert.equal(await actualAuthAbsent(),false);deletes++;
   await auth.eraseFixtureUser(scope.userID);removed=true;assert.equal(await actualAuthAbsent(),true);
   assert.deepEqual(await reader.readSnapshot(tx),original,'Same interval handles actual removed state before erase-auth receipt is stamped');
   assert.equal(await oldAfterAuth.readSnapshot(tx),null,'Separate after-auth reader still requires durable erase-auth receipt');
   return true;
  };
  await journal.perform(scope,'erase-auth');
  await journal.perform(scope,'erase-auth');assert.equal(deletes,1,'Durable stage replay does not send DELETE again');
  await transaction(coordinator,async tx=>{
   const binding=await held.bind(tx,scope,tx.signal);assert.ok(binding);
   const after=createAfterAuth({...postOptions,verifyAuthRecreationFence:binding.verify});const result=await after.read(tx);assert.ok(result);
   assert.deepEqual(result.payload,original.payload);assert.equal(result.signature,original.signature);
  });
 });
 console.log('Actual original Auth DELETE completed inside owning root transaction with a separate held, non-Auth-locking interval reader before/after/COMMIT; FK-coupled custody refused before dispatch, exact erase-auth replay did not re-delete, and fresh bound after-auth reader accepted only after durable acknowledgement. Root dispatch/remaining-path coverage remain fixtures.');
}

// Disposable native matrix, not a production Auth/role provisioning service.
export async function verifyHeldAuthExclusion({admin,coordinator,writer,auth,scope,socket,transaction,postOptions,createAfterAuth}){
 const sqlInserter=new pg.Client({host:socket,port:5432,user:'ouchi_auth_insert_fixture',database:'postgres',password:'unused-disposable-local-trust',ssl:false});
 const foreign=new pg.Client({host:socket,port:5432,user:'shared_retirement_backend',database:'postgres',password:'unused-disposable-local-trust',ssl:false});
 await sqlInserter.connect();await foreign.connect();
 let operationalFixtureLive=true;
 const exclusion=createOuchiAuthRecreationExclusion({target:{kind:'isolated-fixture',socket},verifyRemainingPaths:async(tx,s,checkSignal)=>operationalFixtureLive&&checkSignal===tx.signal&&await postOptions.verifyReadAuthority(tx,s,checkSignal)});
 const password=()=>randomBytes(30).toString('base64url');
 const email=id=>id+'@fixture.invalid';
 const scopeSignal=()=>AbortSignal.timeout(15000);
 const guardRefusal=e=>e.code==='55000'&&e.message==='Auth identity write excluded during account retirement';
 const bindReader=async(held,tx)=>{
  const binding=await held.bind(tx,scope,tx.signal);assert.ok(binding,'Actual direct role, immutable guard metadata and same-instance lock observer must validate');
  return {binding,reader:createAfterAuth({...postOptions,verifyAuthRecreationFence:binding.verify})};
 };
 const exactOriginal=async()=>exclusion.withScope(scope,scopeSignal(),held=>transaction(coordinator,async tx=>{
  const {reader}=await bindReader(held,tx);assert.ok(await reader.read(tx));return true;
 }));
 const functionSQL=(body,security='invoker')=>`create or replace function maintenance_private.guard_ouchi_auth_recreation_identity() returns trigger language plpgsql volatile security ${security} set search_path='' as $guard_case$${body}$guard_case$;`;
 try{
  for(const actor of [scope.userID,'ffffffff-ffff-ffff-ffff-ffffffffffff']){
   const sqlKey=(await admin.query("select ('x'||encode(substr(sha256(convert_to($1||$2::uuid::text,'UTF8')),1,8),'hex'))::bit(64)::bigint as value",[OUCHI_AUTH_EXCLUSION_DOMAIN,actor])).rows[0].value;
   assert.equal(sqlKey,String(ouchiAuthRecreationKey(actor)),'Node/SQL share the signed single-bigint advisory namespace');
  }
  // Initialize a real REPEATABLE READ snapshot BEFORE acquisition. Trigger
  // enforcement must use the lock manager, not that writer's MVCC snapshot.
  await writer.query('begin isolation level repeatable read');
  await writer.query('select count(*) from auth.users where id=$1',[scope.userID]);
  let oldBinding;
  await exclusion.withScope(scope,scopeSignal(),async held=>{
   let competingWork=false;
   await assert.rejects(exclusion.withScope(scope,scopeSignal(),async()=>{competingWork=true;}),/already excluded/);assert.equal(competingWork,false);
   await assert.rejects(writer.query('insert into auth.users(id) values($1)',[scope.userID]),guardRefusal,'RR writer snapshot cannot bypass held actor');await writer.query('rollback');
   await writer.query('begin');await writer.query("set local session_replication_role='replica'");
   await assert.rejects(writer.query('insert into auth.users(id) values($1)',[scope.userID]),guardRefusal,'ALWAYS INSERT guard covers replica writers');await writer.query('rollback');
   await writer.query('begin');await writer.query("set local session_replication_role='replica'");
   const otherActor=postOptions.scope.userID===scope.userID?(await admin.query('select owner_id from public.homes limit 1')).rows[0].owner_id:null;assert.ok(otherActor);
   await assert.rejects(writer.query('update auth.users set id=$1 where id=$2',[scope.userID,otherActor]),guardRefusal,'UUID UPDATE must not bypass INSERT exclusion under replica');await writer.query('rollback');
   // Concrete remaining-path gap: this guard covers Auth PRINCIPAL ids, not
   // arbitrary writes into other Auth tables that a privileged replica writer
   // can orphan by bypassing FKs. Roll this injection back before reader proof.
   const sessionSample=(await admin.query('select to_jsonb(s) body from auth.sessions s where user_id=$1 limit 1',[otherActor])).rows[0].body;
   const orphan={...sessionSample,id:randomUUID(),user_id:scope.userID};
   await writer.query('begin');await writer.query("set local session_replication_role='replica'");
   assert.equal((await writer.query('insert into auth.sessions select (jsonb_populate_record(null::auth.sessions,$1::jsonb)).*',[JSON.stringify(orphan)])).rowCount,1,'Other Auth-table replica writers require independent operational exclusion; users guard alone does not prove session absence');
   await writer.query('rollback');
   await assert.rejects(sqlInserter.query('insert into auth.users(id) values($1)',[scope.userID]),guardRefusal,'Invoker trigger runs for a narrow writer without private-schema/function grants');
   await transaction(coordinator,async tx=>{
    const {binding,reader}=await bindReader(held,tx);oldBinding=binding;assert.ok(await reader.read(tx));
    const blocked=await auth.attemptFixtureUserCreate(scope.userID,email(scope.userID),password());
    assert.equal(blocked.status,500);assert.equal(blocked.body.error_code,'unexpected_failure','Actual GoTrue Admin create is refused by the held INSERT guard');
    assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1',[scope.userID])).rows[0].n,0);
   });
   // Same session exclusion remains across multiple actual owning COMMITs.
   const another=randomUUID(),anotherPassword=password();await auth.createFixtureUser(another,email(another),anotherPassword);
   assert.equal((await auth.request('/token?grant_type=password',{email:email(another),password:anotherPassword})).user.id,another,'Other UUID create and password login continue');
   const signup=await auth.request('/signup',{email:email(randomUUID()),password:password()});assert.ok(signup.user.id);assert.notEqual(signup.user.id,scope.userID,'Other UUID signup continues');
   await transaction(coordinator,async tx=>{const {reader}=await bindReader(held,tx);assert.ok(await reader.read(tx));});
  });
  assert.equal(await oldBinding.verify({},scope,AbortSignal.timeout(1000)),false,'Released transaction proof is not reusable');
  assert.equal((await admin.query("select count(*)::int n from pg_stat_activity where usename='ouchi_auth_exclusion_backend'")).rows[0].n,0);
  // The inverse race: an INSERT already owns the transaction lock. The holder
  // refuses non-blockingly instead of accepting a stale empty Auth snapshot.
  await writer.query('begin');await writer.query('insert into auth.users(id) values($1)',[scope.userID]);
  let entered=false;await assert.rejects(exclusion.withScope(scope,scopeSignal(),async()=>{entered=true;}),/already excluded/);assert.equal(entered,false);await writer.query('rollback');

  async function rejectedScope(label,mutate,restore=async()=>{}){
   try{
    await assert.rejects(exclusion.withScope(scope,scopeSignal(),held=>transaction(coordinator,async tx=>{
     const {binding,reader}=await bindReader(held,tx);assert.ok(await reader.read(tx));await tx.query('insert into private.owner_history_marker values(10)');
     await mutate({held,binding,tx});
    })),/Auth exclusion|Current transaction/,label);
   }finally{await restore();}
   assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker')).rows[0].n,0,label+' rolls caller work back');
  }
  await rejectedScope('guard disable',()=>admin.query('alter table auth.users disable trigger ouchi_auth_recreation_insert_fence'),()=>admin.query('alter table auth.users enable always trigger ouchi_auth_recreation_insert_fence'));
  await rejectedScope('unexpected definer',()=>admin.query('alter function maintenance_private.guard_ouchi_auth_recreation_identity() security definer'),()=>admin.query('alter function maintenance_private.guard_ouchi_auth_recreation_identity() security invoker'));
  await rejectedScope('body hash drift',()=>admin.query(functionSQL(OUCHI_AUTH_INSERT_GUARD_BODY+'\n')),()=>admin.query(functionSQL(OUCHI_AUTH_INSERT_GUARD_BODY)));
  await rejectedScope('holder Auth privilege broadening',()=>admin.query('grant usage on schema auth to ouchi_auth_exclusion_backend;grant insert(id) on auth.users to ouchi_auth_exclusion_backend'),()=>admin.query('revoke insert(id) on auth.users from ouchi_auth_exclusion_backend;revoke usage on schema auth from ouchi_auth_exclusion_backend'));
  await rejectedScope('remaining-path coverage loss',async()=>{operationalFixtureLive=false;},async()=>{operationalFixtureLive=true;});
  await rejectedScope('foreign transaction object',async({binding,tx})=>{assert.equal(await binding.verify({...tx},scope,tx.signal),false);});
  await assert.rejects(exclusion.withScope(scope,scopeSignal(),held=>transaction(coordinator,async tx=>{
   let redirected=false;
   const routed=Object.freeze({...tx,query:(sql,args)=>sql===OUCHI_AUTH_EXCLUSION_CALLER_SQL&&redirected?foreign.query(sql,args):tx.query(sql,args)});
   const binding=await held.bind(routed,scope,routed.signal);assert.ok(binding);
   const reader=createAfterAuth({...postOptions,verifyAuthRecreationFence:binding.verify});assert.ok(await reader.read(routed));
   await tx.query('insert into private.owner_history_marker values(11)');redirected=true;
   assert.equal(await binding.verify(routed,scope,routed.signal),false,'A real different backend PID/XID cannot stand in for the pinned caller');
  })),/Auth exclusion/);
  assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker')).rows[0].n,0,'Physical PID drift refuses the owning COMMIT');
  await rejectedScope('connection loss',async()=>{
   const p=(await admin.query("select pid from pg_stat_activity where usename='ouchi_auth_exclusion_backend' and application_name like 'OuchiAuthExclusion/%'")).rows;assert.equal(p.length,1);
   assert.equal((await admin.query('select pg_terminate_backend($1) stopped',[p[0].pid])).rows[0].stopped,true);
  });
  // Reproduce the last-check/COMMIT transport gap with a real terminated
  // holder. The owning transaction's shared xact key must survive independently
  // even though withScope can only report uncertainty after COMMIT.
  await assert.rejects(exclusion.withScope(scope,scopeSignal(),held=>transaction(coordinator,async tx=>{
   const {binding}=await bindReader(held,tx);
   await tx.query('insert into private.owner_history_marker values(12)');
   tx.beforeCommit('native:last-check-transport-loss',async()=>{
    assert.equal(await binding.verify(tx,scope,tx.signal),true,'Last genuine verification before transport loss');
    const p=(await admin.query("select pid from pg_stat_activity where usename='ouchi_auth_exclusion_backend' and application_name like 'OuchiAuthExclusion/%'")).rows;assert.equal(p.length,1);
    assert.equal((await admin.query('select pg_terminate_backend($1) stopped',[p[0].pid])).rows[0].stopped,true);
    const blocked=await auth.attemptFixtureUserCreate(scope.userID,email(scope.userID),password());
    assert.equal(blocked.status,500,'Own shared xact lock blocks actual same-ID Admin create AFTER final verification and holder death');
    assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1',[scope.userID])).rows[0].n,0);
    return true;
   });
  })),/Auth exclusion|connection|terminated/i);
  assert.equal((await admin.query('select count(*)::int n from private.owner_history_marker where id=12')).rows[0].n,1,'The actual owning COMMIT completed with recreation still excluded');
  await admin.query('delete from private.owner_history_marker where id=12');
  await exactOriginal(); // New physical holder/binding, fresh actual absence.
  // After release a same-ID insert really can proceed. A fresh holder must not
  // turn that presence into history authority merely because it reacquired.
  await auth.createFixtureUser(scope.userID,email(scope.userID),password());
  await assert.rejects(exclusion.withScope(scope,scopeSignal(),held=>transaction(coordinator,async tx=>{
   const {reader}=await bindReader(held,tx);assert.equal(await reader.read(tx),null);
  })),/Current transaction/);
  await auth.eraseFixtureUser(scope.userID); // Synthetic replacement only, no automatic production delete/retry.
  await exactOriginal();
  // DELETE is unaffected and does not wait on an Auth-parent row/table lock.
  const deleteActor=randomUUID();await auth.createFixtureUser(deleteActor,email(deleteActor),password());
  await exclusion.withScope({...scope,userID:deleteActor},scopeSignal(),async()=>{
   await writer.query('begin');await writer.query("set local session_replication_role='replica'");
   await assert.rejects(writer.query('update auth.users set id=$1 where id=$2',[randomUUID(),deleteActor]),guardRefusal,'A held original id cannot be renamed away either');await writer.query('rollback');
   await auth.eraseFixtureUser(deleteActor);
  });
  assert.equal((await admin.query('select count(*)::int n from auth.users where id=$1',[deleteActor])).rows[0].n,0);
  assert.equal((await admin.query("select count(*)::int n from pg_stat_activity where usename='ouchi_auth_exclusion_backend'")).rows[0].n,0);
  console.log('Held Auth guard matrix: real Admin same-ID INSERT refused; other UUID signup/create/login allowed; stale RR, replica user INSERT/UUID UPDATE in either direction refused; narrow invoker writer refused; same lock spans multiple COMMITs. Guard/definer/body/role drift, foreign transaction/real PID and connection loss refuse/rollback. Exact holder closes; fresh acquisition still checks actual absence. DELETE unaffected. A privileged replica orphan-session INSERT is NOT blocked by this users guard and was rolled back: other Auth-table/app reenrollment/all-app/DDL coverage remain separately required, not proven here.');
 }finally{
  await writer.query('rollback');await sqlInserter.end();await foreign.end();
 }
}
