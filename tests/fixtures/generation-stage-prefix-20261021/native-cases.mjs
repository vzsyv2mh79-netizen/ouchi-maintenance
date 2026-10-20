import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {fixtureTOTP} from '../scoped-native-gotrue.mjs';
import {generationFamilyModule,generationHandoffModule} from '../scoped-shared-consent-module.mjs';
import {createGenerationRetentionAdmission} from '../../../lib/generation-retention-admission.mjs';
import {createGenerationFamilyStages,generationCoordinatorScopeDigest,GENERATION_STAGE_RECORD_SQL} from '../../../lib/generation-family-stages.mjs';
import {createDeletionJournal} from '../kakei-completion/lib/shared-deletion-journal.mjs';
import {deletionStages} from '../../../lib/shared-deletion-protocol.mjs';
export async function verifyGenerationStagePrefix({admin,coordinator,issuer,auth,transaction,socket,projectID}){
 await admin.query(readFileSync('tests/fixtures/generation-stage-prefix-20261021/protocol.sql','utf8'));
 const checker=new pg.Client({host:socket,user:'ouchi_retention_checker_backend',database:'postgres'});await checker.connect();
 try{
  async function actor(){const user=randomUUID(),epoch=randomUUID(),email=user+'@fixture.invalid',password=randomBytes(30).toString('base64url');await auth.createFixtureUser(user,email,password);const login=await auth.request('/token?grant_type=password',{email,password});const f=await auth.request('/factors',{factor_type:'totp',friendly_name:'Stage original'},login.access_token),c=await auth.request('/factors/'+f.id+'/challenge',{},login.access_token);const promoted=await auth.request('/factors/'+f.id+'/verify',{challenge_id:c.id,code:fixtureTOTP(f.totp.secret)},login.access_token);const sid=JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).session_id;await admin.query('insert into maintenance_private.account_access values($1,true)',[user]);await admin.query('insert into maintenance_private.app_epochs values($1,$2,true)',[user,epoch]);await admin.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[sid,user,epoch]);return {user,epoch,token:promoted.access_token};}
  const owner=await actor(),receiver=await actor(),home=randomUUID(),product=randomUUID();await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner.user]);await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,receiver.user,'Stage successor']);await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Stage family preserved']);
  await admin.query((await admin.query("select format('create policy stage_root_%s on private.kb_shared_deletion_journal for all to shared_retirement_backend using(user_id=%L::uuid) with check(user_id=%L::uuid)',replace($1::text,'-',''),$1::text,$1::text) sql",[owner.user])).rows[0].sql);
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner.user,leaseToken:randomUUID(),inventoryDigest:'6'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:owner.epoch}]};const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,owner.user,fixed]);
  const policy={policyVersion:'synthetic-stage-not-adopted',confirmedUntil:new Date(Date.now()+300000).toISOString(),receiptLifetimeSeconds:120,evidenceDigest:'a'.repeat(64)},key=randomBytes(32);let admitted=true,late=false;
  const policyReader=Object.assign(async()=>({projectID,authVersion:'v2.197.0',assuranceMode:'highest-current-aal/v1',singleSession:false,totpVerify:true,timeboxSeconds:null,inactivitySeconds:null}),{isCurrent:()=>true});
  const options={scope,generationID:randomUUID(),nativeLease:randomUUID(),homes:[{homeID:home,successorID:receiver.user}],key,projectID,policyReader,getUser:async token=>({data:{user:await auth.request('/user',undefined,token)},error:null}),verifyNoDispatch:async()=>admitted,readApprovedPolicy:async()=>policy,verifyOtherEvidence:async()=>admitted};
  const retention=createGenerationRetentionAdmission(options);await transaction(coordinator,tx=>retention.reserve(scope,tx));await transaction(checker,tx=>retention.issueCertificate(scope,tx));await transaction(coordinator,tx=>retention.prepare(scope,tx));
  const originals=generationFamilyModule.createGenerationFamilyOriginals(options);await transaction(issuer,tx=>originals.issue(owner.token,home,tx));await transaction(issuer,tx=>originals.issue(receiver.token,home,tx));
  const handoff=generationHandoffModule.createGenerationFamilyHandoff({...options,verifyHandoffAdmission:async()=>admitted});
  // Contact/result-key/all-writer admission is deliberately a synthetic server
  // provider here. It is mandatory, bound and rechecked, but this is NOT proof
  // of real paired Kakei contact/outbox/writer coverage or adopted service policy.
  const coordinatorProof={domain:'SharedAccount/coordinator-preparation/v1',scopeDigest:generationCoordinatorScopeDigest(scope),contactDigest:'c'.repeat(64),resultKeyDigest:'d'.repeat(64),writerCoverageDigest:'e'.repeat(64),apps:scope.apps.map(a=>({...a,proofDigest:createHash('sha256').update(JSON.stringify(a)).digest('hex')}))};
  const stageOptions={...options,retention,originals,handoff,verifyCoordinatorPreparation:async()=>admitted?structuredClone(coordinatorProof):null},port=createGenerationFamilyStages(stageOptions);
  const handlers=Object.fromEntries(deletionStages(scope).map(s=>[s,async()=>false]));Object.assign(handlers,port.handlers,{'claim-ready':async(s,tx)=>{const c=await originals.requested(s,tx);if(!c)return false;tx.beforeCommit('stage-original-adopted',()=>originals.adopted(s,c,tx));return true;}});
  const journal=createDeletionJournal({transaction:work=>transaction(coordinator,async tx=>{const result=await work(tx);if(late)admitted=false;return result;})},handlers);
  assert.equal(await journal.claimPrepared(scope),true);
  const savedOriginals=(await admin.query('select * from maintenance_private.generation_family_originals where generation_id=$1 order by home_id,actor_id',[options.generationID])).rows;
  const receipt=stage=>({...fixed,durable:true,stage});
  await assert.rejects(transaction(coordinator,tx=>tx.query('update private.kb_shared_deletion_journal set receipts=$2 where request_id=$1',[scope.requestID,{prepare:receipt('prepare')}])),/Exact ordered generation/,'A syntactically correct prepare receipt without real checkpoint cannot COMMIT');
  await assert.rejects(journal.perform(scope,'handoff-family'),/prerequisite missing/);
  late=true;await assert.rejects(journal.perform(scope,'prepare'),/Current transaction verification/);late=false;admitted=true;
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_stage_checkpoints where generation_id=$1',[options.generationID])).rows[0].n,0,'Late coordinator refusal rolls checkpoint and global receipt back');
  const args=[options.generationID,JSON.stringify(scope),options.nativeLease,JSON.stringify(options.homes)];
  await assert.rejects(transaction(coordinator,async tx=>{assert.equal((await tx.query(GENERATION_STAGE_RECORD_SQL,[...args,'prepare',coordinatorProof])).rows[0].ok,true);}),/Missing exact generation stage receipt|Prepared stage receipt/,'Raw app-only checkpoint without journal publication cannot COMMIT');
  const wrongPort=createGenerationFamilyStages({...stageOptions,key:randomBytes(32)}),wrongJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},{...handlers,...wrongPort.handlers});
  await assert.rejects(wrongJournal.perform(scope,'prepare'),/Historical SAME-domain/,'Wrong independent custody key cannot freeze any usable stage');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_stage_checkpoints where generation_id=$1',[options.generationID])).rows[0].n,0);
  await journal.perform(scope,'prepare');
  assert.equal((await admin.query('select inventory_captured from maintenance_private.account_deletion_requests where id=$1',[scope.apps[0].requestID])).rows[0].inventory_captured,false,'prepare is actual separate inventory, never preset canonical capture');
  await assert.rejects(journal.perform(scope,'verify-family-before'),/prerequisite missing/);
  await assert.rejects(transaction(coordinator,tx=>tx.query('update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1',[scope.requestID,{'verify-family-before':receipt('verify-family-before')}])),/Exact ordered generation/);
  late=true;await assert.rejects(journal.perform(scope,'handoff-family'),/Current transaction verification/);late=false;admitted=true;
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,owner.user,'Late stage refusal rolls lawful handoff/canonical capture/global receipt back together');
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_family_handoffs where generation_id=$1',[options.generationID])).rows[0].n,0);
  await journal.perform(scope,'handoff-family');assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,receiver.user);
  late=true;await assert.rejects(journal.perform(scope,'verify-family-before'),/Current transaction verification/);late=false;admitted=true;
  assert.equal((await admin.query('select count(*)::int n from maintenance_private.generation_stage_custody where generation_id=$1',[options.generationID])).rows[0].n,0,'Late custody refusal rolls custody/checkpoint/third receipt back without undoing prior committed lawful handoff');
  assert.equal((await admin.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,receiver.user);
  await journal.perform(scope,'verify-family-before');
  const root=(await admin.query('select * from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows[0];assert.deepEqual(Object.keys(root.receipts).sort(),['handoff-family','prepare','verify-family-before']);
  const custody=(await admin.query('select * from maintenance_private.generation_stage_custody where generation_id=$1',[options.generationID])).rows;
  const historical=await transaction(coordinator,tx=>port.readHistorical(scope,tx));assert.equal(historical.originalCount,2);
  assert.equal(await transaction(coordinator,tx=>originals.verifyProcessingOriginal(scope,tx)),true);
  await assert.rejects(transaction(coordinator,tx=>tx.query('update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1',[scope.requestID,{unexpected:receipt('prepare')}])),/Exact ordered generation|Exact new generation/,'Any extra receipt fails closed');
  await assert.rejects(journal.perform(scope,'erase:ouchi-maintenance'),/prerequisite missing|unconfirmed/,'Unsupported later erasure cannot advance');
  const logout=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{authorization:'Bearer '+owner.token}});assert.equal(logout.status,204);
  assert.equal(await transaction(coordinator,tx=>originals.verifyProcessingOriginal(scope,tx)),false,'Real logout is never current consent');
  assert.deepEqual(await transaction(coordinator,tx=>port.readHistorical(scope,tx)),historical,'Frozen SAME-domain original/session custody remains a fact after real logout, without Auth reads');
  await assert.rejects(transaction(coordinator,tx=>createGenerationFamilyStages({...stageOptions,key:randomBytes(32)}).readHistorical(scope,tx)),/Historical SAME-domain/);
  assert.deepEqual((await admin.query('select * from maintenance_private.generation_family_originals where generation_id=$1 order by home_id,actor_id',[options.generationID])).rows,savedOriginals);
  assert.deepEqual((await admin.query('select * from maintenance_private.generation_stage_custody where generation_id=$1',[options.generationID])).rows,custody);
  await assert.rejects(coordinator.query('select * from maintenance_private.generation_stage_custody'),/permission denied/);
  const native=(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[scope.apps[0].requestID])).rows[0];assert.equal(native.inventory_captured,true);assert.equal(native.records_erased,false);assert.equal(native.identity_erased,false);
  assert.equal((await admin.query('select name from public.products where id=$1',[product])).rows[0].name,'Stage family preserved');
  await assert.rejects(admin.query('update public.products set name=$2 where id=$1',[product,'No release']),/stop|fenc|closed/i);
  console.log('Generation stage prefix: real journal prepare→handoff-family→verify-family-before with exact private inventory/retention/original checkpoints, lawful handoff then unchanged canonical capture, producer same-COMMIT custody. Bare/extra/skipped receipts and app-only checkpoint COMMIT refuse; late preparation/handoff admission rolls whole stage back. Real global logout refuses current original but metadata-only SAME-domain HMAC historical custody preserves original sessions/expiry; wrong key refuses. Other-app/contact/key/writer provider remains synthetic and mandatory. NO later sessions/erasure/Auth delete/COMPLETE/family release or hosted/policy adoption.');
 }finally{await checker.end();}
}
