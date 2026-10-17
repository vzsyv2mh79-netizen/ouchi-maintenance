/** Isolated real GoTrue + SDK + restricted PostgreSQL + shipping runtime.
 * Host/TLS and Management policy are explicit local fixtures; no cloud access.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createClosureOperatorReview} from '../../lib/closure-operator-review.mjs';
import {createHouseholdCopy} from '../../lib/household-copy.mjs';
import {createDedicatedPostgresConnection} from '../../lib/dedicated-postgres-connection.mjs';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {Client} from 'pg';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
assert.equal(process.env.OUCHI_MANAGEMENT_AUTH_TEST,'true');
const dbPort=Number(process.env.OUCHI_TEST_DB_PORT),authPort=Number(process.env.OUCHI_TEST_AUTH_PORT);
assert.ok([dbPort,authPort].every(n=>Number.isInteger(n)&&n>1024&&n<65536));
const db=new Client({host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'auth_test'});
const projectID='abcdefghijklmnopqrst',authURL='https://'+projectID+'.supabase.co',origin='https://ouchi-maintenance.vercel.app';
const originalFetch=globalThis.fetch,modules=new Map();let userReads=0,configReads=0,healthReads=0;
const rolePassword='synthetic-management-ci-only';
function moduleURL(name){
 if(modules.has(name))return modules.get(name);
 if(name==='postgres-driver.mjs'){
  const source=`import {Client} from ${JSON.stringify(import.meta.resolve('pg'))};import assert from 'node:assert/strict';export function createPostgresClient(config){assert.equal(config.host,'db.${projectID}.supabase.co');assert.equal(config.user,'ouchi_home_management_runtime');assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.connectionTimeoutMillis,3000);assert.equal(config.query_timeout,5000);return new Client({host:'127.0.0.1',port:${dbPort},user:'ouchi_management_ci_login',password:${JSON.stringify(rolePassword)},database:'auth_test',connectionTimeoutMillis:config.connectionTimeoutMillis,query_timeout:config.query_timeout});}`;
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
 }
 if(name.endsWith('.mjs'))return import.meta.resolve('../../lib/'+name);
 let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');
 source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?moduleURL(dep.slice(2)):import.meta.resolve(dep)));
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;
}
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.href==='https://api.supabase.com/v1/projects/'+projectID+'/config/auth'){
  configReads++;assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-config-read-only');
  return Response.json({sessions_timebox:null,sessions_inactivity_timeout:null,sessions_single_per_user:false,mfa_totp_verify_enabled:true,mfa_phone_verify_enabled:false,mfa_web_authn_verify_enabled:false});
 }
 if(url.origin===authURL){
  assert.ok(url.pathname.startsWith('/auth/v1/'));if(url.pathname==='/auth/v1/user')userReads++;if(url.pathname==='/auth/v1/health')healthReads++;
  const response=await originalFetch('http://127.0.0.1:'+authPort+url.pathname.slice('/auth/v1'.length)+url.search,init);
  // Preserve shipping response endpoint checks while explicitly aliasing transport.
  return new Response(response.body,{status:response.status,headers:response.headers});
 }
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');return originalFetch(input,init);
};
let server;
try{
 await db.connect();
 const line=readFileSync('.github/workflows/billing-identity-migration.yml','utf8').split('\n').find(v=>v.trim().startsWith('for file in '));
 const paths=line.trim().slice('for file in '.length).split('; do')[0].split(' ');
 paths.push(...['20261014061605_ouchi_account_closure_review.sql','20261014061618_ouchi_closure_review_private_access.sql','20261014061630_ouchi_closure_reauth_markers.sql','20261014061641_ouchi_closure_reauth_lifecycle.sql','20261014064119_ouchi_closure_review_erasure.sql','20261014231227_ouchi_closure_actor_context_compatibility.sql','20261016114527_ouchi_closure_operator_review.sql','20261016115343_ouchi_reviewed_field_redaction.sql','20261016120051_ouchi_shared_member_closure_review.sql','20261016120728_ouchi_legacy_closure_review_scope.sql','20261016121802_ouchi_closure_field_inventory.sql','20261016123247_ouchi_closure_text_review_snapshot.sql','20261016131437_ouchi_ownerless_home_management.sql','20261016132410_ouchi_ownerless_management_status.sql','20261016142322_ouchi_home_management_private_access.sql','20261016143928_ouchi_ownerless_closure_review_scope.sql','20261016144216_ouchi_management_claim_erasure.sql','20261016144839_ouchi_closure_file_review_inventory.sql','20261016150215_ouchi_closure_file_review_decisions.sql','20261016151202_ouchi_household_attachment_custody.sql','20261016152254_ouchi_attachment_physical_budget.sql','20261016153743_ouchi_household_copy_intents.sql','20261016160108_ouchi_household_copy_write_journal.sql','20261016161923_ouchi_closure_household_file_review.sql','20261016162817_ouchi_review_coverage_snapshot.sql','20261016164313_ouchi_reviewed_retirement_boundary.sql','20261016165756_ouchi_verified_copy_classification.sql','20261016171009_ouchi_attachment_retirement_inventory.sql'].map(n=>'supabase/migrations/'+n));
 for(const path of paths)await db.query(readFileSync(path,'utf8'));
 const options={auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}};
 const signup=async()=>{
  const client=createClient(authURL,'sb_publishable_synthetic_runtime_fixture',options);
  const {data,error}=await client.auth.signUp({email:randomUUID()+'@example.invalid',password:randomUUID()+'aA7!'});assert.equal(error,null);assert.ok(data.session);
  const claims=JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url'));
  const actor={user:data.user.id,session:claims.session_id,epoch:randomUUID(),bearer:data.session.access_token};assert.ok(actor.session);
  await db.query('insert into maintenance_private.app_epochs values($1,$2,true)',[actor.user,actor.epoch]);
  await db.query('insert into maintenance_private.account_access values($1,true)',[actor.user]);
  await db.query('insert into maintenance_private.app_session_epochs values($1,$2,$3)',[actor.session,actor.user,actor.epoch]);return actor;
 };
 const old=await signup(),member=await signup(),stranger=await signup(),home=randomUUID(),product=randomUUID();
 await db.query('update maintenance_private.enrollment_policy set require_explicit=true');
 await db.query('insert into public.homes(id,owner_id) values($1,$2)',[home,old.user]);
 await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$3)',[home,member.user,'Synthetic member']);
 await db.query('insert into public.products(id,"homeId","categoryId",name) values($1,$2,$3,$4)',[product,home,'air','Synthetic appliance']);
 await db.query('update public.homes set owner_id=null where id=$1',[home]);
 await db.query('update maintenance_private.ownerless_home_policy set enabled=true');
 await db.query(`create role ouchi_management_ci_login login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${rolePassword}';grant ouchi_home_management_executor to ouchi_management_ci_login`);
 const probe=new Client({host:'127.0.0.1',port:dbPort,user:'ouchi_management_ci_login',password:rolePassword,database:'auth_test'});await probe.connect();
 try{await assert.rejects(probe.query('select * from auth.users'),/permission denied/);await assert.rejects(probe.query('select * from public.products'),/permission denied/);}finally{await probe.end();}
 const {createOwnerlessHomeManagementRuntime}=await import(moduleURL('ownerless-home-management-runtime'));
 const config={projectID,authURL,publishableKey:'sb_publishable_synthetic_runtime_fixture',accessToken:'synthetic-config-read-only',role:'ouchi_home_management_runtime',origin,database:{host:'db.'+projectID+'.supabase.co',port:5432,database:'postgres',user:'ouchi_home_management_runtime',password:'synthetic-runtime-only',ssl:{rejectUnauthorized:true},application_name:'ouchi-home-management'}};
 const handle=createOwnerlessHomeManagementRuntime(config);let drop=false,droppedCommitted=false;
 server=createServer(async(req,res)=>{
  const abort=new AbortController();req.once('aborted',()=>abort.abort());res.once('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
   const request=new Request(origin+req.url,{method:req.method,headers:req.headers,signal:abort.signal,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const response=await handle(request),body=Buffer.from(await response.arrayBuffer());
   if(drop&&req.method==='POST'&&response.status===200){drop=false;droppedCommitted=true;res.destroy();return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);
  }catch{if(!res.destroyed)res.writeHead(500).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port+'/api/family/management/'+home;
 const send=(actor,method='GET',payload,query='')=>fetch(base+query,{method,headers:{authorization:'Bearer '+actor.bearer,'x-ouchi-app-epoch':actor.epoch,'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(10000),redirect:'error'});
 const cases=[];
 const householdFile=randomUUID(),householdBytes=Buffer.from('%PDF-1.7\nHousehold fixture only\n');
 const homeInstance=(await db.query('select instance_id from maintenance_private.closure_home_instances where home_id=$1',[home])).rows[0].instance_id;
 // Synthetic activated metadata, not a verified copy or production activator.
 await db.query("insert into maintenance_private.household_attachments(id,home_id,home_instance_id,product_id,size_bytes,mime,sha256,state) values($1,$2,$3,$4,$5,'application/pdf',$6,'active')",[householdFile,home,homeInstance,product,householdBytes.length,createHash('sha256').update(householdBytes).digest('hex')]);
 await db.query('set role service_role');
 const householdArgs=[member.user,member.session,member.epoch,householdFile];
 const retained=(await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) value',householdArgs)).rows[0].value;
 assert.equal(retained.objectPath,`households/${homeInstance}/${householdFile}.pdf`);assert.equal(JSON.stringify(retained).includes(old.user),false);
 assert.equal((await db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) value',[old.user,old.session,old.epoch,householdFile])).rows[0].value,null);
 await assert.rejects(db.query("update maintenance_private.household_attachments set state='active'"),/permission denied/);await db.query('reset role');
 cases.push('real service-only household metadata read uses incarnation path independent of uploader, allows existing family in ownerless home and denies outsider/activation writes; active metadata is privileged fixture only');
 const capacitySQL='select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4) claim_id',sourceCapacity=[randomUUID(),`${old.user}/${old.epoch}/${randomUUID()}.pdf`,12,'upload'];
 await db.query('set role service_role');await assert.rejects(db.query(capacitySQL,sourceCapacity),/budget unavailable/);await db.query('reset role');
 // Explicit synthetic allocation/coverage fixture, never approval of live capacity.
 await db.query('update maintenance_private.attachment_app_budget_policy set budget_bytes=24,writer_coverage_verified=true,enabled=true');
 await db.query('set role service_role');await db.query(capacitySQL,sourceCapacity);await db.query(capacitySQL,sourceCapacity);await db.query('reset role');
 const holder=new Client({host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'auth_test',query_timeout:5000}),competitor=new Client({host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'auth_test',application_name:'ouchi_budget_competitor',query_timeout:5000});
 await holder.connect();await competitor.connect();let waitingCopy;
 try{
  await holder.query('begin');await holder.query('set local role service_role');await holder.query(capacitySQL,[randomUUID(),`households/${homeInstance}/${randomUUID()}.pdf`,12,'household-copy']);
  await competitor.query('set role service_role');waitingCopy=competitor.query(capacitySQL,[randomUUID(),`households/${homeInstance}/${randomUUID()}.pdf`,12,'household-copy']);void waitingCopy.catch(()=>{});
  let waited=false;for(let attempt=0;attempt<50;attempt++){waited=(await db.query("select exists(select 1 from pg_stat_activity where application_name='ouchi_budget_competitor' and wait_event_type='Lock') waiting")).rows[0].waiting;if(waited)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(waited,true);await holder.query('commit');await assert.rejects(waitingCopy,/budget exceeded/);
  assert.equal((await db.query('select sum(size_bytes)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,24);assert.equal((await db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);
  cases.push('actual competing capacity connections serialize: second genuinely waits, then refuses oversubscription; original plus household copy charged independently and exact retry does not double-count; no physical write permission');
 }finally{await holder.end();await competitor.end();}


 const result=await send(member);assert.equal(result.status,200);const state=await result.json();assert.equal(state.canClaim,true);cases.push('real GoTrue exact bearer plus health/policy and restricted SQL reads current ownerless status');
 assert.equal((await send(stranger)).status,503);cases.push('nonmember with valid real Auth session cannot access or claim this home');
 const requestID=randomUUID(),payload={requestID,generation:state.generation,confirmation:'CLAIM_HOME_MANAGEMENT'};
 drop=true;await assert.rejects(send(member,'POST',payload));assert.equal(droppedCommitted,true);
 assert.equal((await db.query('select owner_id from public.homes where id=$1',[home])).rows[0].owner_id,member.user);
 const receipt=await send(member,'GET',undefined,'?requestID='+requestID+'&generation='+state.generation);assert.equal(receipt.status,200);assert.equal((await receipt.json()).state,'claimed');cases.push('actual COMMIT followed by dropped HTTP reply recovers same account/epoch/request receipt with GET only');
 await db.query('update public.products set memo=$2 where id=$1',[product,'Later family edit']);
 assert.equal((await send(member,'POST',payload)).status,200);assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims')).rows[0].n,1);assert.equal((await db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'Later family edit');cases.push('exact retry keeps one receipt and preserves later family edits');
 await db.query('delete from auth.sessions where id=$1',[member.session]);assert.equal((await send(member)).status,503);assert.equal((await send(member,'POST',payload)).status,403);cases.push('revoked real session cannot read management status or repeat a claim');
 assert.ok(userReads>=8&&configReads>0&&healthReads>0);assert.equal((await db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 // Operator intake row/metadata are explicit fixtures; no bytes or actual
 // customer request is manufactured by this verification.
 const review=randomUUID(),fileID=randomUUID();
 await db.query('insert into public.home_members("homeId",user_id,nickname) values($1,$2,$4),($1,$3,$5)',[home,old.user,stranger.user,'Synthetic returning member','Synthetic remaining member']);
 await db.query('insert into maintenance_private.account_closure_reviews(review_request_id,user_id,app_epoch_id,submission_id) values($1,$2,$3,$4)',[review,member.user,member.epoch,randomUUID()]);
 await db.query('insert into maintenance_private.closure_operator_principals values(session_user,true)');
 await db.query("insert into maintenance_private.product_attachments(id,user_id,app_epoch_id,product_id,size_bytes,mime,state,captured_owner_id) values($1,$2,$3,$4,12,'application/pdf','reserved',$2)",[fileID,old.user,old.epoch,product]);
 await db.query('set role ouchi_closure_operator');
 const files=(await db.query('select * from maintenance_private.closure_review_file_inventory($1,$2,$3,null)',[review,member.user,member.epoch])).rows;assert.equal(files.length,1);assert.equal(files[0].attachment_id,fileID);
 const fileArgs=[review,member.user,member.epoch,fileID,files[0].metadata_digest];
 const descriptor=(await db.query('select maintenance_private.read_closure_review_file($1,$2,$3,$4,$5) receipt',fileArgs)).rows[0].receipt;assert.equal(descriptor.file.subjectConfirmed,false);assert.equal(descriptor.accountErasureConfirmed,false);
 await db.query('reset role');await db.query('update maintenance_private.product_attachments set removal_pending=true where id=$1',[fileID]);await db.query('set role ouchi_closure_operator');
 await assert.rejects(db.query('select maintenance_private.read_closure_review_file($1,$2,$3,$4,$5)',fileArgs),/File metadata changed/);
 await db.query('reset role');
 const contentBytes=Buffer.from('%PDF-1.7\nSynthetic file review only\n'),contentHash=createHash('sha256').update(contentBytes).digest('hex');
 await db.query("update maintenance_private.product_attachments set size_bytes=$2,state='stored',sha256=$3,expected_sha256=$3,write_tracking=true,removal_pending=false where id=$1",[fileID,contentBytes.length,contentHash]);
 await db.query("insert into maintenance_private.attachment_write_attempts(attachment_id,attempt_id,uploader_id,owner_id,app_epoch_id,state,settled_at) values($1,$2,$3,$3,$4,'settled',clock_timestamp())",[fileID,randomUUID(),old.user,old.epoch]);
 await db.query("create role ouchi_file_operator_ci_login login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-file-review-ci-only';grant ouchi_closure_operator to ouchi_file_operator_ci_login;insert into maintenance_private.closure_operator_principals values('ouchi_file_operator_ci_login',true)");
 const operatorConnect=createDedicatedPostgresConnection({createClient:bounds=>new Client({...bounds,host:'127.0.0.1',port:dbPort,user:'ouchi_file_operator_ci_login',password:'synthetic-file-review-ci-only',database:'auth_test'})});
 const connectAsOperator=async opts=>{const connection=await operatorConnect(opts);return {...connection,query:async(sql,args)=>{const result=await connection.query(sql,args);if(sql==='BEGIN')await connection.query('set local role ouchi_closure_operator');return result;}};};
 const revoker=new Client({host:'127.0.0.1',port:dbPort,user:'postgres',password:'synthetic-ci-only',database:'auth_test',application_name:'ouchi_operator_revoke_probe',query_timeout:5000});await revoker.connect();
 let revoked,observedWait=false;
 try{
  const operator=createClosureOperatorReview({connect:connectAsOperator,readFileBytes:async()=>{
   revoked=revoker.query("update maintenance_private.closure_operator_principals set enabled=false where principal='ouchi_file_operator_ci_login'");
   // Attach rejection immediately; lock observation must precede file return.
   void revoked.catch(()=>{});
   for(let attempt=0;attempt<50;attempt++){
    observedWait=(await db.query("select exists(select 1 from pg_stat_activity where application_name='ouchi_operator_revoke_probe' and wait_event_type='Lock') waiting")).rows[0].waiting;
    if(observedWait)break;await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.equal(observedWait,true);return new Blob([contentBytes],{type:'application/pdf'});
  }});
  const fileInput={reviewRequestID:review,userID:member.user,epochID:member.epoch,afterFile:null};
  const current=(await operator.fileInventory(fileInput,new AbortController().signal)).items[0];
  const inspectionInput={inspectionID:randomUUID(),reviewRequestID:review,userID:member.user,epochID:member.epoch,fileID,expectedMetadataDigest:current.metadata_digest};
  const inspected=await operator.inspectFile(inspectionInput,new AbortController().signal);assert.equal(inspected.sha256,contentHash);assert.equal(inspected.familyRetentionApproved,false);assert.equal(inspected.subjectConfirmed,false);
  await revoked;await assert.rejects(operator.inspectFile(inspectionInput,new AbortController().signal),/Authorized operator/);
  await db.query("update maintenance_private.closure_operator_principals set enabled=true where principal='ouchi_file_operator_ci_login'");
  const decisionInput={decisionID:randomUUID(),inspectionID:inspected.inspectionID,reviewRequestID:review,userID:member.user,epochID:member.epoch,fileID,action:'needs_review',evidenceDigest:'a'.repeat(64),confirmation:'REQUIRE_ADDITIONAL_FILE_REVIEW'};
  await operator.recordFileDecision(decisionInput,new AbortController().signal);
  const replacement={...decisionInput,decisionID:randomUUID(),action:'erase_personal_file',confirmation:'ERASE_REVIEWED_PERSONAL_FILE'};
  await operator.recordFileDecision(replacement,new AbortController().signal);await operator.recordFileDecision(decisionInput,new AbortController().signal);
  const currentDecision=await operator.readFileDecision({reviewRequestID:review,userID:member.user,epochID:member.epoch,fileID,expectedMetadataDigest:current.metadata_digest},new AbortController().signal);
  assert.equal(currentDecision.decisionID,replacement.decisionID);assert.equal(currentDecision.current,true);assert.equal(currentDecision.familyRetentionExecuted,false);assert.equal(currentDecision.accountErasureConfirmed,false);
  assert.equal((await db.query('select count(*)::int n from maintenance_private.closure_file_decisions where review_request_id=$1',[review])).rows[0].n,2);
  cases.push('actual private SQL inspection and decision receipts are durable/idempotent; older retry preserves latest decision and never executes file erasure or retention');

  cases.push('actual restricted operator connection pins enabled authority through content inspection COMMIT; concurrent revocation genuinely waits, then prevents the next read; bytes are explicit fixture, no Storage claim');
 }finally{await revoker.end();}
 await db.query('delete from maintenance_private.account_closure_reviews where review_request_id=$1',[review]);
 cases.push('real restricted operator SQL inventories household file metadata, refuses stale digest after mutation, and makes no content-subject or erasure claim');
 // Explicit privileged fixture preparation, NOT a shipping retirement dispatcher.
 const deletion=randomUUID(),executionLease=randomUUID();
 await db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until,records_erased,inventory_captured) values($1,$2,$3,'running',$4,clock_timestamp()+interval '10 minutes',true,true)",[deletion,member.user,member.epoch,executionLease]);
 const eraseArgs=[deletion,member.user,member.epoch,executionLease];
 const erase=async args=>(await db.query('select public.erase_maintenance_deletion_management_claims($1,$2,$3,$4) value',args)).rows[0].value;
 await db.query('set role service_role');assert.equal(await erase(eraseArgs),false);
 await db.query('reset role');await db.query('update public.homes set owner_id=null where id=$1',[home]);await db.query('delete from public.home_members where user_id=$1',[member.user]);
 await db.query('update maintenance_private.app_epochs set enabled=false where user_id=$1',[member.user]);await db.query('update maintenance_private.account_access set enabled=false where user_id=$1',[member.user]);
 await db.query('set role service_role');assert.equal(await erase([...eraseArgs.slice(0,3),randomUUID()]),false);assert.equal(await erase(eraseArgs),true);assert.equal(await erase(eraseArgs),true);
 await assert.rejects(db.query('delete from maintenance_private.ownerless_home_claims'),/permission denied/);
 await db.query('reset role');assert.equal((await db.query('select count(*)::int n from maintenance_private.ownerless_home_claims where user_id=$1',[member.user])).rows[0].n,0);
 assert.equal((await db.query('select memo from public.products where id=$1',[product])).rows[0].memo,'Later family edit');assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[member.user])).rows[0].n,1);
 assert.equal((await db.query('select state from maintenance_private.account_deletion_requests where id=$1',[deletion])).rows[0].state,'running');
 cases.push('real service-role RPC removes only retired actor management metadata after exact lease and household role resolution; family record and shared Auth remain, job not marked complete');

 // Copy-only integration with actual private SQL; bytes remain a synthetic
 // transport map. No managed Storage copy/activation or source removal proof.
 await db.query('update maintenance_private.account_closure_review_policy set enabled=true');await db.query('update maintenance_private.attachment_app_budget_policy set budget_bytes=4096');
 const oldVerified=await createClient(authURL,'sb_publishable_synthetic_runtime_fixture',options).auth.getUser(old.bearer);assert.equal(oldVerified.data.user.id,old.user);
 await db.query('set role service_role');const copySubmission=randomUUID(),copyReview=(await db.query('select public.request_maintenance_closure_review($1,$2,$3,$4) receipt',[old.user,old.session,old.epoch,copySubmission])).rows[0].receipt.reviewRequestID;await db.query('reset role');
 const copyScope={reviewRequestID:copyReview,userID:old.user,epochID:old.epoch},copyOperator=createClosureOperatorReview({connect:connectAsOperator,readFileBytes:async()=>new Blob([contentBytes],{type:'application/pdf'})});
 const copyRow=(await copyOperator.fileInventory({...copyScope,afterFile:null},new AbortController().signal)).items.find(f=>f.attachment_id===fileID);
 const copyInspection=await copyOperator.inspectFile({...copyScope,fileID,inspectionID:randomUUID(),expectedMetadataDigest:copyRow.metadata_digest},new AbortController().signal),copyDecision=randomUUID();
 await copyOperator.recordFileDecision({...copyScope,fileID,inspectionID:copyInspection.inspectionID,decisionID:copyDecision,action:'retain_family_copy',evidenceDigest:'a'.repeat(64),confirmation:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'},new AbortController().signal);
 await db.query('select maintenance_private.reserve_attachment_capacity($1,$2,$3,$4)',[randomUUID(),`${old.user}/${old.epoch}/${fileID}.pdf`,contentBytes.length,'upload']);
 const copiedObjects=new Map();let actualCopyWrites=0;const copyPort=createHouseholdCopy({connect:connectAsOperator,storage:{inspectDestination:async m=>copiedObjects.get(m.destination.objectPath)??null,readSource:async()=>new Blob([contentBytes],{type:'application/pdf'}),writeDestination:async(m,blob)=>{assert.equal(copiedObjects.has(m.destination.objectPath),false);actualCopyWrites++;copiedObjects.set(m.destination.objectPath,blob);}}});
 const copyInput={...copyScope,intentID:randomUUID(),decisionID:copyDecision,fileID,destinationID:randomUUID()},copyOperation={...copyScope,intentID:copyInput.intentID};
 await copyPort.prepare(copyInput,new AbortController().signal);
 // Independent, least-privileged SQL connections compete for one immutable
 // issuance. Neither fixture dispatches I/O; only the winner can report that.
 const writerConfig={host:'127.0.0.1',port:dbPort,user:'ouchi_file_operator_ci_login',password:'synthetic-file-review-ci-only',database:'auth_test',query_timeout:5000};
 const writerA=new Client(writerConfig),writerB=new Client({...writerConfig,application_name:'ouchi_copy_writer_competitor'});
 await writerA.connect();await writerB.connect();
 const attempt=randomUUID(),nonce=randomUUID(),writerArgs=[copyInput.intentID,copyReview,old.user,old.epoch],issueSQL='select maintenance_private.issue_household_copy_write($1,$2,$3,$4,$5,$6) receipt';
 let waitingWriter;
 try{
  await writerA.query('begin');await writerA.query('set local role ouchi_closure_operator');
  assert.equal((await writerA.query(issueSQL,[...writerArgs,attempt,nonce])).rows[0].receipt.issued,true);
  await writerB.query('set role ouchi_closure_operator');waitingWriter=writerB.query(issueSQL,[...writerArgs,randomUUID(),randomUUID()]);void waitingWriter.catch(()=>{});
  let waited=false;for(let probe=0;probe<50;probe++){waited=(await db.query("select exists(select 1 from pg_stat_activity where application_name='ouchi_copy_writer_competitor' and wait_event_type='Lock') waiting")).rows[0].waiting;if(waited)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(waited,true);await writerA.query('commit');assert.equal((await waitingWriter).rows[0].receipt.issued,false);
  await writerA.query('set role ouchi_closure_operator');assert.equal((await writerA.query(issueSQL,[...writerArgs,attempt,nonce])).rows[0].receipt.issued,false);
  assert.equal((await copyPort.copy(copyOperation,new AbortController().signal)).state,'pending');assert.equal(actualCopyWrites,0);
  assert.equal((await writerA.query('select maintenance_private.record_household_copy_write_fact($1,$2,$3,$4,$5,$6,$7) recorded',[...writerArgs,attempt,nonce,'not_dispatched'])).rows[0].recorded,true);
  cases.push('real concurrent restricted operator connections serialize one writer issuance; loser and exact retry never remint permission; issued writer blocks coordinator POST until factual no-dispatch callback');
 }finally{await writerA.end();await writerB.end();if(waitingWriter)await waitingWriter.catch(()=>{});}
 const verifiedCopy=await copyPort.copy(copyOperation,new AbortController().signal);assert.equal(verifiedCopy.state,'copy_verified');assert.equal(verifiedCopy.activationConfirmed,false);await copyPort.copy(copyOperation,new AbortController().signal);assert.equal(actualCopyWrites,1);
 assert.equal((await db.query('select state from maintenance_private.household_attachments where id=$1',[copyInput.destinationID])).rows[0].state,'staged');await assert.rejects(db.query('update maintenance_private.product_attachments set removal_pending=true where id=$1',[fileID]),/Pending household copy/);
 await db.query('set role service_role');await db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[old.user,old.session,old.epoch,copySubmission]);await db.query('reset role');assert.equal((await copyPort.status(copyOperation,new AbortController().signal)).state,'copy_verified');
 cases.push('actual private copy intent/capacity commits precede synthetic byte copy; destination hash checked, repeat avoids second write, staged file stays hidden, source mutation refused and receipt survives cancellation; no real Storage/activation/source removal');
 console.log(JSON.stringify({status:'passed',passed:cases.length,cases,userReads,configReads,healthReads,limitations:['local Auth host and DB transport aliases; not managed TLS or deployed login role','Management policy is an explicit synthetic read-only fixture','no retirement dispatcher or Storage integration','no production, Apple purchase or publication changes']}));
}finally{if(server)await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;await db.end();}
