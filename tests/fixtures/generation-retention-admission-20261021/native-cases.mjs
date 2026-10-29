import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createGenerationRetentionAdmission,RETENTION_RECORD_SQL} from '../../../lib/generation-retention-admission.mjs';
import {createDeletionJournal} from '../kakei-completion/lib/shared-deletion-journal.mjs';
import {generationFamilyModule} from '../scoped-shared-consent-module.mjs';
import {fixtureTOTP} from '../scoped-native-gotrue.mjs';
import {verifyGenerationFamilyHandoff,prepareGenerationHandoffFixture} from '../generation-family-handoff-20261021/native-cases.mjs';

/** Synthetic finite policy is test evidence only, never an adopted service TTL. */
export async function verifyGenerationRetentionAdmission({admin,coordinator,issuer,auth,transaction,socket,projectID}){
 const guarded=['public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)','maintenance_private.requested_native_children_are_empty(uuid)'];
 const bodies=await admin.query('select oid::regprocedure::text f,prosrc from pg_proc where oid=any($1::regprocedure[]) order by 1',[guarded]);
 await admin.query('create role ouchi_retention_checker_backend login nosuperuser nobypassrls nocreatedb nocreaterole noreplication');
 await admin.query(readFileSync('tests/fixtures/generation-retention-admission-20261021/protocol.sql','utf8'));
 assert.deepEqual((await admin.query('select oid::regprocedure::text f,prosrc from pg_proc where oid=any($1::regprocedure[]) order by 1',[guarded])).rows,bodies.rows,'Canonical capture and original strict child-empty helper remain byte-identical');
 const checker=new pg.Client({host:socket,user:'ouchi_retention_checker_backend',database:'postgres'});await checker.connect();
 try{
  async function actor(){const user=randomUUID(),epoch=randomUUID(),email=user+'@fixture.invalid',password=randomBytes(30).toString('base64url');await auth.createFixtureUser(user,email,password);const login=await auth.request('/token?grant_type=password',{email,password});const f=await auth.request('/factors',{factor_type:'totp',friendly_name:'Retention original'},login.access_token),c=await auth.request('/factors/'+f.id+'/challenge',{},login.access_token);const promoted=await auth.request('/factors/'+f.id+'/verify',{challenge_id:c.id,code:fixtureTOTP(f.totp.secret)},login.access_token);const sid=JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).session_id;await admin.query('insert into maintenance_private.account_access values($1,true)',[user]);await admin.query('insert into maintenance_private.app_epochs values($1,$2,true)',[user,epoch]);await admin.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[sid,user,epoch]);return {user,epoch,token:promoted.access_token};}
  const owner=await actor(),receiver=await actor(),receiver2=await actor(),home=randomUUID(),home2=randomUUID(),product=randomUUID();
  for(const [h,r] of [[home,receiver],[home2,receiver2]]){await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[h,owner.user]);await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[h,r.user,'Retention successor']);}
  await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Retention preserved']);
  await admin.query((await admin.query("select format('create policy retention_root_%s on private.kb_shared_deletion_journal for all to shared_retirement_backend using(user_id=%L::uuid) with check(user_id=%L::uuid)',replace($1::text,'-',''),$1::text,$1::text) sql",[owner.user])).rows[0].sql);
  const extraCase=await prepareGenerationHandoffFixture({admin,owner,receiver,receiver2,home,home2,product});
  let approved=true,evidence=true,covered=true;
  const key=randomBytes(32),policy={policyVersion:'synthetic-local-retention-not-adopted',confirmedUntil:new Date(Date.now()+300000).toISOString(),receiptLifetimeSeconds:120,evidenceDigest:'a'.repeat(64)};
  const policyReader=Object.assign(async()=>({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>true});
  const base=x=>({...x,key,projectID,policyReader,getUser:async(token,signal)=>{signal.throwIfAborted();return {data:{user:await auth.request('/user',undefined,token)},error:null};},verifyNoDispatch:async()=>covered,readApprovedPolicy:async()=>approved?{...policy}:null,verifyOtherEvidence:async()=>evidence});
  async function make(){const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner.user,leaseToken:randomUUID(),inventoryDigest:'5'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:owner.epoch}]};const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,owner.user,fixed]);const options=base({scope,generationID:randomUUID(),nativeLease:randomUUID(),homes:[{homeID:home,successorID:receiver.user},{homeID:home2,successorID:receiver2.user}]});return {options,port:createGenerationRetentionAdmission(options)};}
  const first=await make(),{options:o,port}=first,nativeID=o.scope.apps[0].requestID,args=[o.generationID,JSON.stringify(o.scope),o.nativeLease,JSON.stringify([...o.homes].sort((a,b)=>a.homeID.localeCompare(b.homeID)))];
  await transaction(coordinator,tx=>port.reserve(o.scope,tx));
  await assert.rejects(transaction(coordinator,tx=>port.issueCertificate(o.scope,tx)),/Actual reserved target|permission denied/,'Runtime cannot issue a checker certificate');
  approved=false;await assert.rejects(transaction(checker,tx=>port.issueCertificate(o.scope,tx)),/retention policy unavailable/);approved=true;
  evidence=false;await assert.rejects(transaction(checker,tx=>port.issueCertificate(o.scope,tx)),/All retained evidence/);evidence=true;
  await assert.rejects(transaction(coordinator,tx=>port.prepare(o.scope,tx)),/certificate unavailable/,'No certificate means no disabled flags/native');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0].n,0);
  await transaction(checker,tx=>port.issueCertificate(o.scope,tx));
  const certificate=(await admin.query('select * from maintenance_private.generation_retention_certificates where generation_id=$1',[o.generationID])).rows;
  await transaction(checker,tx=>port.issueCertificate(o.scope,tx));
  assert.deepEqual((await admin.query('select * from maintenance_private.generation_retention_certificates where generation_id=$1',[o.generationID])).rows,certificate,'Checker retry never renews timestamp/signature/PID/XID');
  await assert.rejects(coordinator.query(RETENTION_RECORD_SQL,[...args,certificate[0].payload,certificate[0].signature]),/permission denied/);
  const wrongKey=createGenerationRetentionAdmission({...o,key:randomBytes(32)});await assert.rejects(transaction(coordinator,tx=>wrongKey.prepare(o.scope,tx)),/Exact signed generation/);
  await assert.rejects(transaction(coordinator,async tx=>{await port.prepare(o.scope,tx);evidence=false;}),/Current transaction verification/);evidence=true;
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0].n,0,'Late independent evidence failure rolls native preparation and admitted retention back together');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_retention_admissions where generation_id=$1',[o.generationID])).rows[0].n,0);
  await transaction(coordinator,tx=>port.prepare(o.scope,tx));
  const nativeBefore=(await admin.query('select after_state from maintenance_private.family_native_preparations where generation_id=$1',[o.generationID])).rows;
  const row=(await admin.query('select * from maintenance_private.deletion_retention_checks where request_id=$1',[nativeID])).rows[0];assert.equal(row.policy_version,policy.policyVersion);assert.equal(row.receipt_lifetime_seconds,120);
  assert.equal(await transaction(coordinator,tx=>port.verifyCurrent(o.scope,tx)),true);
  assert.equal((await admin.query('select maintenance_private.requested_native_children_are_empty($1) ok',[nativeID])).rows[0].ok,false,'Original child-empty helper still rejects any retention row');
  await assert.rejects(coordinator.query('select * from maintenance_private.generation_retention_certificates'),/permission denied/);
  await assert.rejects(coordinator.query('select * from maintenance_private.deletion_retention_checks'),/permission denied/);
  await assert.rejects(admin.query('update maintenance_private.generation_retention_certificates set signature=repeat(\'b\',64) where generation_id=$1',[o.generationID]),/Immutable/);
  assert.equal((await transaction(checker,tx=>tx.query('select maintenance_private.revoke_generation_retention_certificate($1,$2,$3,$4,$5) ok',[...args,'b'.repeat(64)]))).rows[0].ok,true);
  await assert.rejects(transaction(coordinator,tx=>port.verifyCurrent(o.scope,tx)),/certificate unavailable/,'Revoked policy cannot start work');
  const cancel=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'after-cancel':(s,tx)=>port.cancelRequested(s,tx)});
  assert.equal(await cancel.cancel(o.scope),true);
  // The real cancellation above must succeed despite a revoked check, restore
  // only its unused native/flags, and retain immutable checker/admission audit.
  assert.equal((await admin.query('select status from private.kb_shared_deletion_journal where request_id=$1',[o.scope.requestID])).rows[0].status,'cancelled');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.deletion_retention_checks where request_id=$1',[nativeID])).rows[0].n,0);
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows[0].n,0);
  assert.equal((await admin.query('select removed_row from maintenance_private.generation_retention_cancellations where generation_id=$1',[o.generationID])).rows.length,1);
  assert.deepEqual((await admin.query('select after_state from maintenance_private.family_native_preparations where generation_id=$1',[o.generationID])).rows,nativeBefore,'Formal retention never rewrites immutable preparation original');
  assert.deepEqual((await admin.query('select * from maintenance_private.generation_retention_certificates where generation_id=$1',[o.generationID])).rows,certificate);
  assert.equal(await cancel.cancel(o.scope),false,'Journal already-cancelled response keeps existing semantics');
  assert.equal(await transaction(coordinator,tx=>port.cancelRequested(o.scope,tx)),true,'Exact native cancelled replay is idempotent');
  assert.equal((await admin.query('select enabled from maintenance_private.account_access where user_id=$1',[owner.user])).rows[0].enabled,true);
  const next=await make();await transaction(coordinator,tx=>next.port.reserve(next.options.scope,tx));await transaction(checker,tx=>next.port.issueCertificate(next.options.scope,tx));await transaction(coordinator,tx=>next.port.prepare(next.options.scope,tx));
  const original=generationFamilyModule.createGenerationFamilyOriginals(next.options);
  for(const [token,h] of [[owner.token,home],[receiver.token,home],[owner.token,home2],[receiver2.token,home2]])await transaction(issuer,tx=>original.issue(token,h,tx));
  const journal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{'claim-ready':async(s,tx)=>{const c=await original.requested(s,tx);if(!c)return false;tx.beforeCommit('retention-original-adopted',()=>original.adopted(s,c,tx));return true;}});
  assert.equal(await journal.claimPrepared(next.options.scope),true,'Formal exact retention row coexists with real TOTP claim');
  await verifyGenerationFamilyHandoff({originalOptions:next.options,scope:next.options.scope,generationID:next.options.generationID,owner,receiver,receiver2,home,home2,product,...extraCase,admin,coordinator,transaction});
  assert.equal(await transaction(coordinator,tx=>next.port.verifyCurrent(next.options.scope,tx)),true,'Formal retention stays exact after lawful family handoff and unchanged canonical capture');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_retention_contexts')).rows[0].n,0);
  console.log('Generation retention: dedicated synthetic checker + independent finite policy/ALL evidence + immutable signed original, exact native check admission, no old child-empty weakening or preparation rewrite; unapproved/missing evidence/wrong key/late evidence denied with whole preparation rollback. Revoked unused check cancels exactly and preserves audit, same-home reapply obtains new certificate; real TOTP claim→lawful handoff→unchanged canonical capture with admitted check passes. NO adopted retention/hosted role/grant/real user deletion/global stage receipts.');
 }finally{await checker.end();}
}
