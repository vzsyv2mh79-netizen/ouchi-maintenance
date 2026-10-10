import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('durable recovery SQL leases, resumes, rejects stale completion and stops closed enrollments',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
 for(const f of ['20261010141353_ouchi_billing_identity.sql','20261010142053_ouchi_verified_transaction_ledger.sql','20261010230223_ouchi_reconciliation_seed.sql','20261010231045_ouchi_reconciliation_jobs.sql'])await db.exec(readFileSync('supabase/migrations/'+f,'utf8'));
 const user='11111111-1111-4111-8111-111111111111',session='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1)',[user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.exec('set role service_role');
 const token=(await db.query('select public.current_maintenance_purchase_account($1,$2) as value',[user,session])).rows[0].value;
 const rpc=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const enqueue=()=>rpc('select public.enqueue_maintenance_reconciliation($1,$2,$3,$4) as value',[user,session,token,'Sandbox']);
 const claim=()=>rpc("select public.claim_maintenance_reconciliation('Sandbox') as value");
 const finish=(job,complete,revision=null,error=null)=>rpc('select public.finish_maintenance_reconciliation($1,$2,$3,$4,$5) as value',[job.id,job.leaseToken,complete,revision,error]);
 assert.equal(await enqueue(),null);
 const event={environment:'Sandbox',transactionId:'1',originalTransactionId:'1',accountToken:token,productId:'ouchi.premium.monthly',signedAt:200,purchasedAt:100,expiresAt:300};
 await db.query('select public.apply_maintenance_verified_transaction($1,$2)',[JSON.stringify(event),'a'.repeat(64)]);
 const id=await enqueue();assert.equal(await enqueue(),id);const first=await claim();assert.equal(first.id,id);assert.equal(await claim(),null);assert.equal(await enqueue(),id);
 assert.equal(await finish({...first,leaseToken:'44444444-4444-4444-8444-444444444444'},true),false);
 assert.equal(await finish(first,false,'cursor'),true);assert.equal(await finish(first,true),false);
 await db.query("update maintenance_private.reconciliation_jobs set available_at=now()-interval '1 second' where id=$1",[id]);
 const resumed=await claim();assert.equal(resumed.revision,'cursor');assert.equal(resumed.attempt,1);assert.notEqual(resumed.leaseToken,first.leaseToken);
 assert.equal(await finish(resumed,false,null,'read_unavailable'),true);
 const queued=(await db.query('select revision,state,attempts,available_at>now() as delayed from maintenance_private.reconciliation_jobs where id=$1',[id])).rows[0];assert.equal(queued.revision,'cursor');assert.equal(queued.delayed,true);assert.equal(await claim(),null);
 await db.query("update maintenance_private.reconciliation_jobs set available_at=now()-interval '1 second' where id=$1",[id]);const recovered=await claim();
 await db.query("update maintenance_private.reconciliation_jobs set lease_until=now()-interval '1 second' where id=$1",[id]);assert.equal(await finish(recovered,true),false);
 const replacement=await claim();assert.notEqual(replacement.leaseToken,recovered.leaseToken);assert.equal(await finish(replacement,true),true);
 assert.equal(await enqueue(),id);
 for(let attempt=1;attempt<=8;attempt++){const job=await claim();assert.equal(job.attempt,attempt);assert.equal(await finish(job,false,null,'read_unavailable'),true);await db.query("update maintenance_private.reconciliation_jobs set available_at=now()-interval '1 second' where id=$1",[id]);}
 assert.equal(await claim(),null);assert.equal((await db.query('select state from maintenance_private.reconciliation_jobs where id=$1',[id])).rows[0].state,'failed');
 assert.equal(await enqueue(),id);const closing=await claim();await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[user]);assert.equal(await finish(closing,true),false);assert.equal(await claim(),null);await assert.rejects(()=>enqueue());
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>claim());await assert.rejects(()=>finish(closing,true));await assert.rejects(()=>enqueue());
 }finally{await db.close();}
});
