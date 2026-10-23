import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash,generateKeyPairSync} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-restore-client-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRestoreChallenge,restoreAssertionClientData}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const migration=n=>readFileSync('supabase/migrations/'+n+'.sql','utf8');
test('actual SQL: only exact unreserved nonce cancels atomically; late commit and request reuse are refused',async()=>{
 const db=new PGlite();try{
  await db.exec(`set check_function_bodies=false;create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
  create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
  create table maintenance_private.transaction_ownership(environment text,original_transaction_id text);
  create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
  grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;`);
  for(const file of ['20261011142510_ouchi_restore_challenge_ledger','20261012004145_ouchi_restore_transfer_reservation','20261012015539_ouchi_restore_challenge_transport','20261012031710_ouchi_restore_cancel_unreserved'])await db.exec(migration(file));
  const user=randomUUID(),session=randomUUID(),epoch=randomUUID(),app='SYNTHETIC1.dev.synthetic.ouchi',pair='b'.repeat(64),assertion='c'.repeat(64);
  await db.query('insert into auth.users values($1)',[user]);await db.query('insert into maintenance_private.live_scope(user_id,session_id,epoch_id) values($1,$2,$3)',[user,session,epoch]);
  const {publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),point=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]),key=createHash('sha256').update(point).digest('base64');
  await db.exec('set role service_role');await db.query('insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt) values($1,$2,$3,$4,$5,\'development\',$6,$7,$8)',[key,user,epoch,session,app,point,'a'.repeat(64),Buffer.from('synthetic-not-Apple')]);
  const fresh=(id=randomUUID())=>createRestoreChallenge({userID:user,sessionID:session,epochID:epoch,requestID:id,keyID:key,appID:app,attestEnvironment:'development',purchaseEnvironment:'Sandbox',proofSHA256:pair});
  const hash=c=>createHash('sha256').update(restoreAssertionClientData(c)).digest('hex');
  const issue=async(c)=>(await db.query('select public.issue_maintenance_restore_challenge($1,$2) value',[c,hash(c)])).rows[0].value;
  const cancel=async(c,overrides={})=>{const values=[c.requestID,user,session,epoch,key,app,'development',pair,assertion];for(const [index,value]of Object.entries(overrides))values[Number(index)]=value;return(await db.query('select public.cancel_maintenance_unreserved_restore($1,$2,$3,$4,$5,$6,$7,$8,$9) value',values)).rows[0].value;};
  const count=async(table)=>(await db.query('select count(*)::int n from maintenance_private.'+table)).rows[0].n;
  const c=fresh();assert.equal(await cancel(c),null,'disabled policy');
  await db.exec('reset role');await db.exec('update maintenance_private.restore_transfer_policy set enabled=true');await db.exec('set role service_role');
  assert.equal(await cancel(c),null,'missing nonce is unknown, not cancellation');assert.deepEqual(await issue(c),c);
  for(const overrides of [{0:randomUUID()},{1:randomUUID()},{2:randomUUID()},{3:randomUUID()},{4:Buffer.alloc(32,7).toString('base64')},{5:'SYNTHETIC1.dev.other'},{6:'production'},{7:'e'.repeat(64)},{8:null},{8:'Z'.repeat(64)}])assert.equal(await cancel(c,overrides),null);
  assert.equal(await count('restore_challenges'),1);assert.equal(await count('restore_cancelled_requests'),0);
  const expected={requestID:c.requestID,status:'cancelled',pairSHA256:pair,assertionSHA256:assertion};assert.deepEqual(await cancel(c),expected);assert.deepEqual(await cancel(c),expected,'lost cancellation ack can be recovered exactly');
  assert.equal(await count('restore_challenges'),0);assert.equal(await count('restore_cancelled_requests'),1);
  for(const overrides of [{2:randomUUID()},{7:'d'.repeat(64)},{8:'d'.repeat(64)}])assert.equal(await cancel(c,overrides),null,'receipt bound to original proof and live session');
  const consume=async()=>(await db.query('select public.consume_maintenance_restore_challenge($1,$2,$3,$4,$5,0,1,$6,$7) value',[c.requestID,user,session,epoch,key,hash(c),assertion])).rows[0].value;
  assert.equal(await consume(),false,'late already-verified assertion cannot advance its counter');
  const enqueue=async(ch,original='12345')=>(await db.query('select public.enqueue_maintenance_restore_transfer($1,$2,$3,$4,$5,0,1,$6,$7,$8,$9,$10,$11,$12,$13) value',[ch.requestID,user,session,epoch,key,hash(ch),assertion,pair,original,'98765',randomUUID(),'dev.synthetic.ouchi',randomUUID()])).rows[0].value;
  assert.equal(await enqueue(c),null,'late enqueue cannot recreate a cancelled job');assert.equal(await count('restore_transfer_jobs'),0);
  assert.equal((await db.query('select assertion_counter from maintenance_private.restore_attested_keys where key_id=$1',[key])).rows[0].assertion_counter,0);
  assert.equal(await issue(fresh(c.requestID)),null,'cancelled id cannot receive a replacement nonce');
  await assert.rejects(db.query('insert into maintenance_private.restore_challenges(request_id,user_id,session_id,app_epoch_id,key_id,challenge,nonce,client_data_sha256,issued_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::numeric/1000),to_timestamp($10::numeric/1000))',[c.requestID,user,session,epoch,key,c,c.nonce,hash(c),c.issuedAt,c.expiresAt]),/Cancelled restore/,'direct insertion is also guarded');
  await assert.rejects(db.exec('delete from maintenance_private.restore_cancelled_requests'),/permission denied/);await assert.rejects(db.exec('update maintenance_private.restore_cancelled_requests set pair_hash=pair_hash'),/permission denied/);
  const expired=fresh();assert.ok(await issue(expired));await db.exec('reset role');await db.query("update maintenance_private.restore_challenges set issued_at=statement_timestamp()-interval '10 minutes',expires_at=statement_timestamp()-interval '5 minutes' where request_id=$1",[expired.requestID]);await db.exec('set role service_role');assert.equal((await cancel(expired)).status,'cancelled','stored expired nonce can be cancelled, never merely inferred absent');
  const reserved=fresh();assert.ok(await issue(reserved));assert.equal(await enqueue(reserved),reserved.requestID);assert.equal(await cancel(reserved),null,'reserved authorized job cannot be cancelled');
  await db.query("update maintenance_private.restore_transfer_jobs set phase='update_started',mutation_started_at=clock_timestamp() where id=$1",[reserved.requestID]);assert.equal(await cancel(reserved),null,'external update uncertainty is preserved');assert.equal(await count('restore_transfer_jobs'),1);
  const consumed=fresh();assert.ok(await issue(consumed));await db.query('update maintenance_private.restore_challenges set consumed_at=clock_timestamp(),assertion_sha256=$2,assertion_counter=2 where request_id=$1',[consumed.requestID,assertion]);assert.equal(await cancel(consumed),null,'consumed nonce without job is inconsistent, never safe absence');
  await db.exec('reset role');await db.exec('update maintenance_private.live_scope set enabled=false');await db.exec('set role service_role');assert.equal(await cancel(c),null,'revoked session cannot recover old receipt');
  const catalog=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p where p.proname='cancel_maintenance_unreserved_restore'")).rows[0];assert.equal(catalog.prosecdef,false);assert.ok(catalog.proconfig.some(x=>x.startsWith('search_path=')));assert.equal(catalog.anon,false);assert.equal(catalog.authenticated,false);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='maintenance_private.restore_cancelled_requests'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(cancel(c),/permission denied/);await assert.rejects(count('restore_cancelled_requests'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');await db.query('delete from maintenance_private.restore_attested_keys where key_id=$1',[key]);assert.equal(await count('restore_cancelled_requests'),0,'proof-key erasure cascades cancellation receipts');
 }finally{await db.close();}
 // Synthetic enrollment/key/receipt: no actual Auth, Apple, parallel PostgreSQL,
 // device recovery or deployment/advisors proof is claimed here.
});
