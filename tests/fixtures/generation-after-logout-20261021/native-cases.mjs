import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {createGenerationAfterLogoutAuthority} from '../../../lib/generation-after-logout-authority.mjs';
import {createGenerationSessionCustody} from '../../../lib/generation-session-custody.mjs';
import {generationCoordinatorScopeDigest} from '../../../lib/generation-family-stages.mjs';
const stable=x=>Array.isArray(x)?'['+x.map(stable).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}':JSON.stringify(x);
const digest=x=>createHash('sha256').update(stable(x)).digest('hex');
const CORE_SQL="select encode(sha256(convert_to(jsonb_build_object('user',(select to_jsonb(a) from auth.users a where id=$1),'factors',(select coalesce(jsonb_agg(to_jsonb(f) order by id),'[]') from auth.mfa_factors f where user_id=$1))::text,'UTF8')),'hex') digest";
export async function prepareGenerationAfterLogoutCase({admin,coordinator,transaction,scope,options,retention,originals,handoff,port:familyStages,owner,auth,socket}){
 const sessionCustody=createGenerationSessionCustody({...options,retention,originals,handoff,familyStages,verifySessionCoverage:async()=>null});
 const fact=await transaction(coordinator,tx=>sessionCustody.readHistorical(scope,tx));assert.ok(fact);
 const custody=(await admin.query('select proof from maintenance_private.generation_session_custody where generation_id=$1',[options.generationID])).rows[0].proof;
 // Fixture captures original Auth-core evidence BEFORE real logout, not a fresh
 // after-state relabelled as original. The hosted ROOT must own durable custody.
 const authOriginDigest=(await admin.query(CORE_SQL,[scope.userID])).rows[0].digest;
 const claims=JSON.parse(Buffer.from(owner.token.split('.')[1],'base64url'));assert.equal(claims.sub,scope.userID);assert.ok(custody.sessionIDs.includes(claims.session_id));assert.equal((await auth.request('/user',undefined,owner.token)).id,scope.userID);
 const factorID=(await admin.query('select id from auth.mfa_factors where user_id=$1 order by id limit 1',[scope.userID])).rows[0].id;
 const validatedAt=Date.now();assert.ok(claims.exp*1000>validatedAt);
 let allowed=true,outcome='unknown',dispatchedAt=validatedAt;const dispatchID=randomUUID();
 const base={scope,generationID:options.generationID,nativeLease:options.nativeLease,homes:options.homes,sessionCustody,retention};
 const admission=()=>({domain:'SharedAccount/generation-after-logout-admission/v1',scopeDigest:generationCoordinatorScopeDigest(scope),generationID:options.generationID,nativeLease:options.nativeLease,sessionCustodyDigest:fact.proofDigest,dispatchID,ownerSessionDigest:digest(custody.sessionIDs),presentedSessionID:claims.session_id,credentialValidatedAt:validatedAt,credentialExpiresAt:claims.exp*1000,dispatchedAt,outcome,outcomeDigest:digest({dispatchID,outcome,dispatchedAt}),writerCoverageDigest:'a'.repeat(64),authIntegrityDigest:authOriginDigest,apps:scope.apps.map(a=>({...a,proofDigest:'b'.repeat(64)}))});
 const opts={...base,readLogoutAdmission:async()=>allowed?admission():null},port=createGenerationAfterLogoutAuthority(opts);
 outcome='acknowledged';await assert.rejects(transaction(coordinator,tx=>port.read(scope,tx)),/absence\/native frame/,'A claimed ACK with actual live owner session is not logout authority');outcome='unknown';
 const nativeID=scope.apps.find(a=>a.app==='ouchi-maintenance').requestID;
 const snap=async()=>({root:(await admin.query('select * from private.kb_shared_deletion_journal where request_id=$1',[scope.requestID])).rows,native:(await admin.query('select * from maintenance_private.account_deletion_requests where id=$1',[nativeID])).rows,custody:(await admin.query('select * from maintenance_private.generation_session_custody where generation_id=$1',[options.generationID])).rows,originals:(await admin.query('select * from maintenance_private.generation_family_originals where generation_id=$1 order by home_id,actor_id',[options.generationID])).rows,home:(await admin.query('select * from public.homes where id=any($1::uuid[]) order by id',[options.homes.map(h=>h.homeID)])).rows});
 const before=await snap();
 return {afterLogout:async()=>{
  dispatchedAt=Date.now();assert.ok(dispatchedAt<claims.exp*1000);assert.equal((await admin.query('select count(*)::int n from auth.sessions where user_id=$1',[scope.userID])).rows[0].n,0);
  assert.equal(await transaction(coordinator,tx=>originals.verifyProcessingOriginal(scope,tx)),false);
  await assert.rejects(transaction(coordinator,tx=>port.read(scope,tx)),/Verified actual logout/,'Lost logout ACK remains unknown, even with actual absence; no HTTP retry is invented');
  outcome='reconciled-absent';const cap=await transaction(coordinator,tx=>port.read(scope,tx));assert.equal(cap.kind,'generation-after-logout-before-native-authority');assert.equal('presentedSessionID' in cap,false);
  allowed=false;await assert.rejects(transaction(coordinator,tx=>port.read(scope,tx)),/Verified actual logout/);allowed=true;
  await assert.rejects(transaction(coordinator,async tx=>{await port.read(scope,tx);allowed=false;}),/Current transaction verification/);allowed=true;
  assert.ok(await transaction(coordinator,tx=>port.read(scope,tx)),'Same originals/lease retry needs no renewed JWT after factual reconciliation');
  outcome='acknowledged';assert.ok(await transaction(coordinator,tx=>port.read(scope,tx)));
  for(const bad of ['issued','not-dispatched','unknown']){outcome=bad;await assert.rejects(transaction(coordinator,tx=>port.read(scope,tx)),/Verified actual logout/);}outcome='acknowledged';
  const wrongHistory=createGenerationSessionCustody({...options,key:randomBytes(32),retention,originals,handoff,familyStages,verifySessionCoverage:async()=>null});await assert.rejects(transaction(coordinator,tx=>createGenerationAfterLogoutAuthority({...opts,sessionCustody:wrongHistory}).read(scope,tx)),/HMAC/);
  const unexpected=randomUUID();await admin.query("insert into auth.sessions(id,user_id,created_at,updated_at,aal) values($1,$2,now(),now(),'aal1')",[unexpected,scope.userID]);await assert.rejects(transaction(coordinator,tx=>port.read(scope,tx)),/absence\/native frame/);await admin.query('delete from auth.sessions where id=$1',[unexpected]);
  const meta=(await admin.query('select raw_user_meta_data from auth.users where id=$1',[scope.userID])).rows[0].raw_user_meta_data;await admin.query("update auth.users set raw_user_meta_data='{}'::jsonb||jsonb_build_object('fixtureIntegrityDrift',true) where id=$1",[scope.userID]);await assert.rejects(transaction(coordinator,tx=>port.read(scope,tx)),/Verified actual logout/,'Changed Auth core does not inherit the prelogout origin');await admin.query('update auth.users set raw_user_meta_data=$2 where id=$1',[scope.userID,meta]);
  const writer=new pg.Client({host:socket,user:'ouchi_fixture',database:'postgres'});await writer.connect();try{await transaction(coordinator,async tx=>{assert.ok(await port.read(scope,tx));await writer.query('begin');await writer.query("set local lock_timeout='150ms'");await assert.rejects(writer.query("insert into auth.sessions(id,user_id,created_at,updated_at,aal) values($1,$2,now(),now(),'aal1')",[randomUUID(),scope.userID]),/lock timeout/,'Auth-parent lock plus immediate FK blocks actual session recreation until owning COMMIT');await writer.query('rollback');await writer.query('begin');await writer.query("set local lock_timeout='150ms'");await assert.rejects(writer.query('update auth.mfa_factors set status=status where id=$1',[factorID]),/lock timeout/,'Existing factor UPDATE cannot race the final Auth-core check or owning COMMIT');await writer.query('rollback');assert.equal(await port.verify(scope,tx),true);});}finally{await writer.end();}
  await assert.rejects(coordinator.query('select * from auth.users'),/permission denied/);await assert.rejects(coordinator.query('select * from auth.sessions'),/permission denied/);
  assert.deepEqual(await snap(),before,'After-logout authority reads do not mutate native flags, root receipts, family data or original custody');
  console.log('Generation after-global-logout BEFORE-NATIVE boundary: real GoTrue logout + actual no-session/Auth-parent FK lock + SAME signed fourth/new-domain original custody + unchanged native/family/retention + mandatory root dispatch/auth-origin/writer admission. Claimed ACK while live, unknown/issued/no-dispatch, new session, Auth-core drift, wrong HMAC and late gates refuse. Explicit factual reconciliation or actual acknowledged outcome admits only transaction-bound digest authority; no HTTP retry/JWT persistence/impersonation/Auth DELETE/erase/COMPLETE. Root outcome ledger/ALL-writer/Auth-origin provider remains synthetic in this one-app fixture; cold restart/manual-delay JWT handoff not proved.');
 }};
}
