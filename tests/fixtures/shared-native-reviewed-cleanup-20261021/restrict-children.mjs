import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
// Synthetic child admission/removal only; actual FK and check constraints stay
// enabled and original USER trigger modes are restored before every executor.
export async function verifyRestrictiveReviewChildren({admin,coordinator,transaction,executor,scope,own,home,verifyRollback}){
 const cases=[
  ['closure_field_redaction_receipts','event_id',"insert into maintenance_private.closure_field_redaction_receipts(event_id,review_request_id,user_id,app_epoch_id,operator_principal,request_digest,relation_name,record_id,field_name) values($1,$2,$3,$4,'ouchi_fixture',repeat('a',64),'maintenance_history',$5,'note')"],
  ['closure_legacy_home_events','event_id',"insert into maintenance_private.closure_legacy_home_events(event_id,review_request_id,user_id,app_epoch_id,home_id,home_instance_id,operator_principal,action,evidence_digest) values($1,$2,$3,$4,$5,$1,'ouchi_fixture','confirmed',repeat('b',64))"],
  ['closure_operator_assessments','event_id',"insert into maintenance_private.closure_operator_assessments(event_id,review_request_id,user_id,app_epoch_id,operator_principal,outcome,evidence_digest) values($1,$2,$3,$4,'ouchi_fixture','assessment_recorded',repeat('c',64))"],
  ['closure_text_snapshots','plan_id',"insert into maintenance_private.closure_text_snapshots(plan_id,review_request_id,user_id,app_epoch_id,operator_principal,state,item_count) values($1,$2,$3,$4,'ouchi_fixture','open',0)"]
 ];
 const synthetic=async(table,work)=>{
  assert.ok(cases.some(c=>c[0]===table));const modes=(await admin.query('select tgname,tgenabled from pg_trigger where tgrelid=$1::regclass and not tgisinternal',['maintenance_private.'+table])).rows;
  await admin.query('begin');try{await admin.query('alter table maintenance_private.'+table+' disable trigger user');await work();
   for(const t of modes){assert.match(t.tgname,/^[a-z0-9_]+$/);await admin.query('alter table maintenance_private.'+table+' '+({O:'enable trigger',A:'enable always trigger',R:'enable replica trigger',D:'disable trigger'}[t.tgenabled])+' '+t.tgname);}await admin.query('commit');
  }catch(e){await admin.query('rollback');throw e;}
 };
 for(const [table,key,sql] of cases){
  const id=randomUUID(),args=[id,own.review,own.user,own.epoch];if(sql.includes('$5'))args.push(home);
  await synthetic(table,()=>admin.query(sql,args));
  const before=(await admin.query('select to_jsonb(x) row from maintenance_private.'+table+' x where '+key+'=$1',[id])).rows;assert.equal(before.length,1);
  await assert.rejects(transaction(coordinator,tx=>executor.erase(scope,tx)),e=>e.code==='23503'&&e.table===table,'Nonempty RESTRICT review child must stop unchanged canonical parent erasure: '+table);
  assert.deepEqual((await admin.query('select to_jsonb(x) row from maintenance_private.'+table+' x where '+key+'=$1',[id])).rows,before,'Refusal must preserve exact child: '+table);
  await verifyRollback();
  await synthetic(table,()=>admin.query('delete from maintenance_private.'+table+' where '+key+'=$1',[id]));
 }
 console.log('Restrictive review child matrix: each nonempty redaction receipt/legacy-home event/operator assessment/text snapshot blocks canonical review-parent DELETE with real23503, rolls native records/metadata phases back and preserves foreign generation/person rows. No child disposition/retention or complete cleanup capability is claimed. Synthetic admission/cleanup only; real execution uses original USER trigger modes and FK constraints.');
}
