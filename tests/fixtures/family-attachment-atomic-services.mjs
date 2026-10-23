import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createFamilyAttachmentInventoryConsent} from '../../lib/family-attachment-inventory-consent.mjs';
import {createFamilyAttachmentJournal} from '../../lib/family-attachment-journal.mjs';
import {createFamilyAttachmentStatus} from '../../lib/family-attachment-status.mjs';
import {createFamilyAttachmentActivation} from '../../lib/family-attachment-activation.mjs';
import {prepareActualKakeiFamily} from './kakei-completion/actual-family.mjs';
import {createOtherAppFamilyVerifier} from '../../lib/other-app-family-verifier.mjs';
import {createSharedFamilyStageStore} from '../../lib/shared-family-stage-store.mjs';
import {sharedFamilyCoverageDigest} from '../../lib/shared-family-handoff-stage.mjs';
import {createFamilyAttachmentCompletion} from '../../lib/family-attachment-completion.mjs';
import {createFamilyAttachmentStoragePorts} from '../../lib/family-attachment-storage.mjs';
import {handoffFamilyAttachments,normalizeFamilyAttachmentPlan} from '../../lib/family-attachment-handoff.mjs';
import {createHouseholdHandoffPort,snapshotDigest} from './handoff-controller-compatibility/handoff-port.mjs';
import {createHandoffConsentIssuer,handoffPlanDigest,createCommittedHouseholdConsentVerifier} from './handoff-controller-compatibility/handoff-consent.mjs';
import {syntheticTOTP} from './home-handoff-mfa.mjs';
import {runWithTransactionCommitChecks} from '../../lib/transaction-commit-checks.mjs';
import {verifyDisposableClosureReviewHTTP} from './closure-review-http.mjs';
import {createHomeHandoffAuthVersionReader} from '../../lib/home-handoff-auth-version.mjs';
import {createStrictHomeHandoffPolicyReader} from '../../lib/home-handoff-policy.mjs';
import {createAccountClosureReviewReauthentication,CLOSURE_REAUTHENTICATION_STATE_SQL} from '../../lib/account-closure-review-reauthentication.mjs';
import {verifyDisposableReauthenticationResponseLoss} from './closure-reauth-response-loss.mjs';
import {disposableMarkedPasswordProducer,verifyDisposableMarkedPasswordProducer} from './closure-reauth-producer-services.mjs';
import {verifyDisposableClosureReauthLifecycle} from './closure-reauth-lifecycle-services.mjs';
import {verifyDisposableClosureReauthRaces} from './closure-reauth-races.mjs';
import {createDedicatedPostgresConnection} from '../../lib/dedicated-postgres-connection.mjs';
import {verifyDisposableClosureReviewRuntime} from './closure-review-runtime-services.mjs';
import {verifyDisposableSharedClosureMetadata} from './shared-maintenance-closure-services.mjs';
import {verifyDisposableSharedMaintenanceComposition} from './shared-maintenance-composition-services.mjs';

/** Actual disposable PostgreSQL, GoTrue accounts and private Storage bytes.
 * Family-snapshot consents use actual getUser identities and a synthetic signing
 * key. Both transfer participants authenticate with actual GoTrue TOTP before
 * complete-inventory consent. The pinned issuer verifies their signed TOTP AMR
 * timestamps and the worker verifies the same AAL2/factor state. Its scratch
 * account exercises actual session/factor/enrollment contention and rollback.
 * Issuer and worker use the prepared current-session/factor/enrollment pins;
 * project policy remains explicitly injected; current production policy is open.
 * Both-app v2 proofs bind exact factor/session state and recheck before COMMIT.
 * No shipping
 * route, new production grant or whole-account completion proof. Source cleanup
 * is exercised only against synthetic objects in the disposable test instance;
 * durable family completion does not prove whole-account retirement.
 * Runs last: its global private review fences must not change preceding cases.
 */
export async function verifyDisposableFamilyAttachmentAtomic({account,admin,origin,service,options,bytes,createAttachmentFetch,readAttachmentResponse,createHomeHandoffInventoryIdentityVerifier,createHomeHandoffInventoryActorVerifier,sessionAfterAuthVerification,createAccountClosureReviewTransactionPort,createAccountClosureReviewServer,createAccountClosureReviewPrivateTransactions,createClosureReauthenticationMaintenance,closureReviewPOST,dropAuthReplies}){
 assert.equal(process.env.OUCHI_FAMILY_STORAGE_TEST,'true');assert.equal(origin,'http://127.0.0.1:54321');
 assert.equal(typeof readAttachmentResponse,'function');assert.equal(typeof createHomeHandoffInventoryIdentityVerifier,'function');assert.equal(typeof createHomeHandoffInventoryActorVerifier,'function');
 const {Client}=await import('pg');
 const db=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
 await db.connect();
 try{
  const owner=await account(),receiver=await account(),unrelated=await account();
  const totpTimes=new Map(),totpFactors=new Map();
  for(const actor of [owner,receiver]){
   const enrolled=await actor.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic atomic handoff authenticator'});
   assert.equal(enrolled.error,null);assert.equal(enrolled.data.type,'totp');
   const challenge=await actor.client.auth.mfa.challenge({factorId:enrolled.data.id});assert.equal(challenge.error,null);
   const promoted=await actor.client.auth.mfa.verify({factorId:enrolled.data.id,challengeId:challenge.data.id,code:syntheticTOTP(enrolled.data.totp.secret)});
   assert.equal(promoted.error,null);
   const claims=JSON.parse(Buffer.from(promoted.data.access_token.split('.')[1],'base64url'));
   assert.equal(claims.sub,actor.user);assert.equal(claims.session_id,actor.session);assert.equal(claims.aal,'aal2');
   const amr=claims.amr.filter(value=>value.method==='totp');assert.equal(amr.length,1);
   totpTimes.set(actor.user,amr[0].timestamp*1000);
   totpFactors.set(actor.user,enrolled.data.id);
   assert.equal((await db.query('select aal::text from auth.sessions where id=$1',[actor.session])).rows[0].aal,'aal2');
  }
  const homeID=randomUUID(),productID=randomUUID(),taskID=randomUUID(),ownFile=randomUUID(),memberFile=randomUUID(),secondOwnFile=randomUUID(),nativeRequestID=randomUUID(),nativeLease=randomUUID();
  const sha=createHash('sha256').update(bytes).digest('hex');
  await db.query('insert into public.homes(id,owner_id) values($1,$2)',[homeID,owner.user]);
  await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[homeID,receiver.user,'Synthetic atomic receiver']);
  await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[productID,homeID,'air','Synthetic atomic product']);
  await db.query('insert into public.maintenance_tasks(id,"productId",name,kind,"intervalDays","nextDueAt","sourceKind") values($1,$2,$3,$4,30,current_date,$5)',[taskID,productID,'Synthetic atomic task','掃除','ユーザー設定']);
  const source=[{id:ownFile,user:owner},{id:memberFile,user:receiver},{id:secondOwnFile,user:owner}];
  for(const {id,user} of source){
   await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,expected_sha256,sha256,write_tracking,captured_owner_id) values($1,$2,$3,$4,$5,'image/png','stored',$6,$6,true,$7)",[id,user.user,user.epoch,productID,bytes.length,sha,owner.user]);
   await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$4,$5,'settled',clock_timestamp())",[id,randomUUID(),user.user,owner.user,user.epoch]);
   const upload=await admin.storage.from('ouchi-product-attachments').upload(`${user.user}/${user.epoch}/${id}.png`,bytes,{contentType:'image/png',upsert:false});assert.equal(upload.error,null);
  }
  // Canonical migrations installed review intake before any deletion job or family handoff. The
  // actor is an actual fresh GoTrue/TOTP identity; no app closure is performed.
  const reviewSession=await owner.client.auth.getSession();assert.equal(reviewSession.error,null);
  const reviewAuth=await createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(AbortSignal.timeout(5000),5000,65536)}}).auth.getUser(reviewSession.data.session.access_token);
  assert.equal(reviewAuth.error,null);assert.equal(reviewAuth.data.user.id,owner.user);
  const reviewClaims=JSON.parse(Buffer.from(reviewSession.data.session.access_token.split('.')[1],'base64url'));assert.equal(reviewClaims.session_id,owner.session);assert.equal(reviewClaims.aal,'aal2');
  const reviewSnapshot=async()=>(await db.query(`select jsonb_build_object(
   'homes',(select jsonb_agg(to_jsonb(h) order by h.id) from public.homes h where h.id=$1),
   'members',(select jsonb_agg(to_jsonb(m) order by m.user_id) from public.home_members m where m."homeId"=$1),
   'products',(select jsonb_agg(to_jsonb(p) order by p.id) from public.products p where p."homeId"=$1),
   'tasks',(select jsonb_agg(to_jsonb(t) order by t.id) from public.maintenance_tasks t where t."productId"=$2),
   'files',(select jsonb_agg(to_jsonb(f) order by f.id) from maintenance_private.product_attachments f where f.product_id=$2),
   'access',(select to_jsonb(a) from maintenance_private.account_access a where a.user_id=$3)
  ) as value`,[homeID,productID,owner.user])).rows[0].value;
  const originalReviewFamily=await reviewSnapshot();
  await db.query('update maintenance_private.account_closure_review_policy set enabled=true');
  let reviewReceipt;
  try{
   await db.query('set role service_role');
   reviewReceipt=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) as value',[owner.user,owner.session,owner.epoch,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])).rows[0].value;
   assert.equal(reviewReceipt.state,'review_required');assert.equal(reviewReceipt.kind,'app-closure-review/v2');assert.equal(reviewReceipt.epochID,owner.epoch);assert.equal(reviewReceipt.requestID,undefined);
   // Deliberately lose only the reply: reconcile the exact durable intake ID.
   await assert.rejects((async()=>{await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4)',[owner.user,owner.session,owner.epoch,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);throw Error('Review intake reply lost');})(),/reply lost/);
   assert.deepEqual((await db.query('select public.read_maintenance_closure_review($1,$2,$3,$4) as value',[owner.user,owner.session,owner.epoch,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])).rows[0].value,reviewReceipt);
   await assert.rejects(db.query('select public.read_maintenance_closure_review($1,$2,$3,$4)',[owner.user,receiver.session,owner.epoch,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']),/Current app session required/);
   const cancelArgs=[owner.user,owner.session,owner.epoch,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'];
   const cancelled=(await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4) as value',cancelArgs)).rows[0].value;
   assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.reviewRequestID,reviewReceipt.reviewRequestID);
   // Lose a cancellation acknowledgement; neither retry nor intake replay revives it.
   assert.deepEqual((await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4) as value',cancelArgs)).rows[0].value,cancelled);
   assert.deepEqual((await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) as value',cancelArgs)).rows[0].value,cancelled);
   assert.deepEqual((await db.query('select public.read_maintenance_closure_review($1,$2,$3,$4) as value',cancelArgs)).rows[0].value,cancelled);
  }finally{await db.query('reset role');}
  assert.deepEqual(await reviewSnapshot(),originalReviewFamily);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1',[owner.user])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests where user_id=$1 and app_epoch_id=$2',[owner.user,owner.epoch])).rows[0].n,0);
  const projectID='abcdefghijklmnopqrst';
  const authVersionReader=createHomeHandoffAuthVersionReader({projectID,publishableKey:'sb_publishable_disposable_only',fetcher:async(url,init)=>{
   assert.equal(url,'https://'+projectID+'.supabase.co/auth/v1/health');assert.equal(init.method,'GET');
   const target=origin+'/auth/v1/health';
   const response=await createAttachmentFetch(init.signal,5000,8192)(target,{...init,cache:'no-store'});
   // createAttachmentFetch bounds the fixed local target and refuses redirects;
   // its buffered Response intentionally does not preserve response.url.
   assert.equal(response.status,200);
   // Re-envelope the actual local health bytes for the exact disposable alias.
   return new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
  }});
  const policyReader=createStrictHomeHandoffPolicyReader({projectID,accessToken:'synthetic_config_read_only',authVersionReader,fetcher:async(url,init)=>{
   assert.equal(url,'https://api.supabase.com/v1/projects/'+projectID+'/config/auth');assert.equal(init.method,'GET');
   // Explicit disposable config fixture, not a live Management credential/read.
   return Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false});
  }});
  const checkedPolicy=await policyReader(AbortSignal.timeout(5000));
  assert.equal(checkedPolicy.assuranceMode,'highest-current-aal/v1');assert.equal('allowLowAALSeconds' in checkedPolicy,false);
  console.log('strict Auth policy: actual GoTrue health + explicit disposable config; highest-current AAL, no fabricated low-AAL default');
  await verifyDisposableClosureReviewHTTP({db,actor:owner,admin,origin,options,createAttachmentFetch,sessionAfterAuthVerification});
  await verifyDisposableReauthenticationResponseLoss({db,actor:await account(),origin,options,createAttachmentFetch});
  const reviewTransactions={run:async(signal,callback)=>{
   signal.throwIfAborted();await db.query('begin');
   try{
    await db.query("set local statement_timeout='4500ms';set local lock_timeout='3000ms'");
    const result=await callback({query:async(sql,args)=>{signal.throwIfAborted();const value=await db.query(sql,args);signal.throwIfAborted();return value;}});
    signal.throwIfAborted();await db.query('commit');return result;
   }catch(error){await db.query('rollback');throw error;}
  }};
  const reviewIdentityOptions={projectID,policyReader,getUser:(token,signal)=>createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(signal,5000,65536)}}).auth.getUser(token)};
  // Disposable LOGIN only: unlike SET ROLE on an administrator session, this
  // connection cannot regain administrator privileges after a query error.
  await db.query("create role ouchi_closure_review_ci_login login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-private-review-ci-only'");
  await db.query('grant ouchi_closure_review_executor to ouchi_closure_review_ci_login');
  const restrictedProbe=new Client({host:'127.0.0.1',port:54323,user:'ouchi_closure_review_ci_login',password:'synthetic-private-review-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
  await restrictedProbe.connect();
  try{
   await restrictedProbe.query('set role ouchi_closure_review_executor');
   for(const sql of ['select encrypted_password from auth.users','update auth.users set encrypted_password=encrypted_password','delete from auth.sessions','select * from public.products','delete from public.homes','update maintenance_private.account_closure_review_policy set enabled=true','select public.erase_maintenance_data()','set role postgres'])await assert.rejects(restrictedProbe.query(sql),/permission denied/);
   const flags=(await restrictedProbe.query("select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls from pg_roles where rolname=session_user")).rows[0];
   assert.deepEqual(flags,{rolcanlogin:true,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false});
  }finally{await restrictedProbe.end();}
  const reviewApplicationName='ouchi-review-'+randomUUID(),reviewSQL=[];
  const connectReview=createDedicatedPostgresConnection({createClient:bounds=>new Client({host:'127.0.0.1',port:54323,user:'ouchi_closure_review_ci_login',password:'synthetic-private-review-ci-only',database:'auth_test',application_name:reviewApplicationName,...bounds})});
  const dedicatedReviewTransactions=createAccountClosureReviewPrivateTransactions({connect:async({signal})=>{
   // Synthetic restricted credentials, never production configuration.
   const connection=await connectReview({signal});
   return {query:(sql,args)=>{reviewSQL.push(sql);return connection.query(sql,args);},abort:connection.abort,close:connection.close};
  }});
  await db.query("create role ouchi_closure_reauth_ci_worker login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-reauth-worker-ci-only'");
  await db.query('grant ouchi_closure_reauth_worker to ouchi_closure_reauth_ci_worker');
  const maintenance=createClosureReauthenticationMaintenance({enabled:true,connect:async({signal})=>{
   const client=new Client({host:'127.0.0.1',port:54323,user:'ouchi_closure_reauth_ci_worker',password:'synthetic-reauth-worker-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:5000});
   client.on('error',()=>{});let closing;const abort=()=>{closing??=client.end();};signal.addEventListener('abort',abort,{once:true});
   try{signal.throwIfAborted();await client.connect();signal.throwIfAborted();}catch(error){abort();await closing.catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);}
   return {query:(sql,args)=>client.query(sql,args),abort,close:async()=>{abort();await closing;}};
  }});
  await verifyDisposableClosureReauthLifecycle({db,actor:await account(),origin,options,createAttachmentFetch,transactions:dedicatedReviewTransactions,maintenance});
  const reviewWitness=authenticate=>createAccountClosureReviewReauthentication({identity:{userID:owner.user,sessionID:owner.session,epochID:owner.epoch,email:owner.email},authenticate,readAuthState:async(userID,signal)=>{
    signal.throwIfAborted();const result=await db.query(CLOSURE_REAUTHENTICATION_STATE_SQL,[userID]);signal.throwIfAborted();return result.rows[0]?.reauthentication_state;
   }});
  const markedProducer=disposableMarkedPasswordProducer({origin,options,createAttachmentFetch,transactions:dedicatedReviewTransactions});
  await verifyDisposableMarkedPasswordProducer({db,actor:owner,origin,options,createAttachmentFetch,transactions:dedicatedReviewTransactions});
  await verifyDisposableClosureReauthRaces({db,actor:owner,origin,options,createAttachmentFetch,transactions:dedicatedReviewTransactions,applicationName:reviewApplicationName});
  const {reauthenticate:realReauthentication}=await verifyDisposableClosureReviewHTTP({db,actor:owner,admin,origin,options,createAttachmentFetch,sessionAfterAuthVerification,handlerFactory:()=>createAccountClosureReviewServer({enabled:true,identityOptions:reviewIdentityOptions,transactions:dedicatedReviewTransactions,authenticate:markedProducer})});
  await verifyDisposableClosureReviewRuntime({POST:closureReviewPOST,db,actor:owner,admin,origin,options,createAttachmentFetch,sessionAfterAuthVerification});
  await db.query('begin');
  try{
   await db.query('select id from auth.users where id=$1::uuid for update',[owner.user]);
   const controller=new AbortController(),before=reviewSQL.length;
   const waiting=dedicatedReviewTransactions.run(controller.signal,tx=>tx.query('select id from auth.users where id=$1::uuid for update',[owner.user]));
   // Attach rejection handling immediately, but verify actual lock contention
   // before aborting; a pre-query cancellation is not this witness.
   const settled=waiting.then(()=>({accepted:true}),error=>({accepted:false,error}));
   let observed=false;
   for(let attempt=0;attempt<20;attempt++){
    // pg_stat_activity is snapshotted on first access in this lock-holder
    // transaction. Refresh only its local observation cache, not counters or
    // locks, so later polls can see the newly connected blocked backend.
    await db.query('select pg_stat_clear_snapshot()');
    if((await db.query("select exists(select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock') as waiting",[reviewApplicationName])).rows[0].waiting){observed=true;break;}
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   controller.abort();const result=await settled;
   assert.equal(observed,true,'Cancellation must interrupt an actual PostgreSQL row-lock wait');
   assert.equal(result.accepted,false);assert.match(result.error.message,/terminated|abort|interrupted|closed|cancel/i);
   assert.equal(reviewSQL.slice(before).includes('COMMIT'),false);
   assert.equal(reviewSQL.slice(before).includes('ROLLBACK'),false,'Do not queue rollback behind an in-flight query');
  }finally{await db.query('rollback');}
  let reviewConnectionsClosed=false;
  for(let attempt=0;attempt<20;attempt++){
   if((await db.query('select count(*)::int n from pg_stat_activity where application_name=$1',[reviewApplicationName])).rows[0].n===0){reviewConnectionsClosed=true;break;}
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(reviewConnectionsClosed,true);
  console.log('closure-review actual PostgreSQL transport: restricted LOGIN, private helpers and masked credential/factor state; raw Auth/family edits, policy enable and administrator role denied; dedicated connections closed; cancellation interrupts observed Auth row-lock wait without COMMIT or queued rollback');
  const originalReviewSessions=(await db.query('select id::text from auth.sessions where user_id=$1 order by id',[owner.user])).rows;
  // Read actual GoTrue each time, then inject a refusal only at the final check.
  // PostgreSQL must roll back the intake that its real review SQL just inserted.
  let finalChecks=0;
  const refusedWitness=reviewWitness(realReauthentication);
  assert.equal(await refusedWitness.reauthenticate(owner.email,owner.password,AbortSignal.timeout(10000)),owner.user);
  const refusedPort=createAccountClosureReviewTransactionPort({bearer:reviewSession.data.session.access_token,transactions:reviewTransactions,verifyReauthentication:refusedWitness.verify,identityOptions:{...reviewIdentityOptions,getUser:async(token,signal)=>{
   const result=await reviewIdentityOptions.getUser(token,signal);assert.equal(result.error,null);finalChecks++;
   return finalChecks===3?{data:{user:null},error:null}:result;
  }}});
  const refusedSubmission=randomUUID();
  await assert.rejects(refusedPort.request({userID:owner.user,sessionID:owner.session,epochID:owner.epoch,submissionID:refusedSubmission},AbortSignal.timeout(10000)),/Current transaction verification required/);
  assert.equal(finalChecks,3);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1 and submission_id=$2',[owner.user,refusedSubmission])).rows[0].n,0);
  console.log('closure-review actual GoTrue/PostgreSQL: final-check refusal rolls back inserted intake');
  const originalExpiry=(await db.query('select not_after from auth.sessions where id=$1',[owner.session])).rows[0].not_after;
  let expiredDuringWrite=false;
  const expiresWitness=reviewWitness(realReauthentication);
  assert.equal(await expiresWitness.reauthenticate(owner.email,owner.password,AbortSignal.timeout(10000)),owner.user);
  const expiresPort=createAccountClosureReviewTransactionPort({bearer:reviewSession.data.session.access_token,identityOptions:reviewIdentityOptions,verifyReauthentication:expiresWitness.verify,transactions:{run:(signal,callback)=>reviewTransactions.run(signal,raw=>callback({query:async(sql,args)=>{
   const result=await raw.query(sql,args);
   if(sql.startsWith('select public.request_maintenance_closure_review')){
    await raw.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[owner.session]);expiredDuringWrite=true;
   }
   return result;
  }}))}});
  const expiredSubmission=randomUUID();
  await assert.rejects(expiresPort.request({userID:owner.user,sessionID:owner.session,epochID:owner.epoch,submissionID:expiredSubmission},AbortSignal.timeout(10000)),/Current transaction verification required/);
  assert.equal(expiredDuringWrite,true);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1 and submission_id=$2',[owner.user,expiredSubmission])).rows[0].n,0);
  assert.deepEqual((await db.query('select not_after from auth.sessions where id=$1',[owner.session])).rows[0].not_after,originalExpiry);
  console.log('closure-review actual GoTrue/PostgreSQL: same-transaction session expiry rolls back intake and session change');
  const credentialWitness=reviewWitness(realReauthentication);
  assert.equal(await credentialWitness.reauthenticate(owner.email,owner.password,AbortSignal.timeout(10000)),owner.user);
  const originalPassword=(await db.query('select encrypted_password from auth.users where id=$1',[owner.user])).rows[0].encrypted_password;
  const changedSubmission=randomUUID();
  try{
   // Synthetic account only; change committed credentials AFTER real password
   // verification and BEFORE row pins. Always restore, never log the hash.
   await db.query('update auth.users set encrypted_password=$2 where id=$1',[owner.user,'synthetic-fault-only-credential-change']);
   const port=createAccountClosureReviewTransactionPort({bearer:reviewSession.data.session.access_token,identityOptions:reviewIdentityOptions,transactions:reviewTransactions,verifyReauthentication:credentialWitness.verify});
   await assert.rejects(port.request({userID:owner.user,sessionID:owner.session,epochID:owner.epoch,submissionID:changedSubmission},AbortSignal.timeout(10000)),/Current bound reauthentication required/);
  }finally{await db.query('update auth.users set encrypted_password=$2 where id=$1',[owner.user,originalPassword]);}
  assert.equal((await db.query('select count(*)::int n from maintenance_private.account_closure_reviews where user_id=$1 and submission_id=$2',[owner.user,changedSubmission])).rows[0].n,0);
  assert.deepEqual((await db.query('select id::text from auth.sessions where user_id=$1 order by id',[owner.user])).rows,originalReviewSessions);
  console.log('closure-review actual GoTrue/PostgreSQL: credential change after password authentication refuses pre-pin stale witness; temporary sessions cleaned');
  assert.deepEqual(await reviewSnapshot(),originalReviewFamily,'Actual HTTP review operations must retain family content and access');
  await db.query('update maintenance_private.account_closure_review_policy set enabled=false');
  await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,attempts) values($1,$2,$3,'running',$4,clock_timestamp()+interval '2 minutes',1)",[nativeRequestID,owner.user,owner.epoch,nativeLease]);
  // Journal/quota were installed by the earlier awaited actual quota fixture.
  for(const name of ['household-fence.sql','scoped-worker.sql','handoff.sql','private-writers.sql'])await db.query(readFileSync('tests/fixtures/handoff-controller-compatibility/'+name,'utf8'));
  await db.query(readFileSync('tests/fixtures/family-attachment-activation.sql','utf8'));
  await db.query(readFileSync('tests/fixtures/family-attachment-inventory-consent.sql','utf8'));
  await db.query(readFileSync('tests/fixtures/family-attachment-completion.sql','utf8'));
  const controllerScope={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:owner.user,leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:nativeRequestID,scopeID:owner.epoch},{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()}]};
  await db.query("insert into maintenance_private.household_stop_bindings values($1,$2,$3,clock_timestamp()+interval '5 minutes','requested')",[owner.user,controllerScope,nativeLease]);
  await db.query('select maintenance_private.freeze_household_scope($1,$2)',[controllerScope,nativeLease]);
  const saved=(await db.query('select maintenance_private.household_family_snapshot($1) as value',[homeID])).rows[0].value;
  const consentPlan={protocolVersion:2,requestID:controllerScope.requestID,userID:owner.user,inventoryDigest:controllerScope.inventoryDigest,appRequestID:nativeRequestID,appScopeID:owner.epoch,householdID:homeID,successorID:receiver.user,memberIDs:[owner.user,receiver.user],familyRecordIDs:[productID],familySnapshotDigest:snapshotDigest(saved)};
  await db.query('insert into maintenance_private.household_handoff_plans values($1,$2,$3,$4,$5,$6,$7)',[homeID,owner.user,receiver.user,controllerScope,consentPlan,handoffPlanDigest(controllerScope,consentPlan),saved]);
  await db.query('insert into maintenance_private.household_family_holds values($1,$2,$3)',[homeID,owner.user,controllerScope]);
  let consentCommitFault=null;
  const transaction=async(callback,signal=AbortSignal.timeout(10000))=>{
   await db.query('begin');
   try{await db.query("set local statement_timeout='4500ms'");const result=await runWithTransactionCommitChecks(db,signal,async tx=>{
    const value=await callback(tx);
    if(consentCommitFault){const fault=consentCommitFault;consentCommitFault=null;await fault(tx,value);}
    return value;
   });await db.query('commit');return result;}
   catch(error){await db.query('rollback');throw error;}
  };
  const key=randomBytes(32);
  const issuer=createHandoffConsentIssuer({key,verifyIdentity:async(token,tx)=>{
   // Both kinds of consent now attest the actual signed TOTP AMR time, with
   // participant coordination and complete inventory pins before Auth pins.
   for(const id of [...new Set([plan.ownerID,plan.recipientID,...plan.files.map(file=>file.source.userID)])].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
   await originalInventory(tx);
   const verified=await identity(token,{signal:AbortSignal.timeout(10000),query:(sql,args)=>tx.query(sql,args)});
   assert.ok([owner.user,receiver.user].includes(verified.userID));assert.equal(verified.aal,'aal2');
   assert.equal(verified.authenticatedAt,totpTimes.get(verified.userID));
   return {userID:verified.userID,authVerifiedAt:verified.authenticatedAt};
  },store:{transaction,target:async(tx,request,home,actor)=>{
   assert.equal(request,controllerScope.requestID);assert.equal(home,homeID);assert.ok([owner.user,receiver.user].includes(actor));
   const row=(await tx.query('select scope,plan from maintenance_private.household_handoff_plans where home_id=$1 for update',[homeID])).rows[0];
   assert.deepEqual(row.scope,controllerScope);assert.deepEqual(row.plan,consentPlan);
   assert.deepEqual((await tx.query('select maintenance_private.household_family_snapshot($1) as value',[homeID])).rows[0].value,saved);
   return row;
  },
   existing:async(tx,s,p,actor)=>{const row=(await tx.query('select * from maintenance_private.household_handoff_consents where home_id=$1 and actor_id=$2 for update',[homeID,actor])).rows[0];return row?{actorID:row.actor_id,token:row.token,revokedAt:row.revoked_at}:null;},
   record:(tx,s,p,actor,token)=>tx.query('insert into maintenance_private.household_handoff_consents values($1,$2,$3,null)',[homeID,actor,token])
  }});
  const scope={requestID:controllerScope.requestID,homeID,userID:owner.user,ownerEpoch:owner.epoch,nativeRequestID,nativeLease,controllerScope};
  const plan={requestID:scope.requestID,homeID,ownerID:owner.user,ownerEpoch:owner.epoch,recipientID:receiver.user,recipientEpoch:receiver.epoch,snapshotDigest:consentPlan.familySnapshotDigest,files:source.map(({id,user})=>({id,mime:'image/png',size:bytes.length,sha256:sha,source:{userID:user.user,epoch:user.epoch,path:`${user.user}/${user.epoch}/${id}.png`}}))};
  // Explicit disposable policy, not live Management acquisition. The production
  // issuer adapter itself verifies/pins actual Auth rows and recent signed AMR.
  const identity=createHomeHandoffInventoryIdentityVerifier({projectID,policyReader,getUser:(token,signal)=>createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(signal,5000,65536)}}).auth.getUser(token)});
  // A separate real account proves row/factor-insertion fences and cancellation
  // without revoking the two people needed by the complete Storage handoff.
  const scratch=await account();
  const scratchFactor=await scratch.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic pin test'});assert.equal(scratchFactor.error,null);
  const scratchSession=await scratch.client.auth.getSession();assert.equal(scratchSession.error,null);
  const scratchToken=scratchSession.data.session.access_token;
  const contender=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:3000});
  await contender.connect();
  try{
   await contender.query("set lock_timeout='200ms'");
   await transaction(async tx=>{
    const signal=AbortSignal.timeout(10000);
    const verified=await identity(scratchToken,{signal,query:(sql,args)=>tx.query(sql,args)});
    assert.equal(verified.userID,scratch.user);assert.equal(verified.sessionID,scratch.session);assert.equal(verified.epochID,scratch.epoch);assert.equal(verified.aal,'aal1');
    for(const [sql,args] of [
     ['delete from auth.sessions where id=$1',[scratch.session]],
     ["update auth.mfa_factors set status='verified' where id=$1",[scratchFactor.data.id]],
     ['update maintenance_private.app_epochs set enabled=false where user_id=$1',[scratch.user]],
     ["insert into auth.mfa_factors select (jsonb_populate_record(null::auth.mfa_factors,to_jsonb(f)||jsonb_build_object('id',$1::uuid,'user_id',$2::uuid,'friendly_name',$3::text))).* from auth.mfa_factors f where id=$4",[randomUUID(),scratch.user,'Synthetic concurrent factor '+randomUUID(),scratchFactor.data.id]]
    ])await assert.rejects(contender.query(sql,args),error=>error.code==='55P03');
   });
   const cancellation=new AbortController();
   await assert.rejects(transaction(tx=>identity(scratchToken,{signal:cancellation.signal,query:async(sql,args)=>{
    const result=await tx.query(sql,args);if(sql.includes('from auth.users where'))cancellation.abort();return result;
   }})),{name:'AbortError'});
   await contender.query('begin');
   try{assert.equal((await contender.query('select id from auth.users where id=$1 for update nowait',[scratch.user])).rows[0].id,scratch.user);}
   finally{await contender.query('rollback');}
   const logout=await scratch.client.auth.signOut({scope:'local'});assert.equal(logout.error,null);
   assert.equal(await transaction(tx=>identity(scratchToken,{signal:AbortSignal.timeout(10000),query:(sql,args)=>tx.query(sql,args)})),null);
  }finally{await contender.end();}
  async function originalInventory(tx){
   const members=(await tx.query('select user_id from public.home_members where "homeId"=$1 order by user_id for update',[homeID])).rows;
   const products=(await tx.query('select id from public.products where "homeId"=$1 order by id for update',[homeID])).rows;
   const files=(await tx.query("select f.* from maintenance_private.product_attachments f join public.products p on p.id=f.product_id where p.\"homeId\"=$1 and f.state<>'removed' order by f.id for update of f",[homeID])).rows;
   const writes=(await tx.query("select w.* from maintenance_private.attachment_write_attempts w join maintenance_private.product_attachments f on f.id=w.attachment_id join public.products p on p.id=f.product_id where p.\"homeId\"=$1 and f.state<>'removed' order by w.attachment_id for update of w",[homeID])).rows;
   return JSON.parse(JSON.stringify({members,products,files,writes}));
  }
  const actorVerifier=createHomeHandoffInventoryActorVerifier({projectID,policyReader});
  const inventoryConsent=createFamilyAttachmentInventoryConsent({key:randomBytes(32),store:{
   transaction,target:async(tx,request,home,actor)=>{
    assert.equal(request,scope.requestID);assert.equal(home,homeID);assert.ok([owner.user,receiver.user].includes(actor));
    for(const id of [...new Set([plan.ownerID,plan.recipientID,...plan.files.map(file=>file.source.userID)])].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
    return {scope,plan,inventory:await originalInventory(tx)};
   },
   records:async(tx,s)=>(await tx.query('select actor_id as "actorID",token,revoked_at as "revokedAt" from maintenance_private.family_attachment_inventory_consents where request_id=$1 and home_id=$2 order by actor_id for update',[s.requestID,s.homeID])).rows,
   record:(tx,s,p,r)=>tx.query('insert into maintenance_private.family_attachment_inventory_consents values($1,$2,$3,$4,null)',[s.requestID,s.homeID,r.actorID,r.token])
  },identifyActor:async(token,signal)=>{
   const result=await createClient(origin,'synthetic-public-key',{...options,global:{fetch:createAttachmentFetch(signal,5000,65536)}}).auth.getUser(token);
   assert.equal(result.error,null);return result.data.user.id;
  },verifyIdentity:async(token,tx,signal)=>{
   // Before taking any Auth row pins, both participant coordination locks must
   // already be held. Another physical connection proves this order, rather
   // than inferring it from the prepared adapter's source.
   const probe=new Client({host:'127.0.0.1',port:54323,user:'postgres',password:'synthetic-ci-only',database:'auth_test',connectionTimeoutMillis:3000,query_timeout:3000});
   await probe.connect();
   try{
    await probe.query("set lock_timeout='200ms'");
    for(const id of [owner.user,receiver.user])await assert.rejects(probe.query('select pg_advisory_xact_lock(hashtext($1))',[id]),error=>error.code==='55P03');
   }finally{await probe.end();}
   return identity(token,{signal,query:(sql,args)=>tx.query(sql,args)});
  },verifyActor:(tx,claims,signal)=>actorVerifier({signal,query:(sql,args)=>tx.query(sql,args)},claims,signal),currentAuthority:async(tx,s,p,i,d,signal)=>{
   signal.throwIfAborted();
   const row=(await tx.query("select exists(select 1 from maintenance_private.account_deletion_requests n join maintenance_private.household_stop_bindings b on b.user_id=n.user_id join maintenance_private.household_family_holds h on h.principal=n.user_id where n.id=$1 and n.user_id=$2 and n.app_epoch_id=$3 and n.lease_token=$4 and n.state='running' and n.lease_until>clock_timestamp() and b.native_lease=n.lease_token and b.scope=$5::jsonb and b.state='processing' and b.lease_until>clock_timestamp() and h.home_id=$6 and h.scope=b.scope) as current",[s.nativeRequestID,s.userID,s.ownerEpoch,s.nativeLease,JSON.stringify(s.controllerScope),s.homeID])).rows[0];
   signal.throwIfAborted();return row.current===true;
  }});
  // Real signed TOTP identity is accepted first; expire its actual session
  // after the callback returns, while the same native PG transaction still owns
  // all pins. The new issuer COMMIT hook must roll back both consent and fault.
  const rejectConsentAtCommit=async()=>{
   const before=(await db.query('select actor_id,token,revoked_at from maintenance_private.family_attachment_inventory_consents where request_id=$1 order by actor_id',[scope.requestID])).rows;
   const expiry=(await db.query('select not_after from auth.sessions where id=$1',[owner.session])).rows[0].not_after;
   const session=await owner.client.auth.getSession();assert.equal(session.error,null);
   let faultReached=false;
   consentCommitFault=async(tx,value)=>{
    assert.equal(value.status,'accepted','Late fault must follow successful real identity and consent readback');
    faultReached=true;
    await tx.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[owner.session]);
   };
   try{
    const result=await inventoryConsent.issue({requestID:scope.requestID,homeID,accessToken:session.data.session.access_token,confirmation:'写真・保証書の一覧と受取先を確認して引き継ぎに同意する',signal:AbortSignal.timeout(10000)});
    assert.equal(faultReached,true);assert.equal(result.status,'unconfirmed');
    assert.deepEqual((await db.query('select actor_id,token,revoked_at from maintenance_private.family_attachment_inventory_consents where request_id=$1 order by actor_id',[scope.requestID])).rows,before);
    assert.deepEqual((await db.query('select not_after from auth.sessions where id=$1',[owner.session])).rows[0].not_after,expiry);
   }finally{consentCommitFault=null;}
  };
  await rejectConsentAtCommit();
  for(const actor of [owner,receiver]){
   const session=await actor.client.auth.getSession();assert.equal(session.error,null);
   assert.equal((await inventoryConsent.issue({requestID:scope.requestID,homeID,accessToken:session.data.session.access_token,confirmation:'写真・保証書の一覧と受取先を確認して引き継ぎに同意する',signal:AbortSignal.timeout(10000)})).status,'accepted');
  }
  const issuedConsents=(await db.query('select actor_id,token from maintenance_private.family_attachment_inventory_consents where request_id=$1',[scope.requestID])).rows;
  assert.equal(issuedConsents.length,2);
  await rejectConsentAtCommit();
  console.log('inventory-consent actual GoTrue/PostgreSQL: new and replayed consent reject session expiry at COMMIT without changing original records');
  for(const record of issuedConsents){
   const claims=JSON.parse(Buffer.from(record.token.split('.')[0],'base64url'));
   assert.equal(claims.actorID,record.actor_id);assert.equal(claims.aal,'aal2');
   assert.equal(claims.authenticatedAt,totpTimes.get(record.actor_id));
  }
  for(const actor of [owner,receiver]){
   const session=await actor.client.auth.getSession();assert.equal(session.error,null);
   assert.equal((await issuer({requestID:controllerScope.requestID,householdID:homeID,accessToken:session.data.session.access_token,confirmation:'家族データの引き継ぎに同意する'})).status,'accepted');
  }
  const householdConsents=(await db.query('select actor_id,token from maintenance_private.household_handoff_consents where home_id=$1',[homeID])).rows;
  assert.equal(householdConsents.length,2);
  for(const record of householdConsents){
   const claim=JSON.parse(Buffer.from(record.token.split('.')[0],'base64url'));
   assert.equal(claim.actorID,record.actor_id);assert.equal(claim.authVerifiedAt,totpTimes.get(record.actor_id));
  }
  const budget=await prepareActualKakeiFamily({db,transaction,root:controllerScope,owner,receiver,identity,totpTimes});
  const provider=()=>createFamilyAttachmentStatus({transaction,authorize:inventoryConsent.authorize});
  // Historical committed fact is separate from current mutation authority.
  const committedHousehold=createCommittedHouseholdConsentVerifier({key,verifyCommittedInventory:inventoryConsent.authorizeCommittedActivation});
  const historical=async()=>{const signal=AbortSignal.timeout(10000);return transaction(async tx=>{
   const inventory=await inventoryConsent.authorizeCommittedActivation(tx,scope,signal);
   const household=await committedHousehold(tx,scope,signal);assert.equal(household,inventory);
   return household;
  },signal);};

  const journal=createFamilyAttachmentJournal({transaction,authorize:inventoryConsent.authorize});
  let status=provider(),preparations=0,activations=0,cleanupCalls=0,tamperNextActivation=true,lastActivationFailure=null,cleanupEnabled=false,finishCalls=0;
  const removedSourcePaths=[];
  const storage=createFamilyAttachmentStoragePorts({clientForSignal:signal=>createClient(origin,service,{...options,global:{fetch:createAttachmentFetch(signal)}}),guard:async(s,p,f,operation,signal)=>{
   if(operation==='cleanup'){cleanupCalls++;if(!cleanupEnabled)return false;}
   const current=await status(s,p,signal);
   return operation==='cleanup'?current.state==='activated':current.state==='prepared'||current.state==='activated';
  }});
  // Disposable coordinator identity is injected. Its actual scoped job/freeze
  // rows are independently checked; shipping controller authentication and
  // external namespace capability admission remain required before deployment.
  const controllerCurrent=async(tx,s,p,signal)=>{
   signal.throwIfAborted();assert.deepEqual(s,scope);assert.equal(p.requestID,plan.requestID);
   const row=(await tx.query(`select exists(select 1 from maintenance_private.account_deletion_requests n
    join maintenance_private.household_stop_bindings b on b.user_id=n.user_id
    join maintenance_private.household_family_holds h on h.principal=n.user_id and h.home_id=$5
    join maintenance_private.household_principal_fences f on f.user_id=n.user_id
    where n.id=$1 and n.user_id=$2 and n.app_epoch_id=$3 and n.lease_token=$4
    and n.state='running' and n.lease_until>clock_timestamp() and b.native_lease=n.lease_token
    and b.state='processing' and b.lease_until>clock_timestamp() and b.scope=$6::jsonb and h.scope=b.scope and f.stopped
    and exists(select 1 from maintenance_private.app_epochs e join maintenance_private.account_access a using(user_id)
     where e.user_id=$7 and e.epoch_id=$8 and e.enabled and a.enabled)
    and not exists(select 1 from maintenance_private.account_deletion_requests where user_id=$7 and state<>'complete')) as current`,[s.nativeRequestID,s.userID,s.ownerEpoch,s.nativeLease,s.homeID,JSON.stringify(s.controllerScope),p.recipientID,p.recipientEpoch])).rows[0];
   signal.throwIfAborted();return row.current===true;
  };
  const completionStorage=createFamilyAttachmentStoragePorts({clientForSignal:signal=>createClient(origin,service,{...options,global:{fetch:createAttachmentFetch(signal)}}),guard:(s,p,f,operation,signal)=>controllerCurrent(db,s,p,signal)});
  const completionProvider=()=>createFamilyAttachmentCompletion({transaction,verifyCommittedConsent:committedHousehold,verifyReadAuthority:controllerCurrent,verifyWriteAuthority:controllerCurrent,storage:completionStorage});
  let completion=completionProvider();
  const completedExists=async()=>(await db.query('select 1 from maintenance_private.family_attachment_completion_receipts where request_id=$1 and home_id=$2',[scope.requestID,scope.homeID])).rows.length===1;
  const ports={...storage,plan:async()=>plan,guard:async(s,signal)=>{
   if(!await controllerCurrent(db,s,normalizeFamilyAttachmentPlan(plan),signal))return false;
   if(await completedExists())return (await completion.status(s,plan,signal)).state==='complete';
   await status(s,plan,signal);return true;
  },status:async(...args)=>await completedExists()?completion.status(...args):status(...args),
   prepare:async(...args)=>{preparations++;await journal.prepare(...args);throw Error('Successful reservation reply lost');},
   activate:async(s,p,digest,proof,signal)=>{
    activations++;const activation=createFamilyAttachmentActivation({scope:s,plan,proof,signal,authorize:inventoryConsent.authorizeActivation});
    try{await transaction(async tx=>{
     await createHouseholdHandoffPort(key,activation)(controllerScope,nativeLease,homeID,tx);
     if(tamperNextActivation){
      tamperNextActivation=false;
      // The transfer and receipts have been written, but COMMIT has not run.
      // Changing a pinned factor in this same transaction must invalidate its
      // signed Auth-state snapshot and roll back both the factor and transfer.
      assert.equal((await tx.query('update auth.mfa_factors set friendly_name=$1 where id=$2 and user_id=$3 returning id',['Synthetic late factor mutation',totpFactors.get(receiver.user),receiver.user])).rowCount,1);
     }
    },signal);}catch(error){lastActivationFailure=error;throw error;}
    throw Error('Successful activation reply lost');
   },removeSource:async(s,p,f,proof,signal)=>{
    await storage.removeSource(s,p,f,proof,signal);removedSourcePaths.push(f.source.path);
    if(removedSourcePaths.length===1){cleanupEnabled=false;throw Error('Successful source removal reply lost');}
   },finish:async(...args)=>{finishCalls++;await completion.finish(...args);throw Error('Successful family completion reply lost');}
  };
  assert.equal((await status(scope,plan,AbortSignal.timeout(10000))).state,'absent');
  assert.equal(await historical(),false);
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(preparations,1);assert.equal(activations,1);assert.equal(cleanupCalls,0);
  assert.equal(lastActivationFailure?.code,'CURRENT_TRANSACTION_VERIFICATION_REQUIRED');
  assert.equal(await historical(),false);
  assert.equal((await status(scope,plan,AbortSignal.timeout(10000))).state,'prepared');
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[homeID])).rows[0].owner_id,owner.user);
  assert.equal((await db.query('select friendly_name from auth.mfa_factors where id=$1',[totpFactors.get(receiver.user)])).rows[0].friendly_name,'Synthetic atomic handoff authenticator');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts where request_id=$1',[scope.requestID])).rows[0].n,0);
  // Retry from the original saved consent/inventory after the failed transaction.
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(preparations,1);assert.equal(activations,2);assert.ok(cleanupCalls>0);
  status=provider();assert.equal((await status(scope,plan,AbortSignal.timeout(10000))).state,'activated');
  assert.equal(await historical(),true);
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(preparations,1);assert.equal(activations,2);
  assert.equal((await db.query('select owner_id from public.homes where id=$1',[homeID])).rows[0].owner_id,receiver.user);
  assert.deepEqual((await db.query('select maintenance_private.household_family_snapshot($1) as value',[homeID])).rows[0].value,saved);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_activation_receipts where request_id=$1',[scope.requestID])).rows[0].n,1);
  assert.equal((await db.query('select state from maintenance_private.family_attachment_quota where request_id=$1',[scope.requestID])).rows[0].state,'consumed');
  const signedContext=(await db.query('select inventory_approval from maintenance_private.family_attachment_activation_contexts where request_id=$1',[scope.requestID])).rows;
  assert.equal(signedContext.length,1);assert.equal(signedContext[0].inventory_approval.consents.length,2);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents where request_id=$1',[scope.requestID])).rows[0].n,2);
  for(const path of [plan.files[0].source.path,plan.files[1].source.path,`${receiver.user}/${receiver.epoch}/${ownFile}.png`]){
   const result=await admin.storage.from('ouchi-product-attachments').download(path);assert.equal(result.error,null);assert.deepEqual(Buffer.from(await result.data.arrayBuffer()),bytes);
  }
  for(const id of [ownFile,memberFile,secondOwnFile]){
   const result=await admin.rpc('read_maintenance_attachment',{target_user:receiver.user,verified_session:receiver.session,expected_epoch:receiver.epoch,attachment_id:id});assert.equal(result.error,null);assert.equal(result.data.user,receiver.user);
  }
  // Exercise the existing prepared HTTP handler with the person's ACTUAL bearer,
  // not an admin-supplied target_user or a client entitlement flag. No public
  // route is deployed by this direct handler invocation.
  const receiverSession=await receiver.client.auth.getSession();assert.equal(receiverSession.error,null);
  const receiverToken=receiverSession.data.session.access_token;
  async function downloadWithToken(token,id){
   return readAttachmentResponse(new Request(origin+'/api/attachments?attachmentId='+id,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)}),admin);
  }
  async function refused(response){
   assert.notEqual(response.status,200);assert.equal(response.headers.get('content-type'),'application/json');
   assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(typeof (await response.json()).error,'string');
  }
  for(const id of [ownFile,memberFile,secondOwnFile]){
   const response=await downloadWithToken(receiverToken,id);assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  }
  for(const actor of [owner,unrelated]){
   const session=await actor.client.auth.getSession();assert.equal(session.error,null);
   for(const id of [ownFile,memberFile,secondOwnFile])await refused(await downloadWithToken(session.data.session.access_token,id));
  }
  // Enable source cleanup only in this explicit disposable test. The real
  // guard still requires current signed Auth and durable atomic activation.
  // Lose the first successful remove reply and pause before the next mutation.
  const relocated=normalizeFamilyAttachmentPlan(plan).files.filter(f=>f.source.path!==f.destination.path);
  assert.equal(relocated.length,2);cleanupEnabled=true;
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(removedSourcePaths.length,1);assert.equal(finishCalls,0);
  const removedSource=relocated.find(f=>f.source.path===removedSourcePaths[0]);
  const remainingSource=relocated.find(f=>f.source.path!==removedSourcePaths[0]);
  const missingOriginal=await admin.storage.from('ouchi-product-attachments').download(removedSource.source.path);
  assert.equal(missingOriginal.data,null);assert.equal(missingOriginal.error?.code,'NoSuchKey');
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(remainingSource.source.path)).error,null);
  for(const f of normalizeFamilyAttachmentPlan(plan).files){
   const kept=await admin.storage.from('ouchi-product-attachments').download(f.destination.path);
   assert.equal(kept.error,null);assert.deepEqual(Buffer.from(await kept.data.arrayBuffer()),bytes);
  }
  // Full HMAC-authorized status must reject a changed factor inventory even
  // when the existing AAL2 session and verified TOTP factor remain unchanged.
  const additional=await receiver.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic post-consent factor'});assert.equal(additional.error,null);
  assert.equal((await db.query('select aal::text from auth.sessions where id=$1',[receiver.session])).rows[0].aal,'aal2');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_inventory_consents where request_id=$1 and revoked_at is not null',[scope.requestID])).rows[0].n,0);
  await assert.rejects(status(scope,plan,AbortSignal.timeout(10000)),/Signed readback inventory consent/);
  // Kakei v2 must also refuse NEW transfer after actual factor enrollment,
  // despite the original bearer/session still being AAL2.
  await assert.rejects(budget.finish(),/Handoff authorization unconfirmed/);
  assert.equal(await budget.read(),null);
  assert.equal((await db.query('select owner_id from public.kb_households where id=$1',[budget.plan.householdID])).rows[0].owner_id,owner.user);
  cleanupEnabled=true;
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'pending'});
  assert.equal(removedSourcePaths.length,1);
  const stillOriginal=await admin.storage.from('ouchi-product-attachments').download(remainingSource.source.path);
  assert.equal(stillOriginal.error,null);assert.deepEqual(Buffer.from(await stillOriginal.data.arrayBuffer()),bytes);
  const removed=await receiver.client.auth.mfa.unenroll({factorId:additional.data.id});assert.equal(removed.error,null);
  assert.equal((await status(scope,plan,AbortSignal.timeout(10000))).state,'activated');
  // Restore the original factor inventory, reconstruct the reader, and resume:
  // absence readback skips the deleted prefix rather than removing it again.
  status=provider();cleanupEnabled=true;
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'complete',homeID});
  assert.equal(removedSourcePaths.length,2);assert.equal(new Set(removedSourcePaths).size,2);
  assert.equal(finishCalls,1);assert.equal(activations,2);assert.equal(preparations,1);
  for(const f of relocated){
   const missing=await admin.storage.from('ouchi-product-attachments').download(f.source.path);
   assert.equal(missing.data,null);assert.equal(missing.error?.code,'NoSuchKey');
  }
  for(const f of normalizeFamilyAttachmentPlan(plan).files){
   const kept=await admin.storage.from('ouchi-product-attachments').download(f.destination.path);
   assert.equal(kept.error,null);assert.deepEqual(Buffer.from(await kept.data.arrayBuffer()),bytes);
  }
  // A reconstructed reader reconciles the deliberately lost finish reply.
  // This is ONLY family file cleanup, not whole-account retirement.
  completion=completionProvider();
  assert.equal((await completion.status(scope,plan,AbortSignal.timeout(10000))).state,'complete');
  assert.equal((await db.query('select count(*)::int n from maintenance_private.family_attachment_completion_receipts where request_id=$1',[scope.requestID])).rows[0].n,1);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[nativeRequestID])).rows[0].state,'running');
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'complete',homeID});
  assert.equal(finishCalls,1);

  await db.query('update maintenance_private.family_attachment_inventory_consents set revoked_at=clock_timestamp() where request_id=$1 and home_id=$2 and actor_id=$3',[scope.requestID,homeID,receiver.user]);
  await assert.rejects(status(scope,plan,AbortSignal.timeout(10000)),/Signed readback inventory/);
  assert.equal(await historical(),true);
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'complete',homeID});assert.equal(activations,2);assert.equal(finishCalls,1);
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(plan.files[1].source.path)).error,null);
  assert.equal(removedSourcePaths.length,2);
  assert.equal((await owner.client.auth.getUser()).data.user.id,owner.user);assert.equal((await receiver.client.auth.getUser()).data.user.id,receiver.user);
  // All remote copy/removal/GoTrue work above is independently committed.
  // This final controller SQL checkpoint never performs remote side effects.
  await db.query(readFileSync('tests/fixtures/shared-family-stage-store.sql','utf8'));
  const frozenTargets=[{scope,plan:normalizeFamilyAttachmentPlan(plan)}],coverageDigest=sharedFamilyCoverageDigest(frozenTargets,controllerScope);
  const otherFamilies=createOtherAppFamilyVerifier({verifyControllerCoverage:async(tx,current,signal)=>{
   assert.deepEqual(current.apps,controllerScope.apps);return controllerCurrent(tx,scope,normalizeFamilyAttachmentPlan(plan),signal);
  },verifiers:{kakei:budget.verify}}); // every declared app has an independently checked contribution
  const checkpoint=createSharedFamilyStageStore({verifyReadAuthority:(tx,s,signal)=>{assert.deepEqual(s,controllerScope);return controllerCurrent(tx,scope,normalizeFamilyAttachmentPlan(plan),signal);},loadValidatedTargets:async(tx,s,digest,signal)=>{
   assert.deepEqual(s.apps,controllerScope.apps);assert.equal(await otherFamilies(tx,s,signal),true); // no unverified other app in this isolated fixture
   assert.equal(digest,coverageDigest);assert.equal(await committedHousehold(tx,scope,signal),true);
   return frozenTargets;
  }});
  const unsignedSignal=AbortSignal.timeout(10000);
  await assert.rejects(transaction(tx=>checkpoint.record(tx,controllerScope,coverageDigest,unsignedSignal),unsignedSignal));
  assert.equal((await db.query("select receipts ? 'handoff-family' as present from private.kb_shared_deletion_journal where request_id=$1",[controllerScope.requestID])).rows[0].present,false);
  assert.equal(await budget.read(),null);
  // A factor change inside the successful transfer transaction must still
  // fail its current-auth COMMIT check; all transfer/context/receipt effects
  // and this synthetic Auth mutation roll back together.
  await assert.rejects(budget.finish({afterCompletion:async tx=>{
   assert.equal((await tx.query('update auth.mfa_factors set friendly_name=$1 where id=$2 and user_id=$3 returning id',['Synthetic Kakei late factor mutation',totpFactors.get(receiver.user),receiver.user])).rowCount,1);
  }}),/Current transaction verification required before COMMIT/);
  assert.equal(await budget.read(),null);
  assert.equal((await db.query('select owner_id from public.kb_households where id=$1',[budget.plan.householdID])).rows[0].owner_id,owner.user);
  assert.equal((await db.query('select count(*)::int n from private.kb_shared_family_completion_contexts')).rows[0].n,0);
  assert.equal((await db.query('select friendly_name from auth.mfa_factors where id=$1',[totpFactors.get(receiver.user)])).rows[0].friendly_name,'Synthetic atomic handoff authenticator');
  // An unexpired bearer must not authorize COMMIT after its authoritative
  // GoTrue session expires in the same transaction. Restoration includes the
  // original session deadline as well as owner/member/context/receipt state.
  const originalSession=(await db.query('select not_after from auth.sessions where id=$1 and user_id=$2',[receiver.session,receiver.user])).rows[0];
  assert.ok(originalSession);
  await assert.rejects(budget.finish({afterCompletion:async tx=>{
   assert.equal((await tx.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1 and user_id=$2 returning id",[receiver.session,receiver.user])).rowCount,1);
  }}),/Current transaction verification required before COMMIT/);
  assert.equal(await budget.read(),null);
  assert.equal((await db.query('select owner_id from public.kb_households where id=$1',[budget.plan.householdID])).rows[0].owner_id,owner.user);
  assert.equal((await db.query('select count(*)::int n from private.kb_shared_family_completion_contexts')).rows[0].n,0);
  assert.deepEqual((await db.query('select not_after from auth.sessions where id=$1 and user_id=$2',[receiver.session,receiver.user])).rows[0],originalSession);
  // Kakei transfer + signed completion commit in their own dedicated SQL tx.
  // No Storage/GoTrue mutation belongs inside this budget transaction;
  // bounded GoTrue identity reads plus current DB Auth pins are mandatory.
  await assert.rejects((async()=>{await budget.finish();throw Error('Committed Kakei completion reply lost');})(),/reply lost/);
  const signedBudget=await budget.read();assert.equal(signedBudget.durable,true);
  await db.query('update private.kb_shared_handoff_proofs set revoked_at=clock_timestamp() where request_id=$1 and actor_id=$2',[controllerScope.requestID,receiver.user]);
  assert.deepEqual(await budget.read(),signedBudget);
  const logout=await receiver.client.auth.signOut({scope:'local'});assert.equal(logout.error,null);
  assert.equal(await historical(),true);
  assert.equal((await completionProvider().status(scope,plan,AbortSignal.timeout(10000))).state,'complete');
  assert.deepEqual(await handoffFamilyAttachments(scope,ports,new AbortController().signal),{state:'complete',homeID});assert.equal(finishCalls,1);
  assert.deepEqual(await budget.read(),signedBudget);
  // A completed fact remains readable after logout; it does not create any
  // new transfer authority. Revocation above must never erase that fact.
  const failedSignal=AbortSignal.timeout(10000);
  await assert.rejects(transaction(async tx=>{
   await checkpoint.record(tx,controllerScope,coverageDigest,failedSignal);
   await tx.query("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[controllerScope.requestID]);
  },failedSignal),/checkpoint lease|controller family checkpoint/i);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.shared_family_stage_contexts')).rows[0].n,0);
  assert.equal((await db.query("select receipts ? 'handoff-family' as present from private.kb_shared_deletion_journal where request_id=$1",[controllerScope.requestID])).rows[0].present,false);
  // Outer checkpoint failure cannot roll back already-committed family cleanup.
  assert.equal((await completionProvider().status(scope,plan,AbortSignal.timeout(10000))).state,'complete');
  for(const f of relocated){const missing=await admin.storage.from('ouchi-product-attachments').download(f.source.path);assert.equal(missing.data,null);assert.equal(missing.error?.code,'NoSuchKey');}
  for(const f of normalizeFamilyAttachmentPlan(plan).files){const kept=await admin.storage.from('ouchi-product-attachments').download(f.destination.path);assert.equal(kept.error,null);assert.deepEqual(Buffer.from(await kept.data.arrayBuffer()),bytes);}
  const retrySignal=AbortSignal.timeout(10000);
  await transaction(tx=>checkpoint.record(tx,controllerScope,coverageDigest,retrySignal),retrySignal);
  const readSignal=AbortSignal.timeout(10000);
  const globalReceipt=await transaction(tx=>checkpoint.read(tx,controllerScope,readSignal),readSignal);
  assert.equal(globalReceipt.stage,'handoff-family');assert.equal(globalReceipt.familyCoverageDigest,coverageDigest);assert.equal(globalReceipt.apps.length,2);
  assert.equal((await db.query('select count(*)::int n from private.kb_shared_family_completions')).rows[0].n,1);
  assert.equal((await db.query('select amount from public.kb_transactions')).rows[0].amount,200);
  const againSignal=AbortSignal.timeout(10000);await transaction(tx=>checkpoint.record(tx,controllerScope,coverageDigest,againSignal),againSignal);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.shared_family_stage_contexts')).rows[0].n,1);
  assert.equal(finishCalls,1);assert.equal(removedSourcePaths.length,2);
  assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[nativeRequestID])).rows[0].state,'running');
  for(const id of [ownFile,memberFile,secondOwnFile])await refused(await downloadWithToken(receiverToken,id));
  // Logout must not remove records, bytes or the GoTrue user itself.
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[receiver.user])).rows[0].n,1);
  assert.equal((await admin.storage.from('ouchi-product-attachments').download(`${receiver.user}/${receiver.epoch}/${ownFile}.png`)).error,null);
  await verifyDisposableSharedClosureMetadata({db,account,admin,origin,options,createAttachmentFetch,bytes,retainedPath:`${receiver.user}/${receiver.epoch}/${ownFile}.png`});
  await verifyDisposableSharedMaintenanceComposition({db,account,admin,origin,bytes,retainedPath:`${receiver.user}/${receiver.epoch}/${ownFile}.png`,dropAuthReplies});
 }finally{await db.end();}
}
