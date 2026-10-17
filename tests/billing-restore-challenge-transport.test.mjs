import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID,createHash,generateKeyPairSync} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-restore-client-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRestoreChallenge,restoreAssertionClientData}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const migration=n=>readFileSync('supabase/migrations/'+n+'.sql','utf8');
test('actual SQL: live scoped key, disabled policy, exact persisted nonce retry and bounded issuance',async()=>{
 const db=new PGlite();try{
  await db.exec(`set check_function_bodies=false;create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
   create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
   create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
   grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;`);
  for(const file of ['20261011142510_ouchi_restore_challenge_ledger','20261012004145_ouchi_restore_transfer_reservation','20261012015539_ouchi_restore_challenge_transport'])await db.exec(migration(file));
  const user=randomUUID(),session=randomUUID(),epoch=randomUUID();
  await db.query('insert into auth.users values($1)',[user]);await db.query('insert into maintenance_private.live_scope(user_id,session_id,epoch_id) values($1,$2,$3)',[user,session,epoch]);
  const {publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=publicKey.export({format:'jwk'});const point=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);const key=createHash('sha256').update(point).digest('base64');
  await db.exec('set role service_role');await db.query("insert into maintenance_private.restore_attested_keys(key_id,user_id,app_epoch_id,registration_session,app_id,attest_environment,public_key_x962,attestation_sha256,verified_receipt) values($1,$2,$3,$4,'SYNTHETIC1.dev.synthetic.ouchi','development',$5,$6,$7)",[key,user,epoch,session,point,'a'.repeat(64),Buffer.from('synthetic-not-Apple-verified')]);
  const read=async(u=user,s=session,e=epoch,k=key)=> (await db.query("select public.read_maintenance_restore_key($1,$2,$3,$4,'SYNTHETIC1.dev.synthetic.ouchi','development') value",[u,s,e,k])).rows[0].value;
  const scope={userID:user,sessionID:session,epochID:epoch,requestID:randomUUID(),keyID:key,appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'development',purchaseEnvironment:'Sandbox',proofSHA256:'b'.repeat(64)};
  const issue=async(c,hash=createHash('sha256').update(restoreAssertionClientData(c)).digest('hex'))=>(await db.query('select public.issue_maintenance_restore_challenge($1,$2) value',[c,hash])).rows[0].value;
  assert.equal(await read(),null);assert.equal(await issue(createRestoreChallenge(scope)),null);
  await assert.rejects(db.exec('update maintenance_private.restore_transfer_policy set enabled=true'),/permission denied/);
  await db.exec('reset role');await db.exec('update maintenance_private.restore_transfer_policy set enabled=true');await db.exec('set role service_role');
  const stored=await read();assert.equal(stored.keyID,key);assert.equal(stored.publicKeyHex,point.toString('hex'));assert.equal(stored.counter,0);
  for(const args of [[randomUUID(),session,epoch,key],[user,randomUUID(),epoch,key],[user,session,randomUUID(),key],[user,session,epoch,Buffer.alloc(32,4).toString('base64')]])assert.equal(await read(...args),null);
  const first=createRestoreChallenge(scope);assert.deepEqual(await issue(first),first);
  assert.deepEqual(await issue(createRestoreChallenge(scope)),first,'retry returns the exact persisted nonce, not a newly generated one');
  assert.equal(await issue(createRestoreChallenge({...scope,proofSHA256:'c'.repeat(64)})),null);
  assert.equal(await issue({...first,issuedAt:String(first.issuedAt)},createHash('sha256').update(restoreAssertionClientData(first)).digest('hex')),null);
  assert.equal(await issue({...first,nonce:null},'e'.repeat(64)),null);
  assert.equal(await issue(createRestoreChallenge({...scope,sessionID:randomUUID()})),null);
  assert.equal(await issue(createRestoreChallenge({...scope,requestID:randomUUID(),purchaseEnvironment:'Production'})),null);
  assert.equal(await issue(createRestoreChallenge({...scope,requestID:randomUUID()}),'d'.repeat(64)),null);
  for(let i=0;i<4;i++)assert.ok(await issue(createRestoreChallenge({...scope,requestID:randomUUID()})));
  assert.equal(await issue(createRestoreChallenge({...scope,requestID:randomUUID()})),null,'sixth active nonce refused');
  await db.query("update maintenance_private.restore_challenges set consumed_at=clock_timestamp(),assertion_sha256=$2,assertion_counter=1 where request_id=$1",[first.requestID,'c'.repeat(64)]);assert.equal(await issue(createRestoreChallenge(scope)),null,'consumed nonce is never reissued');
  const catalog=(await db.query("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated from pg_proc p where p.proname in ('read_maintenance_restore_key','issue_maintenance_restore_challenge')")).rows;
  assert.equal(catalog.length,2);for(const row of catalog){assert.equal(row.prosecdef,false);assert.ok(row.proconfig.some(x=>x.startsWith('search_path=')));assert.equal(row.anon,false);assert.equal(row.authenticated,false);}
  await db.exec('reset role');await db.exec('update maintenance_private.live_scope set enabled=false');await db.exec('set role service_role');assert.equal(await read(),null);assert.equal(await issue(createRestoreChallenge(scope)),null);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(read(),/permission denied/);await assert.rejects(issue(first),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
 // Actual SQL with synthetic enrollment/key/receipt. Does not prove real Auth,
 // cryptographic Apple verification, service HTTP, parallel PostgreSQL or advisors.
});
