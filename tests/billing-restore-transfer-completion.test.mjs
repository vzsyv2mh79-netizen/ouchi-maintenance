import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import ts from 'typescript';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {createRestoreTransferStore}=await load('lib/billing-restore-transfer-store.ts');
const {runRestoreTransfer}=await load('lib/billing-restore-transfer-worker.ts');
const migration=n=>readFileSync('supabase/migrations/'+n+'.sql','utf8');
test('actual ledger SQL: scoped completion, durable retry and rollback of ownership/transaction/job together',async()=>{
 const db=new PGlite();try{
  await db.exec(`set check_function_bodies=false;create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema maintenance_private;
   create table maintenance_private.live_scope(user_id uuid,session_id uuid,epoch_id uuid,enabled boolean default true);
   create function public.read_maintenance_explicit_enrollment(u uuid,s uuid) returns uuid language sql stable security invoker as $$select epoch_id from maintenance_private.live_scope where user_id=u and session_id=s and enabled$$;
   create table maintenance_private.account_access(user_id uuid,enabled boolean);create table maintenance_private.app_epochs(user_id uuid,epoch_id uuid,enabled boolean);
   create table maintenance_private.app_session_epochs(user_id uuid,epoch_id uuid);
   grant usage on schema auth,maintenance_private to service_role;grant select on all tables in schema maintenance_private to service_role;`);
  for(const file of ['20261010142053_ouchi_verified_transaction_ledger','20261011083324_ouchi_retired_transaction_ingestion','20261011142510_ouchi_restore_challenge_ledger','20261012004145_ouchi_restore_transfer_reservation','20261012004834_ouchi_restore_transfer_completion','20261012005754_ouchi_restore_completion_status'])await db.exec(migration(file));
  const user=randomUUID(),session=randomUUID(),epoch=randomUUID(),foreign=randomUUID(),foreignEpoch=randomUUID();
  await db.query('insert into auth.users values($1),($2)',[user,foreign]);
  await db.query('insert into maintenance_private.live_scope(user_id,session_id,epoch_id) values($1,$2,$3)',[user,session,epoch]);
  await db.query('insert into maintenance_private.account_access values($1,true),($2,true)',[user,foreign]);
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true),($3,$4,true)',[user,epoch,foreign,foreignEpoch]);
  await db.query('insert into maintenance_private.app_session_epochs values($1,$2),($3,$4)',[user,epoch,foreign,foreignEpoch]);
  let next=100000;
  const seed=async phase=>{
   const j={id:randomUUID(),lease:randomUUID(),original:String(++next),app:'200001'};
   await db.query(`insert into maintenance_private.restore_transfer_jobs(id,user_id,session_id,app_epoch_id,environment,original_transaction_id,app_transaction_id,previous_account_token,bundle_id,lease_token,authorized_at,phase,mutation_started_at,expected_counter,verified_counter,client_hash,assertion_hash,pair_hash)
    values($1,$2,$3,$4,'Sandbox',$5,$6,$7,'dev.synthetic.ouchi',$8,now()-interval '10 seconds',$9,case when $9='update_started' then now()-interval '5 seconds' else null end,0,1,$10,$10,$10)`,[j.id,user,session,epoch,j.original,j.app,randomUUID(),j.lease,phase,'a'.repeat(64)]);return j;
  };
  const payload=j=>({environment:'Sandbox',originalTransactionId:j.original,transactionId:String(Number(j.original)+1000000),accountToken:epoch,productId:'ouchi.premium.monthly',signedAt:Date.now(),purchasedAt:Date.now()-1000,expiresAt:Date.now()+3600000,isUpgraded:false});
  const complete=(j,p,changes={})=>{
   const a={id:j.id,lease:j.lease,user,session,epoch,app:j.app,bundle:'dev.synthetic.ouchi',payload:p,proof:'b'.repeat(64),...changes};
   return db.query('select public.complete_maintenance_restore_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9) value',Object.values(a)).then(r=>r.rows[0].value);
  };
  const counts=()=>db.query(`select (select count(*)::int from maintenance_private.transaction_ownership where user_id=$1) owners,(select count(*)::int from maintenance_private.verified_transactions where user_id=$1) transactions,(select count(*)::int from maintenance_private.restore_transfer_jobs where user_id=$1 and phase='completed') completed`,[user]).then(r=>r.rows[0]);
  await db.exec('set role service_role');const first=await seed('update_started'),p=payload(first);
  assert.equal(await complete(first,p),false,'operator policy defaults disabled');assert.deepEqual(await counts(),{owners:0,transactions:0,completed:0});
  await db.exec('reset role');await db.exec('update maintenance_private.restore_transfer_policy set enabled=true where id=1');await db.exec('set role service_role');
  for(const changes of [{lease:randomUUID()},{user:foreign},{session:randomUUID()},{epoch:foreignEpoch},{app:'300001'},{bundle:'foreign.app'},{proof:null}])assert.equal(await complete(first,p,changes),false);
  for(const changes of [{environment:'Production'},{accountToken:foreignEpoch},{originalTransactionId:'999999'},{transactionId:'../x'},{productId:'ouchi.tip.small'},{revokedAt:Date.now()},{isUpgraded:true},{signedAt:Date.now()-60000},{signedAt:Date.now()+120000},{expiresAt:Date.now()-1},{purchasedAt:Date.now()+60000},{signedAt:'bad'}])assert.equal(await complete(first,{...p,...changes}),false);
  assert.deepEqual(await counts(),{owners:0,transactions:0,completed:0});
  // Actual latest ledger writer runs within completion. Inject failure only
  // after its ownership and transaction INSERTs to prove transaction rollback.
  await db.exec('reset role');await db.exec(`create function maintenance_private.fail_completion() returns trigger language plpgsql as $$begin if new.phase='completed' then raise exception 'synthetic completion failure';end if;return new;end;$$;create trigger fail_completion before update on maintenance_private.restore_transfer_jobs for each row execute function maintenance_private.fail_completion();`);
  await db.exec('set role service_role');await assert.rejects(complete(first,p),/synthetic completion failure/);assert.deepEqual(await counts(),{owners:0,transactions:0,completed:0});
  assert.equal((await db.query('select phase from maintenance_private.restore_transfer_jobs where id=$1',[first.id])).rows[0].phase,'update_started');
  await db.exec('reset role');await db.exec('drop trigger fail_completion on maintenance_private.restore_transfer_jobs');await db.exec('set role service_role');
  assert.equal(await complete(first,p),true);assert.deepEqual(await counts(),{owners:1,transactions:1,completed:1});
  assert.equal(await complete(first,p),true,'lost response repeats exact durable completion');assert.deepEqual(await counts(),{owners:1,transactions:1,completed:1});
  assert.equal(await complete(first,p,{proof:'c'.repeat(64)}),false,'different receipt requires reconciliation');
  await db.query('select public.apply_maintenance_verified_transaction($1,$2)',[{...p,signedAt:p.signedAt+1,revokedAt:Date.now()},'d'.repeat(64)]);
  assert.equal(await complete(first,p),false,'old successful completion cannot resurrect a refunded current ledger');
  const invalidJob=await seed('authorized');
  await assert.rejects(db.query("update maintenance_private.restore_transfer_jobs set phase='completed' where id=$1",[invalidJob.id]),/check constraint/);
  await assert.rejects(db.query("update maintenance_private.restore_transfer_jobs set phase='update_started' where id=$1",[invalidJob.id]),/check constraint/);
  await db.exec('reset role');
  await assert.rejects(db.query('update maintenance_private.restore_transfer_jobs set previous_account_token=app_epoch_id where id=$1',[invalidJob.id]),/check constraint/);
  await db.exec('set role service_role');
  const readbackOnly=await seed('authorized');assert.equal(await complete(readbackOnly,payload(readbackOnly)),true,'already-correct Apple token needs no mutation');
  const conflict=await seed('update_started');await db.query("insert into maintenance_private.transaction_ownership values('Sandbox',$1,$2,$3)",[conflict.original,foreign,foreignEpoch]);
  assert.equal(await complete(conflict,payload(conflict)),false);assert.equal((await db.query('select user_id from maintenance_private.transaction_ownership where original_transaction_id=$1',[conflict.original])).rows[0].user_id,foreign);
  await db.exec('reset role');await db.query('update maintenance_private.live_scope set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');assert.equal(await complete(first,p),false,'revoked session cannot reuse durable receipt');
  await db.exec('reset role');await db.query('update maintenance_private.live_scope set enabled=true where user_id=$1',[user]);await db.exec('set role service_role');
  const integrated=await seed('authorized');
  const row=(await db.query('select *,floor(extract(epoch from authorized_at)*1000)::bigint authorized_ms from maintenance_private.restore_transfer_jobs where id=$1',[integrated.id])).rows[0];
  const job={id:integrated.id,lease:integrated.lease,userID:user,sessionID:session,epochID:epoch,originalTransactionID:integrated.original,appTransactionID:integrated.app,previousAccountToken:row.previous_account_token,environment:'Sandbox',bundleID:row.bundle_id,authorizedAt:Number(row.authorized_ms),phase:'authorized'};
  const orders={
   maintenance_restore_completion_is_current:['target_request','target_lease','target_user','verified_session','target_epoch','original_tx','store_app_tx','verified_bundle'],
   maintenance_restore_transfer_lease_is_current:['target_request','target_lease','target_user','verified_session','target_epoch','expected_phase'],
   mark_maintenance_restore_transfer_update:['target_request','target_lease','target_user','verified_session','target_epoch'],
   complete_maintenance_restore_transfer:['target_request','target_lease','target_user','verified_session','target_epoch','store_app_tx','verified_bundle','payload','proof_sha256']
  };
  let loseCommitResponse=true;const events=[];
  const store=createRestoreTransferStore(async(name,args)=>{
   assert.ok(Object.hasOwn(orders,name));assert.deepEqual(Object.keys(args).sort(),[...orders[name]].sort());
   const values=orders[name].map(k=>args[k]);
   try{
    const data=(await db.query('select public.'+name+'('+values.map((_,i)=>'$'+(i+1)).join(',')+') value',values)).rows[0].value;
    if(name==='complete_maintenance_restore_transfer'&&data&&loseCommitResponse){loseCommitResponse=false;throw Error('synthetic response lost after actual commit');}
    return {data,error:null};
   }catch(error){return {data:null,error};}
  });
  const tx=payload(integrated);let appleToken=job.previousAccountToken;
  const dependencies={store,readCurrent:async()=>{events.push('read');return {signedTransaction:'synthetic-current-Apple-output',transaction:{...tx,accountToken:appleToken},appTransactionID:job.appTransactionID};},setToken:async()=>{events.push('PUT');appleToken=epoch;}};
  assert.deepEqual(await runRestoreTransfer(job,dependencies),{state:'pending',reason:'unavailable'});
  assert.equal((await db.query('select phase from maintenance_private.restore_transfer_jobs where id=$1',[job.id])).rows[0].phase,'completed','real SQL committed before lost acknowledgement');
  assert.deepEqual(events,['read','PUT','read']);
  assert.deepEqual(await runRestoreTransfer(job,dependencies),{state:'complete'});assert.deepEqual(events,['read','PUT','read'],'restart performs no Apple operation or duplicate ledger write');
  for(const change of [{lease:randomUUID()},{userID:foreign},{sessionID:randomUUID()},{epochID:foreignEpoch},{originalTransactionID:'999999'},{appTransactionID:'999999'},{bundleID:'foreign.app'}])assert.equal(await store.completionIsCurrent({...job,...change}),false);
  await db.query('select public.apply_maintenance_verified_transaction($1,$2)',[{...tx,signedAt:tx.signedAt+1,revokedAt:Date.now()},'f'.repeat(64)]);
  assert.deepEqual(await runRestoreTransfer(job,dependencies),{state:'complete'},'completed process status does not re-grant refunded rights');
  assert.ok((await db.query('select revoked_at from maintenance_private.verified_transactions where transaction_id=$1',[tx.transactionId])).rows[0].revoked_at>0);
  assert.deepEqual(events,['read','PUT','read']);
  await db.exec('reset role');await db.query('update maintenance_private.live_scope set enabled=false where user_id=$1',[user]);await db.exec('set role service_role');
  assert.deepEqual(await runRestoreTransfer(job,dependencies),{state:'pending',reason:'scope'});assert.deepEqual(events,['read','PUT','read']);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.maintenance_restore_completion_is_current($1,$2,$3,$4,$5,$6,$7,$8)',[job.id,job.lease,user,session,epoch,job.originalTransactionID,job.appTransactionID,job.bundleID]),/permission denied/);await db.exec('reset role');}
  await db.exec('reset role');assert.equal((await db.query("select prosecdef from pg_proc where proname='complete_maintenance_restore_transfer'")).rows[0].prosecdef,false);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(complete(first,p),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
 // Synthetic live enrollment/Apple output, actual ledger SQL. No cryptographic
 // Apple verification, external mutation or concurrent real PostgreSQL sessions.
});

test('service store refuses malformed success responses, unavailable persistence and null mutation CAS',async()=>{
 const store=createRestoreTransferStore(async()=>({data:'true',error:null}));
 await assert.rejects(store.completionIsCurrent({}),/Invalid restore persistence result/);
 await assert.rejects(store.leaseIsCurrent({}),/Invalid restore persistence result/);
 const unavailable=createRestoreTransferStore(async()=>({data:true,error:{message:'synthetic'}}));
 await assert.rejects(unavailable.completionIsCurrent({}),/persistence unavailable/);
 const stale=createRestoreTransferStore(async()=>({data:null,error:null}));
 await assert.rejects(stale.markUpdateStarted({}),/not authorized/);
});
