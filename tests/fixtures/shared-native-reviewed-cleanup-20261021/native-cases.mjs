import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';

const relations=['account_deletion_requests','account_closure_reviews','closure_coverage_plans','closure_coverage_items','closure_coverage_text_decisions','reviewed_retirements','reviewed_retirement_files','ownerless_home_claims'];
// Synthetic intake/review/file-absence prerequisites only. Original USER
// trigger modes are restored BEFORE execution; actual FK/check constraints stay
// enabled. This never creates real operator/content or physical Storage proof.
async function seedBoundary(admin,work){
 const modes=(await admin.query("select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='maintenance_private' and c.relname=any($1) and not t.tgisinternal",[relations])).rows;
 await admin.query('begin');try{
  for(const table of relations)await admin.query('alter table maintenance_private.'+table+' disable trigger user');
  await work();
  for(const t of modes)await admin.query('alter table maintenance_private.'+t.relname+' '+({O:'enable trigger',A:'enable always trigger',R:'enable replica trigger',D:'disable trigger'}[t.tgenabled])+' '+JSON.stringify(t.tgname));
  await admin.query('commit');
 }catch(e){await admin.query('rollback');throw e;}
}
async function seed(admin,{user,epoch,native,makeJob,home}){
 const review=randomUUID(),plan=randomUUID(),seal=randomUUID(),file=randomUUID(),claim=randomUUID();
 await seedBoundary(admin,async()=>{
  if(makeJob)await admin.query('insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id) values($1,$2,$3)',[native,user,epoch]);
  await admin.query("insert into maintenance_private.account_closure_reviews(review_request_id,user_id,app_epoch_id,submission_id,state) values($1,$2,$3,$4,'retirement_queued')",[review,user,epoch,randomUUID()]);
  await admin.query("insert into maintenance_private.closure_coverage_plans(plan_id,review_request_id,user_id,app_epoch_id,operator_principal,state,item_count,seal_event_id,evidence_digest,bindings,sealed_at) values($1,$2,$3,$4,'ouchi_fixture','sealed',1,$5,repeat('a',64),'[]',clock_timestamp())",[plan,review,user,epoch,seal]);
  await admin.query("insert into maintenance_private.closure_coverage_items(plan_id,kind,item_key,record_id,content_digest) values($1,'personal_file','settled-file',$2,repeat('b',64))",[plan,file]);
  await admin.query("insert into maintenance_private.closure_coverage_text_decisions(event_id,plan_id,item_key,operator_principal,action,evidence_digest) values($1,$2,'settled-file','ouchi_fixture','retain_reviewed',repeat('c',64))",[randomUUID(),plan]);
  await admin.query('insert into maintenance_private.reviewed_retirements(event_id,review_request_id,plan_id,seal_event_id,user_id,app_epoch_id,operator_principal,deletion_request_id,detached_home_count,departed_membership_count) values($1,$2,$3,$4,$5,$6,\'ouchi_fixture\',$1,0,0)',[native,review,plan,seal,user,epoch]);
  await admin.query("insert into maintenance_private.reviewed_retirement_files(request_id,plan_id,item_key,kind,attachment_id,action,uploader_id,uploader_epoch,object_path,size_bytes,mime,sha256,metadata_digest,state,cleanup_fingerprint) values($1,$2,'settled-file','personal_file',$3,'erase_personal_file',$4,$5,$6,1,'application/pdf',repeat('d',64),repeat('e',64),'absence_confirmed',repeat('f',64))",[native,plan,file,user,epoch,user+'/'+epoch+'/'+file+'.pdf']);
  await admin.query('insert into maintenance_private.ownerless_home_claims(request_id,home_id,home_instance,generation,user_id,app_epoch_id) values($1,$2,$3,$4,$5,$6)',[claim,home,randomUUID(),randomUUID(),user,epoch]);
 });
 return {user,epoch,native,review,plan,file,claim,makeJob};
}
async function snapshot(admin,s){
 const specs=[['account_deletion_requests','id',s.native],['account_closure_reviews','review_request_id',s.review],['closure_coverage_plans','plan_id',s.plan],['closure_coverage_items','plan_id',s.plan],['closure_coverage_text_decisions','plan_id',s.plan],['reviewed_retirements','deletion_request_id',s.native],['reviewed_retirement_files','request_id',s.native],['ownerless_home_claims','request_id',s.claim]];
 const out={};for(const [t,col,id] of specs)out[t]=(await admin.query('select to_jsonb(x) row from maintenance_private.'+t+' x where '+col+'=$1',[id])).rows;return out;
}
async function removeFixture(admin,s){
 await seedBoundary(admin,async()=>{
  await admin.query('delete from maintenance_private.ownerless_home_claims where request_id=$1',[s.claim]);
  await admin.query('delete from maintenance_private.reviewed_retirement_files where request_id=$1',[s.native]);
  await admin.query('delete from maintenance_private.reviewed_retirements where deletion_request_id=$1',[s.native]);
  await admin.query('delete from maintenance_private.closure_coverage_plans where plan_id=$1',[s.plan]);
  await admin.query('delete from maintenance_private.account_closure_reviews where review_request_id=$1',[s.review]);
  if(s.makeJob)await admin.query('delete from maintenance_private.account_deletion_requests where id=$1',[s.native]);
 });
}
export async function prepareReviewedNativeCase({admin,coordinator,scope,nativeID,epoch,user,otherUser,home,transaction}){
 await admin.query(readFileSync('tests/fixtures/shared-native-reviewed-cleanup-20261021/cleanup-owner-profile.sql','utf8'));
 const own=await seed(admin,{user,epoch,native:nativeID,makeJob:false,home});
 const foreign=await seed(admin,{user:otherUser,epoch:randomUUID(),native:randomUUID(),makeJob:true,home});
 const wrongEpoch=await seed(admin,{user,epoch:randomUUID(),native:randomUUID(),makeJob:true,home});
 const before=await snapshot(admin,own),kept=await snapshot(admin,foreign),otherGeneration=await snapshot(admin,wrongEpoch);
 assert.ok(Object.values(before).every(rows=>rows.length>0));
 // Caller has only fixed wrapper EXECUTE, never raw eraser/table permissions.
 for(const name of ['erase_reviewed_retirement_metadata','erase_maintenance_deletion_management_claims','erase_maintenance_deletion_closure_metadata'])await assert.rejects(coordinator.query('select public.'+name+'($1,$2,$3,$4)',[nativeID,user,epoch,randomUUID()]),/permission denied/);
 return {
  async rejectForeign(executor){
   await assert.rejects(transaction(coordinator,tx=>executor.erase(scope,tx)),/Foreign or unbound/,'User-wide canonical delete must not touch a different epoch/request');
   assert.deepEqual(await snapshot(admin,own),before);assert.deepEqual(await snapshot(admin,foreign),kept);assert.deepEqual(await snapshot(admin,wrongEpoch),otherGeneration,'Foreign generation stays byte-for-byte intact on refusal');
   await removeFixture(admin,wrongEpoch); // Deliberately synthetic conflicting case only.
   const lease=(await admin.query('select lease_token from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0].lease_token;
   const stage=(tx,phase)=>tx.query('select maintenance_private.execute_shared_native_stage($1,$2,$3) confirmed',[JSON.stringify(scope),lease,phase]);
   const clean=(tx,phase)=>tx.query('select maintenance_private.execute_shared_native_cleanup($1,$2,$3) confirmed',[JSON.stringify(scope),lease,phase]);
   await assert.rejects(transaction(coordinator,tx=>clean(tx,'eraseReviewedMetadata')),/Records must precede/,'Metadata close cannot precede actual record phase');
   await assert.rejects(transaction(coordinator,async tx=>{await stage(tx,'eraseRecords');await clean(tx,'eraseClosureMetadata');}),/Ordered same-transaction/,'Parent erasure cannot skip reviewed/management custody');
   await assert.rejects(transaction(coordinator,async tx=>{await stage(tx,'eraseRecords');await clean(tx,'eraseReviewedMetadata');}),/Same-transaction cleanup and canonical native COMPLETE/,'Raw partial cleanup cannot commit without canonical native seal');
   await assert.rejects(transaction(coordinator,async tx=>{await stage(tx,'eraseRecords');for(const phase of ['eraseReviewedMetadata','eraseManagementClaims','eraseClosureMetadata'])await clean(tx,phase);}),/Same-transaction cleanup and canonical native COMPLETE/,'Removing transient custody also cannot bypass final deferred seal');
   assert.deepEqual(await snapshot(admin,own),before);assert.deepEqual(await snapshot(admin,foreign),kept);

  },
  async verifyRolledBack(){assert.deepEqual(await snapshot(admin,own),before);assert.deepEqual(await snapshot(admin,foreign),kept);},
  async verifyComplete(){
   const after=await snapshot(admin,own);assert.equal(after.account_deletion_requests[0].row.state,'complete');
   for(const [table,rows] of Object.entries(after))if(table!=='account_deletion_requests')assert.equal(rows.length,0,'Canonical scoped metadata erased: '+table);
   assert.deepEqual(await snapshot(admin,foreign),kept,'Different person/epoch/family metadata stays byte-for-byte intact');
   assert.equal((await admin.query('select count(*)::int n from maintenance_private.shared_native_cleanup_scopes')).rows[0].n,0);
   await assert.rejects(coordinator.query('select * from maintenance_private.shared_native_cleanup_scopes'),/permission denied/);
   console.log('Shared reviewed cleanup: nonempty plan/retirement/file/child/management claims erased via exact fixed RPCs before native COMPLETE; different-epoch same-user scope refuses and rolls records/metadata back, late seal refusal rolls all back, another actor/family records preserved. Intake/review and physical file absence are synthetic prerequisites; no production or policy activation.');
  }
 };
}
