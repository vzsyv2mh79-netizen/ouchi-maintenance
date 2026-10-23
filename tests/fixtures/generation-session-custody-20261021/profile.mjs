import {prepareGenerationAfterLogoutCase} from '../generation-after-logout-20261021/native-cases.mjs';
import {verifyGenerationSessionCustody} from './native-cases.mjs';
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
export async function verifyGenerationSessionProfile({admin,coordinator,issuer,auth,transaction,socket,projectID}){
 await admin.query(readFileSync('tests/fixtures/generation-stage-prefix-20261021/protocol.sql','utf8'));
 if(process.env.OUCHI_GENERATION_SESSION_TEST==='true')await admin.query(readFileSync('tests/fixtures/generation-session-custody-20261021/protocol.sql','utf8'));
 if(process.env.OUCHI_GENERATION_AFTER_LOGOUT_TEST==='true')await admin.query(readFileSync('tests/fixtures/generation-after-logout-20261021/protocol.sql','utf8'));
 if(process.env.OUCHI_GENERATION_SUCCESSOR_TEST==='true')await admin.query(readFileSync('tests/fixtures/generation-successor-current-20261021/protocol.sql','utf8'));
 const checker=new pg.Client({host:socket,user:'ouchi_retention_checker_backend',database:'postgres'});await checker.connect();
 try{
  async function actor(){const user=randomUUID(),epoch=randomUUID(),email=user+'@fixture.invalid',password=randomBytes(30).toString('base64url');await auth.createFixtureUser(user,email,password);const login=await auth.request('/token?grant_type=password',{email,password});const f=await auth.request('/factors',{factor_type:'totp',friendly_name:'Stage original'},login.access_token),c=await auth.request('/factors/'+f.id+'/challenge',{},login.access_token);const promoted=await auth.request('/factors/'+f.id+'/verify',{challenge_id:c.id,code:fixtureTOTP(f.totp.secret)},login.access_token);const sid=JSON.parse(Buffer.from(promoted.access_token.split('.')[1],'base64url')).session_id;await admin.query('insert into maintenance_private.account_access values($1,true)',[user]);await admin.query('insert into maintenance_private.app_epochs values($1,$2,true)',[user,epoch]);await admin.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[sid,user,epoch]);return {user,epoch,token:promoted.access_token};}
  const owner=await actor(),receiver=await actor(),home=randomUUID(),product=randomUUID();await admin.query('insert into public.homes(id,owner_id) values($1,$2)',[home,owner.user]);await admin.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,receiver.user,'Stage successor']);await admin.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Stage family preserved']);
  await admin.query((await admin.query("select format('create policy stage_root_%s on private.kb_shared_deletion_journal for all to shared_retirement_backend using(user_id=%L::uuid) with check(user_id=%L::uuid)',replace($1::text,'-',''),$1::text,$1::text) sql",[owner.user])).rows[0].sql);
  const scope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner.user,leaseToken:randomUUID(),inventoryDigest:'6'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:randomUUID(),scopeID:owner.epoch}]};const fixed={...scope};delete fixed.leaseToken;await admin.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'requested',null,null,'{}')",[scope.requestID,owner.user,fixed]);
  const policy={policyVersion:'synthetic-stage-not-adopted',confirmedUntil:new Date(Date.now()+300000).toISOString(),receiptLifetimeSeconds:120,evidenceDigest:'a'.repeat(64)},key=randomBytes(32);let admitted=true;
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
  const journal=createDeletionJournal({transaction:work=>transaction(coordinator,async tx=>{const result=await work(tx);return result;})},handlers);
  assert.equal(await journal.claimPrepared(scope),true);
  // Dedicated prerequisite producer: actual unchanged RPCs, real originals at
  // entry AND COMMIT, same normal journal. This is not a pass claim for the
  // existing more repetitive family-stage JS regression, which remains separate.
  const args=[options.generationID,JSON.stringify(scope),options.nativeLease,JSON.stringify(options.homes)];
  const nativeHandlers={...handlers};for(const wanted of ['prepare','handoff-family','verify-family-before'])nativeHandlers[wanted]=async(v,tx)=>{
   if(await originals.verifyProcessingOriginal(v,tx)!==true||await retention.verifyCurrent(v,tx)!==true)return false;
   tx.beforeCommit('session-prerequisite:'+wanted,async()=>await originals.verifyProcessingOriginal(v,tx)===true&&await retention.verifyCurrent(v,tx)===true);
   if(wanted==='handoff-family'&&(await tx.query('select maintenance_private.execute_generation_family_handoff($1,$2,$3,$4) ok',args)).rows[0].ok!==true)return false;
   return (await tx.query(GENERATION_STAGE_RECORD_SQL,[...args,wanted,coordinatorProof])).rows[0].ok===true;
  };
  const prerequisiteJournal=createDeletionJournal({transaction:work=>transaction(coordinator,work)},nativeHandlers);
  for(const wanted of ['prepare','handoff-family','verify-family-before']){console.log('Session profile prerequisite:',wanted);await prerequisiteJournal.perform(scope,wanted);}

  const sessionCase=await verifyGenerationSessionCustody({admin,coordinator,transaction,scope,options,retention,originals,handoff,port,handlers});
  const afterLogoutCase=process.env.OUCHI_GENERATION_AFTER_LOGOUT_TEST==='true'?await prepareGenerationAfterLogoutCase({admin,coordinator,transaction,scope,options,retention,originals,handoff,port,owner,receiver,auth,socket}):null;
  const logout=await fetch(auth.origin+'/logout?scope=global',{method:'POST',headers:{authorization:'Bearer '+owner.token}});assert.equal(logout.status,204);
  if(sessionCase)await sessionCase.afterLogout();
  if(afterLogoutCase)await afterLogoutCase.afterLogout();
  console.log('Dedicated session profile: positive first-three stage producers only; full existing stage fault suite remains separate and is NOT claimed passing by this profile.');
 }finally{await checker.end();}
}
