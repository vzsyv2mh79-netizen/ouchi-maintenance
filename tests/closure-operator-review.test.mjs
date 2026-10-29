import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,recipient,oe,os} from './fixtures/home-handoff-identifiers.mjs';
const migration='supabase/migrations/20261016114527_ouchi_closure_operator_review.sql';
const submission='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const event='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();
 await db.exec('reset role');
 await db.exec(readFileSync('supabase/migrations/20261014061605_ouchi_account_closure_review.sql','utf8'));
 await db.exec(readFileSync(migration,'utf8'));
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const {rows:[{receipt}]}=await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[owner,os,oe,submission]);
 await db.exec('reset role');
 return {db,receipt};
}
const record=(db,receipt,overrides={})=>db.query('select maintenance_private.record_closure_operator_assessment($1,$2,$3,$4,$5,$6) event',Object.values({event,review:receipt.reviewRequestID,user:owner,epoch:oe,outcome:'assessment_recorded',digest:'a'.repeat(64),...overrides}));
async function enable(db){await db.exec('insert into maintenance_private.closure_operator_principals(principal,enabled) values(session_user,true);set role ouchi_closure_operator');}
async function unchanged(db){return (await db.query("select jsonb_build_object('homes',(select jsonb_agg(to_jsonb(t)) from public.homes t),'products',(select jsonb_agg(to_jsonb(t)) from public.products t),'members',(select jsonb_agg(to_jsonb(t)) from public.home_members t),'jobs',(select jsonb_agg(to_jsonb(t)) from maintenance_private.account_deletion_requests t)) value")).rows[0].value;}
test('operator assessment is scoped, idempotent, immutable and never means erasure or creates a deletion job',async()=>{
 const {db,receipt}=await fixture();try{
  const before=await unchanged(db);await enable(db);
  const queue=(await db.query('select * from maintenance_private.closure_operator_queue()')).rows;
  assert.equal(queue.length,1);assert.equal(queue[0].review_request_id,receipt.reviewRequestID);
  assert.deepEqual(Object.keys(queue[0]).sort(),['app_epoch_id','latest_event_id','latest_outcome','latest_recorded_at','requested_at','review_request_id','user_id']);
  assert.equal((await db.query('select * from maintenance_private.closure_operator_queue($1)',[receipt.reviewRequestID])).rows.length,0);
  assert.equal((await record(db,receipt)).rows[0].event,event);await record(db,receipt);
  await assert.rejects(record(db,receipt,{digest:'b'.repeat(64)}),/event conflict/);
  await assert.rejects(record(db,receipt,{outcome:'complete'}),/Scoped assessment/);
  await assert.rejects(db.exec('delete from maintenance_private.closure_operator_assessments'),/permission denied/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_operator_assessments')).rows[0].n,1);
  assert.deepEqual(await unchanged(db),before);
  assert.equal((await db.query('select state from maintenance_private.account_closure_reviews')).rows[0].state,'review_required');
  await assert.rejects(db.query('delete from maintenance_private.account_closure_reviews where review_request_id=$1',[receipt.reviewRequestID]),/foreign key constraint/);
 }finally{await db.close();}
});
test('ordinary users and service transport cannot become an operator; disabled operator connections fail closed',async()=>{
 const {db,receipt}=await fixture();try{
  for(const role of ['anon','authenticated','service_role','ouchi_closure_operator']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(record(db,receipt),/permission denied|Authorized operator/);
   await assert.rejects(db.query('select * from maintenance_private.closure_operator_queue()'),/permission denied|Authorized operator/);
   await assert.rejects(db.query('select * from maintenance_private.closure_operator_assessments'),/permission denied/);
   await assert.rejects(db.query('update maintenance_private.closure_operator_principals set enabled=true'),/permission denied/);
  }
  await db.exec('reset role');await enable(db);await db.exec('reset role;update maintenance_private.closure_operator_principals set enabled=false;set role ouchi_closure_operator');
  await assert.rejects(record(db,receipt),/Authorized operator/);
 }finally{await db.close();}
});
test('changed registration, wrong family member, cancellation and independent deletion job reject assessment',async()=>{
 for(const mode of ['scope','epoch','cancel','job']){
  const {db,receipt}=await fixture();try{
   await enable(db);
   if(mode==='scope')await assert.rejects(record(db,receipt,{user:recipient}),/matching review/);
   else {
    await db.exec('reset role');
    if(mode==='epoch')await db.query('update maintenance_private.app_epochs set epoch_id=$1 where user_id=$2',['cccccccc-cccc-4ccc-8ccc-cccccccccccc',owner]);
    if(mode==='cancel'){await db.exec('set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[owner,os,oe,submission]);await db.exec('reset role');}
    if(mode==='job')await db.query('insert into maintenance_private.account_deletion_requests(user_id,app_epoch_id) values($1,$2)',[owner,oe]);
    await db.exec('set role ouchi_closure_operator');
    await assert.rejects(record(db,receipt),/matching review|matching enrollment|must be reconciled/);
    assert.equal((await db.query('select * from maintenance_private.closure_operator_queue()')).rows.length,0);
   }
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_operator_assessments')).rows[0].n,0);
  }finally{await db.close();}
 }
});
test('outstanding review blocks the existing worker before any destructive stage, including after an assessment',async()=>{
 const {db,receipt}=await fixture();try{
  await enable(db);await record(db,receipt);await db.exec('reset role');
  const request='dddddddd-dddd-4ddd-8ddd-dddddddddddd',lease='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '10 minutes')",[request,owner,oe,lease]);
  const before=await unchanged(db);
  const ts=(await import('typescript')).default;
  const source=ts.transpileModule(readFileSync('lib/account-deletion-worker.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const {runAccountDeletion}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const calls=[],scope={requestID:request,userID:owner,epochID:oe,leaseToken:lease};
  const stages=['revokeAndCaptureInventory','eraseDeviceRegistrations','eraseAttachments','eraseRecords','finalizeIdentityAndRetention','markComplete'];
  await db.exec('set role service_role');
  const deps={leaseCurrent:async fixed=>(await db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) value',[fixed.requestID,fixed.userID,fixed.epochID,fixed.leaseToken])).rows[0].value};
  for(const stage of stages)deps[stage]=async()=>{calls.push(stage);return true;};
  assert.deepEqual(await runAccountDeletion(scope,deps),{state:'pending'});assert.deepEqual(calls,[]);
  await db.exec('reset role');assert.deepEqual(await unchanged(db),before);
 }finally{await db.close();}
});
test('private port recovers a lost commit with the same immutable event and never automatically retries',async()=>{
 const {createClosureOperatorReview}=await import('../lib/closure-operator-review.mjs');
 const {db,receipt}=await fixture();try{
  await enable(db);await db.exec('reset role');let lost=true,connections=0,closed=0;
  const port=createClosureOperatorReview({connect:async()=>{
   connections++;
   return {abort(){},async close(){closed++;},async query(sql,args){
    const result=await db.query(sql,args);
    if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');
    if(sql==='COMMIT'&&lost){lost=false;throw Error('commit acknowledgement lost');}
    return result;
   }};
  }});
  const signal=new AbortController().signal;
  const input={eventID:event,reviewRequestID:receipt.reviewRequestID,userID:owner,epochID:oe,outcome:'needs_review',evidenceDigest:'a'.repeat(64)};
  await assert.rejects(port.record(input,signal),/acknowledgement lost/);assert.equal(connections,1);assert.equal(closed,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_operator_assessments')).rows[0].n,1);
  assert.deepEqual(await port.record(input,signal),{eventID:event,state:'assessment_recorded',erasureConfirmed:false});
  const queue=await port.queue(null,signal);assert.equal(queue.length,1);assert.equal(queue[0].latest_outcome,'needs_review');assert.equal(queue[0].latest_event_id,event);
  await port.record({...input,eventID:'ffffffff-ffff-4fff-8fff-ffffffffffff',outcome:'revoked'},signal);
  assert.equal((await port.queue(null,signal))[0].latest_outcome,'revoked');
  await assert.rejects(port.record({...input,operator:true},signal),/Scoped operator/);
  const stop=new AbortController();stop.abort();const before=connections;
  await assert.rejects(port.record(input,stop.signal));assert.equal(connections,before);assert.equal(closed,connections);
 }finally{await db.close();}
});
