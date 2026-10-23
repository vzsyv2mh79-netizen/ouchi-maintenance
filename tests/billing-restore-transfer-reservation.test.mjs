import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-restore-client-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRestoreChallenge,restoreAssertionClientData}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const scaffold=`set check_function_bodies=false;create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
 create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
 create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
 create table maintenance_private.account_access(user_id uuid,enabled boolean);create table maintenance_private.app_epochs(user_id uuid,epoch_id uuid,enabled boolean);
 create table maintenance_private.account_deletion_requests(id uuid,user_id uuid,app_epoch_id uuid,lease_token uuid,inventory_captured boolean,records_erased boolean,receipt_sessions_captured boolean);
 create table maintenance_private.account_deletion_objects(request_id uuid,absence_confirmed boolean);
 create function public.maintenance_deletion_lease_is_current(r uuid,u uuid,e uuid,l uuid) returns boolean language sql stable security invoker as $$select exists(select 1 from maintenance_private.account_deletion_requests where id=r and user_id=u and app_epoch_id=e and lease_token=l)$$;
 grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;grant update(id) on maintenance_private.account_deletion_requests to service_role;`;
const digest=v=>createHash('sha256').update(v).digest('hex');
test('actual SQL: atomic proof consumption/job reservation, retry, conflicts, unknown CAS and browser denial',async()=>{
 const db=new PGlite();try{
  await db.exec(scaffold);
  await db.exec(`create table maintenance_private.transaction_ownership(environment text,original_transaction_id text,user_id uuid,app_epoch_id uuid);grant select on maintenance_private.transaction_ownership to service_role;`);
  await db.exec(readFileSync('supabase/migrations/20261011142510_ouchi_restore_challenge_ledger.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261012004145_ouchi_restore_transfer_reservation.sql','utf8'));
  const user=randomUUID(),session=randomUUID(),epoch=randomUUID(),otherUser=randomUUID(),otherSession=randomUUID(),otherEpoch=randomUUID();
  const key=Buffer.alloc(32,1).toString('base64'),otherKey=Buffer.alloc(32,2).toString('base64');
  await db.query('insert into auth.users values($1),($2)',[user,otherUser]);
  await db.query('insert into maintenance_private.live_scope(user_id,session_id,epoch_id) values($1,$2,$3),($4,$5,$6)',[user,session,epoch,otherUser,otherSession,otherEpoch]);
  await db.exec('set role service_role');
  for(const [u,s,e,k] of [[user,session,epoch,key],[otherUser,otherSession,otherEpoch,otherKey]])await db.query(`insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt) values($1,$2,$3,$4,'SYNTHETIC1.dev.synthetic.ouchi','development',$5,$6,$7)`,[k,u,e,s,Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]),'a'.repeat(64),Buffer.from('synthetic-not-Apple-verified')]);
  const make=async(u=user,s=session,e=epoch,k=key)=>{
   const c=createRestoreChallenge({userID:u,sessionID:s,epochID:e,keyID:k,requestID:randomUUID(),appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'development',purchaseEnvironment:'Sandbox',proofSHA256:'b'.repeat(64)});
   const hash=digest(restoreAssertionClientData(c));
   await db.query(`insert into maintenance_private.restore_challenges(request_id,user_id,session_id,app_epoch_id,key_id,challenge,nonce,client_data_sha256,issued_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::numeric/1000),to_timestamp($10::numeric/1000))`,[c.requestID,u,s,e,k,c,c.nonce,hash,c.issuedAt,c.expiresAt]);
   return {c,hash,lease:randomUUID(),prior:randomUUID()};
  };
  const enqueue=(v,original='100001',counter=0,changes={})=>{
   const a={request:v.c.requestID,user:v.c.userID,session:v.c.sessionID,epoch:v.c.epochID,key:v.c.keyID,counter,next:counter+1,hash:v.hash,assertion:'c'.repeat(64),pair:'b'.repeat(64),original,app:'200001',prior:v.prior,bundle:'dev.synthetic.ouchi',lease:v.lease,...changes};
   return db.query('select public.enqueue_maintenance_restore_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) value',Object.values(a)).then(r=>r.rows[0].value);
  };
  const count=()=>db.query('select assertion_counter from maintenance_private.restore_attested_keys where key_id=$1',[key]).then(r=>r.rows[0].assertion_counter);
  const first=await make();
  assert.equal(await enqueue(first),null,'shipping migration keeps transfer disabled');assert.equal(await count(),0);
  await assert.rejects(db.exec('update maintenance_private.restore_transfer_policy set enabled=true where id=1'),/permission denied/);
  await db.exec('reset role');await db.exec('update maintenance_private.restore_transfer_policy set enabled=true where id=1');await db.exec('set role service_role');
  for(const changes of [{pair:'d'.repeat(64)},{bundle:'foreign.app'},{session:otherSession},{prior:epoch},{original:'../x'}]){assert.equal(await enqueue(first,'100001',0,changes),null);assert.equal(await count(),0);}
  assert.equal(await enqueue(first),first.c.requestID);assert.equal(await count(),1);
  assert.equal(await enqueue(first),first.c.requestID,'exact lost-response retry returns existing job without consuming again');
  assert.equal(await enqueue(first,'100001',0,{lease:randomUUID()}),null);
  const competitor=await make(otherUser,otherSession,otherEpoch,otherKey);
  assert.equal(await enqueue(competitor),null,'original purchase remains reserved across another account');
  assert.equal((await db.query('select consumed_at from maintenance_private.restore_challenges where request_id=$1',[competitor.c.requestID])).rows[0].consumed_at,null);
  const current=phase=>db.query('select public.maintenance_restore_transfer_lease_is_current($1,$2,$3,$4,$5,$6) value',[first.c.requestID,first.lease,user,session,epoch,phase]).then(r=>r.rows[0].value);
  const mark=lease=>db.query('select public.mark_maintenance_restore_transfer_update($1,$2,$3,$4,$5) value',[first.c.requestID,lease,user,session,epoch]).then(r=>r.rows[0].value);
  assert.equal(await current('authorized'),true);assert.equal(await mark(randomUUID()),null);
  const started=await mark(first.lease);assert.equal(started.phase,'update_started');assert.equal(started.previousAccountToken,first.prior);
  assert.ok(started.mutationStartedAt>=started.authorizedAt);assert.equal(await mark(first.lease),null,'second worker cannot get mutation permission');
  assert.equal(await current('authorized'),false);assert.equal(await current('update_started'),true);
  // SQL insertion failure must roll back nonce/counter consumption as well.
  const rollback=await make();await db.exec('reset role');
  await db.exec(`create function maintenance_private.fail_restore_job() returns trigger language plpgsql as $$begin if new.original_transaction_id='100002' then raise exception 'synthetic insert failure';end if;return new;end;$$;create trigger injected_job_failure before insert on maintenance_private.restore_transfer_jobs for each row execute function maintenance_private.fail_restore_job();`);
  await db.exec('set role service_role');await assert.rejects(enqueue(rollback,'100002',1),/synthetic insert failure/);assert.equal(await count(),1);
  assert.equal((await db.query('select consumed_at from maintenance_private.restore_challenges where request_id=$1',[rollback.c.requestID])).rows[0].consumed_at,null);
  await db.exec('reset role');await db.query('update maintenance_private.live_scope set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');assert.equal(await current('update_started'),false);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.restore_transfer_jobs')).rows[0].n,1,'unknown reservation survives revoked session');
  await db.exec('reset role');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='maintenance_private.restore_transfer_jobs'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query("select has_column_privilege('service_role','maintenance_private.restore_transfer_jobs','app_epoch_id','UPDATE') as allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('enqueue_maintenance_restore_transfer','maintenance_restore_transfer_lease_is_current','mark_maintenance_restore_transfer_update') and prosecdef")).rows[0].n,0);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from maintenance_private.restore_transfer_jobs'));await assert.rejects(db.query('select public.mark_maintenance_restore_transfer_update($1,$2,$3,$4,$5)',[first.c.requestID,first.lease,user,session,epoch]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
 // PGlite SQL + synthetic Auth/key/assertion fixtures only. No true concurrent
 // PostgreSQL sessions, Apple signature verification, transfer or paid access.
});
