import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedHomeHandoffFullSchemaFixture} from './fixtures/home-handoff-full-schema.mjs';
import {owner,other,oe,os,home,product,request as task} from './fixtures/home-handoff-identifiers.mjs';
const submission='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',event='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture(){
 const db=await seedHomeHandoffFullSchemaFixture();await db.exec('reset role');
 for(const name of ['20261014061605_ouchi_account_closure_review.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 await db.exec('update maintenance_private.account_closure_review_policy set enabled=true;set role service_role');
 const receipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[owner,os,oe,submission])).rows[0].receipt;
 await db.exec('reset role;insert into maintenance_private.closure_operator_principals values(session_user,true)');
 await db.query('update public.products set memo=$1 where id=$2',['Synthetic personal detail\nFamily maintenance detail',product]);
 await db.exec('set role ouchi_closure_operator');return {db,receipt};
}
const args=r=>[r.reviewRequestID,owner,oe,'products',product,'memo'];
const snapshot=async(db,r,a=args(r))=>(await db.query('select maintenance_private.read_closure_redaction_field($1,$2,$3,$4,$5,$6) value',a)).rows[0].value;
const redact=async(db,r,digest,replacement='Family maintenance detail',a=args(r),id=event)=>db.query('select maintenance_private.redact_closure_reviewed_field($1,$2,$3,$4,$5,$6,$7,$8,$9) event',[id,...a,digest,replacement]);
const state=async db=>(await db.query("select jsonb_build_object('products',(select jsonb_agg(to_jsonb(t)) from public.products t),'tasks',(select jsonb_agg(to_jsonb(t)) from public.maintenance_tasks t),'history',(select jsonb_agg(to_jsonb(t)) from public.maintenance_history t),'members',(select jsonb_agg(to_jsonb(t)) from public.home_members t)) value")).rows[0].value;
test('reviewed text replacement preserves other family content, records only a receipt and does not complete retirement',async()=>{
 const {db,receipt}=await fixture();try{
  const field=await snapshot(db,receipt);assert.match(field.value,/personal detail/);assert.match(field.digest,/^[a-f0-9]{64}$/);
  await db.exec('reset role');const before=await state(db);await db.exec('set role ouchi_closure_operator');
  assert.equal((await redact(db,receipt,field.digest)).rows[0].event,event);
  await db.exec('reset role');const after=await state(db);before.products[0].memo='Family maintenance detail';assert.deepEqual(after,before);
  const rows=(await db.query('select * from maintenance_private.closure_field_redaction_receipts')).rows;
  assert.equal(rows.length,1);assert.equal(JSON.stringify(rows).includes('personal detail'),false);assert.equal(JSON.stringify(rows).includes('Family maintenance detail'),false);
  assert.equal((await db.query('select state from maintenance_private.account_closure_reviews')).rows[0].state,'review_required');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await db.close();}
});
test('stale content is refused; retry after committed redaction does not overwrite a later family edit',async()=>{
 const {db,receipt}=await fixture();try{
  const old=await snapshot(db,receipt);
  await db.exec('reset role');await db.query('update public.products set memo=$1 where id=$2',['New family text',product]);await db.exec('set role ouchi_closure_operator');
  await assert.rejects(redact(db,receipt,old.digest),/content changed/);
  const fresh=await snapshot(db,receipt);await redact(db,receipt,fresh.digest);
  await db.exec('reset role');await db.query('update public.products set memo=$1 where id=$2',['Later family edit',product]);await db.exec('set role ouchi_closure_operator');
  await redact(db,receipt,fresh.digest);
  assert.equal((await snapshot(db,receipt)).value,'Later family edit');
  await assert.rejects(redact(db,receipt,fresh.digest,'Different payload'),/event conflict/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_field_redaction_receipts')).rows[0].n,1);
 }finally{await db.close();}
});
test('cross-home records, identity fields, unsupported SQL identifiers, unchanged values and constraints fail without mutation',async()=>{
 const {db,receipt}=await fixture();try{
  await db.exec('reset role');await db.query('insert into public.homes(id,owner_id) values($1,$2)',['cccccccc-cccc-4ccc-8ccc-cccccccccccc',other]);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',['dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc','air','Other home']);
  const before=await state(db);await db.exec('set role ouchi_closure_operator');
  for(const scope of [[receipt.reviewRequestID,owner,oe,'products','dddddddd-dddd-4ddd-8ddd-dddddddddddd','name'],[receipt.reviewRequestID,owner,oe,'homes',home,'owner_id'],[receipt.reviewRequestID,owner,oe,'products; drop table homes',product,'memo']]){
   await assert.rejects(snapshot(db,receipt,scope),/Scoped record unavailable|Allowed scoped text field/);
   await assert.rejects(redact(db,receipt,'a'.repeat(64),'replacement',scope),/Scoped record unavailable|Allowed scoped text field/);
  }
  const field=await snapshot(db,receipt);await assert.rejects(redact(db,receipt,field.digest,field.value),/does not change/);
  const nameScope=[receipt.reviewRequestID,owner,oe,'products',product,'name'];const name=await snapshot(db,receipt,nameScope);
  await assert.rejects(redact(db,receipt,name.digest,'',nameScope),/check constraint/);
  await assert.rejects(redact(db,receipt,field.digest,'あ'.repeat(3000)),/Scoped reviewed replacement/);
  await db.exec('reset role');assert.deepEqual(await state(db),before);assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_field_redaction_receipts')).rows[0].n,0);
 }finally{await db.close();}
});
test('revoked operator, cancelled request and changed enrollment cannot read or redact a field; browser and service roles are refused',async()=>{
 for(const mode of ['operator','cancel','epoch','anon','authenticated','service_role']){
  const {db,receipt}=await fixture();try{
   const old=await snapshot(db,receipt);await db.exec('reset role');
   if(mode==='operator')await db.exec('update maintenance_private.closure_operator_principals set enabled=false');
   if(mode==='cancel'){await db.exec('set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[owner,os,oe,submission]);await db.exec('reset role');}
   if(mode==='epoch')await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[owner]);
   await db.exec('set role '+(['anon','authenticated','service_role'].includes(mode)?mode:'ouchi_closure_operator'));
   await assert.rejects(snapshot(db,receipt),/Authorized operator|matching review|matching enrollment|permission denied/);
   await assert.rejects(redact(db,receipt,old.digest),/Authorized operator|matching review|matching enrollment|permission denied/);
  }finally{await db.close();}
 }
});
test('history note redaction to null is transactional, preserves completed maintenance and rolls back its receipt on failure',async()=>{
 const {db,receipt}=await fixture();try{
  await db.exec('reset role');const history=(await db.query('select id from public.maintenance_history where "taskId"=$1',[task])).rows[0].id;
  await db.query('update public.maintenance_history set note=$1 where id=$2',['Synthetic personal note',history]);
  await db.exec('set role ouchi_closure_operator');const scope=[receipt.reviewRequestID,owner,oe,'maintenance_history',history,'note'];const old=await snapshot(db,receipt,scope);
  await db.exec('begin');await redact(db,receipt,old.digest,null,scope);await db.exec('rollback');
  assert.equal((await snapshot(db,receipt,scope)).value,'Synthetic personal note');
  await redact(db,receipt,old.digest,null,scope);assert.equal((await snapshot(db,receipt,scope)).value,null);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.maintenance_history')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_field_redaction_receipts')).rows[0].n,1);
 }finally{await db.close();}
});
test('private operator port requires explicit scope and confirmation, recovers a lost commit without a second mutation',async()=>{
 const {createClosureOperatorReview}=await import('../lib/closure-operator-review.mjs');
 const {db,receipt}=await fixture();try{
  await db.exec('reset role');let loseCommit=false,connections=0,closed=0;
  const port=createClosureOperatorReview({connect:async()=>{
   connections++;return {abort(){},async close(){closed++;},async query(sql,values){
    const result=await db.query(sql,values);
    if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await db.exec('set local role ouchi_closure_operator');
    if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw Error('commit acknowledgement lost');}
    return result;
   }};
  }});
  const signal=new AbortController().signal;
  const scope={reviewRequestID:receipt.reviewRequestID,userID:owner,epochID:oe,relation:'products',recordID:product,field:'memo'};
  const field=await port.readField(scope,signal);
  const operation={...scope,eventID:event,expectedDigest:field.digest,replacement:'Family maintenance detail',confirmation:'REDACT_REVIEWED_PERSONAL_INFORMATION'};
  const before=connections;
  await assert.rejects(port.redactField({...operation,confirmation:'YES'},signal),/Explicit reviewed/);
  await assert.rejects(port.readField({...scope,field:'owner_id'},signal),/Scoped reviewed field/);
  await assert.rejects(port.redactField({...operation,replacement:'あ'.repeat(3000)},signal),/Explicit reviewed/);
  assert.equal(connections,before);
  loseCommit=true;await assert.rejects(port.redactField(operation,signal),/acknowledgement lost/);assert.equal(connections,before+1);
  await db.query('update public.products set memo=$1 where id=$2',['Later family edit',product]);
  assert.deepEqual(await port.redactField(operation,signal),{eventID:event,state:'field_redacted',accountErasureConfirmed:false});
  assert.equal((await port.readField(scope,signal)).value,'Later family edit');
  assert.equal(closed,connections);
 }finally{await db.close();}
});
