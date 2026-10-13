import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request as proxyRequest} from 'node:http';
import {randomUUID, createHmac, createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {verifyDisposableHandoffMFA} from './fixtures/home-handoff-mfa.mjs';
import {verifyDisposableFamilyAttachmentStorage} from './fixtures/family-attachment-storage.mjs';
import {verifyDisposableFamilyAttachmentJournal} from './fixtures/family-attachment-journal.mjs';
import {verifyDisposableFamilyAttachmentAtomic} from './fixtures/family-attachment-atomic-services.mjs';
const modules = new Map();
function serverModule(name) {
 if (modules.has(name)) return modules.get(name);
 let source = ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source = source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency) => `from ${JSON.stringify(dependency.endsWith('.mjs') ? import.meta.resolve('../lib/'+dependency) : serverModule(dependency))}`);
 source = source.replace(/from ['"]([^.'"][^'"]+)['"]/g,(_,dependency) => `from ${JSON.stringify(import.meta.resolve(dependency))}`);
 const url = 'data:text/javascript;base64,'+Buffer.from(source).toString('base64'); modules.set(name,url); return url;
}
const {readAttachmentResponse} = await import(serverModule('attachment-read-handler'));
const {createAttachmentFetch} = await import(serverModule('attachment-fetch'));
const {createHomeHandoffIdentityVerifier,createHomeHandoffInventoryIdentityVerifier,createHomeHandoffInventoryActorVerifier} = await import(serverModule('home-handoff-identity'));
const {sessionAfterAuthVerification}=await import(serverModule('verified-app-session'));
const {createAccountClosureReviewTransactionPort}=await import(serverModule('account-closure-review-transaction'));
const {createAccountClosureReviewServer}=await import(serverModule('account-closure-review-server'));
const {createAccountClosureReviewPrivateTransactions}=await import(serverModule('account-closure-review-private-transactions'));
const {createClosureReauthenticationMaintenance}=await import(serverModule('closure-reauth-maintenance'));

// Explicit opt-in, disposable local containers only. No configurable remote URL.
const sql = input => execFileSync('docker', ['compose', '-p', 'ouchi-identity-ci', '-f', 'tests/fixtures/auth/compose.yml', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'auth_test', '-v', 'ON_ERROR_STOP=1', '-At'], {input, encoding:'utf8', timeout:10000, stdio:['pipe','pipe','pipe']}).trim();
const uuid = value => { assert.match(value, /^[a-f0-9-]{36}$/i); return value; };
const ok = result => { assert.equal(result.error, null); return result.data; };

test('actual Auth and Storage preserve family files, recover handoff acknowledgement loss, and isolate retirement', {skip:process.env.OUCHI_FAMILY_STORAGE_TEST !== 'true', timeout:120000}, async () => {
 let dropNextHandoffReply = false, handoffDecisionRequests = 0, revokeDuringDownload = null;
 const gateway = createServer((req,res) => {
  const prefix = ['/auth/v1/','/rest/v1/','/storage/v1/'].find(p => req.url?.startsWith(p));
  if (!prefix) { res.writeHead(404).end(); return; }
  const port = prefix === '/auth/v1/' ? 9999 : prefix === '/rest/v1/' ? 3002 : 5002;
  const decision = prefix === '/rest/v1/' && req.url.endsWith('/rpc/decide_maintenance_home_handoff');
  if (decision) handoffDecisionRequests++;
  const drop = decision && dropNextHandoffReply;
  if (drop) dropNextHandoffReply = false;
  const upstream = proxyRequest('http://127.0.0.1:'+port+'/'+req.url.slice(prefix.length), {method:req.method,headers:req.headers}, response => {
   if (prefix === '/storage/v1/' && req.method === 'GET' && revokeDuringDownload) {
    const revoke = revokeDuringDownload; revokeDuringDownload = null; revoke();
   }
   if (drop) { response.resume(); response.once('end',() => res.destroy()); }
   else { res.writeHead(response.statusCode ?? 502,response.headers); response.pipe(res); }
  });
  upstream.on('error',() => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream);
 });
 await new Promise((resolve,reject) => { gateway.once('error',reject); gateway.listen(54321,'127.0.0.1',resolve); });
 try {
  const options = {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch()}};
  const origin = 'http://127.0.0.1:54321';
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const unsigned = encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:now,exp:now+300});
  const service = unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin = createClient(origin,service,options);
  async function account() {
   const client = createClient(origin,'synthetic-public-key',options);
   const email='family-ci-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
   const result = await client.auth.signUp({email,password});
   const data = ok(result); assert.ok(data.session);
   const user = uuid(data.user.id), session = uuid(JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url')).session_id), epoch = randomUUID();
   // Operator fixtures bind a real GoTrue session, but do not claim enrollment/MFA UI proof.
   sql(`begin;insert into maintenance_private.app_epochs values('${user}','${epoch}',true);insert into maintenance_private.account_access values('${user}',true);insert into maintenance_private.app_session_epochs values('${session}','${user}','${epoch}');commit;`);
   return {client,user,session,epoch,email,password};
  }
  sql("update maintenance_private.enrollment_policy set require_explicit=true;");
  ok(await admin.storage.createBucket('ouchi-product-attachments',{public:false}));
  const owner = await account(), member = await account(), solo = await account();
  assert.equal(sql('select require_explicit from maintenance_private.enrollment_policy where id=1;'),'t');
  const home = randomUUID(), product = randomUUID(), task = randomUUID(), file = randomUUID();
  ok(await owner.client.from('homes').insert({id:home,owner_id:owner.user,name:'Synthetic family',kind:'home'}));
  ok(await owner.client.from('home_members').insert({homeId:home,user_id:member.user,nickname:'Synthetic member'}));
  ok(await owner.client.from('products').insert({id:product,homeId:home,categoryId:'air',name:'Synthetic family product'}));
  ok(await owner.client.from('maintenance_tasks').insert({id:task,productId:product,name:'Synthetic task',kind:'掃除',intervalDays:30,nextDueAt:'2030-01-01',sourceKind:'ユーザー設定'}));
  ok(await owner.client.from('maintenance_history').insert({taskId:task,productId:product,completedAt:'2026-01-01'}));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1EAAAAASUVORK5CYII=','base64'), hash = createHash('sha256').update(bytes).digest('hex');
  const identity = {target_user:owner.user,verified_session:owner.session,expected_epoch:owner.epoch};
  ok(await admin.rpc('reserve_maintenance_attachment',{...identity,target_product:product,attachment_id:file,byte_count:bytes.length,media_type:'image/png',measured_sha256:hash}));
  const attempt = randomUUID();
  ok(await admin.rpc('begin_maintenance_attachment_write',{...identity,target_attachment:file,target_attempt:attempt}));
  const path = `${owner.user}/${owner.epoch}/${file}.png`;
  ok(await admin.storage.from('ouchi-product-attachments').upload(path,bytes,{contentType:'image/png',upsert:false}));
  assert.equal(ok(await admin.rpc('settle_maintenance_attachment_write',{target_attachment:file,target_attempt:attempt})),true);
  ok(await admin.rpc('finalize_maintenance_attachment',{...identity,attachment_id:file,actual_bytes:bytes.length,verified_sha256:hash}));
  const snapshot = () => JSON.parse(sql(`select jsonb_build_object('home',(select to_jsonb(h) from public.homes h where id='${home}'),'members',(select jsonb_agg(to_jsonb(m) order by user_id) from public.home_members m where "homeId"='${home}'),'product',(select to_jsonb(p) from public.products p where id='${product}'),'task',(select to_jsonb(t) from public.maintenance_tasks t where id='${task}'),'history',(select jsonb_agg(to_jsonb(h)) from public.maintenance_history h where "taskId"='${task}'),'file',(select to_jsonb(f) from maintenance_private.product_attachments f where id='${file}'));`));
  const before = snapshot();
  const refused = await admin.rpc('request_maintenance_account_deletion',{target_user:owner.user,verified_session:owner.session,target_epoch:owner.epoch});
  assert.equal(refused.error?.code,'P0001'); assert.equal(refused.error?.message,'Family handoff required');
  assert.equal(sql(`select count(*) from maintenance_private.account_deletion_requests where user_id='${owner.user}';`),'0');
  const legacy = await owner.client.rpc('erase_maintenance_data'); assert.equal(legacy.error?.message,'Family handoff required');
  const direct = await owner.client.from('homes').delete().eq('id',home); assert.equal(direct.error?.message,'Family handoff required');
  assert.deepEqual(snapshot(),before);
  assert.equal(ok(await member.client.from('products').select('id').eq('id',product))[0]?.id,product);
  const retained = ok(await admin.rpc('read_maintenance_attachment',{target_user:member.user,verified_session:member.session,expected_epoch:member.epoch,attachment_id:file})); assert.equal(retained.id,file);
  const downloaded = ok(await admin.storage.from('ouchi-product-attachments').download(path)); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
  assert.equal(ok(await owner.client.auth.getUser()).user.id,owner.user); assert.equal(ok(await member.client.auth.getUser()).user.id,member.user);
  // The prepared download handler authenticates the member's exact bearer,
  // rechecks SQL membership after Storage and returns measured private bytes.
  async function memberDownload(account) {
   const session = ok(await account.client.auth.getSession()).session; assert.ok(session);
   return readAttachmentResponse(new Request(origin+'/api/attachments?attachmentId='+file,{headers:{authorization:'Bearer '+session.access_token}}),admin);
  }
  const memberFile = await memberDownload(member); assert.equal(memberFile.status,200);
  assert.equal(memberFile.headers.get('cache-control'),'no-store');
  assert.equal(memberFile.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await memberFile.arrayBuffer()),bytes);
  assert.ok((await member.client.storage.from('ouchi-product-attachments').download(path)).error,'private Storage requires the authorized server path');
  const unrelatedFile = await memberDownload(solo); assert.equal(unrelatedFile.status,404);
  assert.equal(unrelatedFile.headers.get('content-type'),'application/json');
  revokeDuringDownload = () => sql(`delete from public.home_members where "homeId"='${home}' and user_id='${member.user}';`);
  const revokedFile = await memberDownload(member); assert.equal(revokedFile.status,404);
  assert.equal(revokeDuringDownload,null,'membership was revoked during the actual object response');
  assert.equal(revokedFile.headers.get('content-type'),'application/json');
  ok(await owner.client.from('home_members').insert(before.members[0]));
  assert.deepEqual(snapshot(),before);
  const restoredMemberFile = await memberDownload(member); assert.equal(restoredMemberFile.status,200);
  assert.deepEqual(Buffer.from(await restoredMemberFile.arrayBuffer()),bytes);
  // Disabled-by-default handoff becomes enabled only in this disposable fixture.
  sql('update maintenance_private.home_handoff_policy set enabled=true;');
  const fileRequest = randomUUID();
  const fileScope = {target_request:fileRequest,target_home:home,...identity,target_recipient:member.user};
  const preparedFile = ok(await admin.rpc('request_maintenance_home_handoff',fileScope));
  const memberIdentity = {target_user:member.user,verified_session:member.session,expected_epoch:member.epoch};
  const fileDecision = await admin.rpc('decide_maintenance_home_handoff',{target_request:fileRequest,...memberIdentity,accept:true});
  assert.equal(fileDecision.error?.code,'P0001'); assert.equal(fileDecision.error?.message,'Attachment handoff required');
  assert.deepEqual(snapshot(),before);
  const cancelledFile = ok(await admin.rpc('decide_maintenance_home_handoff',{target_request:fileRequest,...identity,accept:false}));
  assert.equal(cancelledFile.state,'cancelled'); assert.equal(cancelledFile.expiresAt,preparedFile.expiresAt);
  assert.deepEqual(ok(await admin.rpc('decide_maintenance_home_handoff',{target_request:fileRequest,...identity,accept:false})),cancelledFile);
  // Independent attachment-free transfer; files are not removed to permit it.
  const transferOwner = await account(), successor = await account(), observer = await account();
  const transferHome = randomUUID(), transferProduct = randomUUID(), transferTask = randomUUID(), transferRequest = randomUUID();
  ok(await transferOwner.client.from('homes').insert({id:transferHome,owner_id:transferOwner.user,name:'Synthetic transfer',kind:'home'}));
  ok(await transferOwner.client.from('home_members').insert([{homeId:transferHome,user_id:successor.user,nickname:'Successor'},{homeId:transferHome,user_id:observer.user,nickname:'Other family'}]));
  ok(await transferOwner.client.from('products').insert({id:transferProduct,homeId:transferHome,categoryId:'air',name:'Retained product'}));
  ok(await transferOwner.client.from('maintenance_tasks').insert({id:transferTask,productId:transferProduct,name:'Retained task',kind:'掃除',intervalDays:30,nextDueAt:'2030-01-01',sourceKind:'ユーザー設定'}));
  ok(await transferOwner.client.from('maintenance_history').insert({taskId:transferTask,productId:transferProduct,completedAt:'2026-01-01'}));
  const transferSnapshot = () => JSON.parse(sql(`select jsonb_build_object('product',(select to_jsonb(p) from public.products p where id='${transferProduct}'),'task',(select to_jsonb(t) from public.maintenance_tasks t where id='${transferTask}'),'history',(select jsonb_agg(to_jsonb(h)) from public.maintenance_history h where "taskId"='${transferTask}'));`));
  const originalRecords = transferSnapshot();
  const transferIdentity = {target_user:transferOwner.user,verified_session:transferOwner.session,expected_epoch:transferOwner.epoch};
  const successorIdentity = {target_user:successor.user,verified_session:successor.session,expected_epoch:successor.epoch};
  assert.equal(ok(await transferOwner.client.auth.getUser()).user.id,transferOwner.user);
  await verifyDisposableHandoffMFA({account,sql,origin,options,createAttachmentFetch,createHomeHandoffIdentityVerifier,createHomeHandoffInventoryIdentityVerifier,createHomeHandoffInventoryActorVerifier});
  await verifyDisposableFamilyAttachmentStorage({account,admin,origin,service,options,bytes,createAttachmentFetch});
  await verifyDisposableFamilyAttachmentJournal({account,origin,bytes});
  const issued = ok(await admin.rpc('request_maintenance_home_handoff',{target_request:transferRequest,target_home:transferHome,...transferIdentity,target_recipient:successor.user}));
  assert.equal(issued.state,'pending');
  assert.deepEqual(ok(await admin.rpc('request_maintenance_home_handoff',{target_request:transferRequest,target_home:transferHome,...transferIdentity,target_recipient:successor.user})),issued);
  assert.ok((await successor.client.rpc('decide_maintenance_home_handoff',{target_request:transferRequest,...successorIdentity,accept:true})).error,'client role cannot assert a verified service identity');
  assert.equal(ok(await admin.rpc('read_maintenance_home_handoff',{target_request:transferRequest,target_user:observer.user,verified_session:observer.session,expected_epoch:observer.epoch})),null);
  assert.ok((await admin.rpc('decide_maintenance_home_handoff',{target_request:transferRequest,...transferIdentity,accept:true})).error,'owner cannot impersonate recipient consent');
  assert.equal(ok(await successor.client.auth.getUser()).user.id,successor.user);
  const sentBefore = handoffDecisionRequests;
  dropNextHandoffReply = true;
  const unknown = await admin.rpc('decide_maintenance_home_handoff',{target_request:transferRequest,...successorIdentity,accept:true}).retry(false).abortSignal(AbortSignal.timeout(5000));
  assert.ok(unknown.error,'lost successful response remains unconfirmed to the caller');
  assert.equal(handoffDecisionRequests,sentBefore+1,'no automatic mutation retry');
  const recovered = ok(await admin.rpc('read_maintenance_home_handoff',{target_request:transferRequest,...successorIdentity}));
  assert.equal(recovered.state,'completed'); assert.equal(recovered.expiresAt,issued.expiresAt);
  assert.equal(handoffDecisionRequests,sentBefore+1,'recovery is read-only');
  assert.deepEqual(transferSnapshot(),originalRecords);
  assert.equal(sql(`select owner_id from public.homes where id='${transferHome}';`),successor.user);
  assert.equal(ok(await successor.client.from('products').select('id').eq('id',transferProduct))[0]?.id,transferProduct);
  assert.equal(ok(await observer.client.from('products').select('id').eq('id',transferProduct))[0]?.id,transferProduct);
  assert.deepEqual(ok(await transferOwner.client.from('products').select('id').eq('id',transferProduct)),[],'former owner has no implicit membership');
  // A transfer receipt alone does not enqueue retirement or imply completion.
  assert.equal(sql(`select count(*) from maintenance_private.account_deletion_requests where user_id='${transferOwner.user}';`),'0');
  // Separate unshared fixture; do not remove the family member to make deletion pass.
  const soloHome = randomUUID(); ok(await solo.client.from('homes').insert({id:soloHome,owner_id:solo.user,name:'Synthetic solo',kind:'home'}));
  const requestID = ok(await admin.rpc('request_maintenance_account_deletion',{target_user:solo.user,verified_session:solo.session,target_epoch:solo.epoch}));
  const claimed = ok(await admin.rpc('claim_maintenance_account_deletion')); assert.equal(claimed.requestID,requestID);
  const lease = {target_request:requestID,target_user:solo.user,target_epoch:solo.epoch,target_lease:claimed.leaseToken};
  assert.equal(ok(await admin.rpc('capture_maintenance_deletion_objects',lease)),true);
  assert.equal(ok(await admin.rpc('erase_maintenance_deletion_records',lease)),true);
  assert.equal(sql(`select count(*) from public.homes where id='${soloHome}';`),'0');
  assert.deepEqual(snapshot(),before); assert.equal(ok(await solo.client.auth.getUser()).user.id,solo.user);
  const formerRequest = ok(await admin.rpc('request_maintenance_account_deletion',{target_user:transferOwner.user,verified_session:transferOwner.session,target_epoch:transferOwner.epoch}));
  const formerClaim = ok(await admin.rpc('claim_maintenance_account_deletion')); assert.equal(formerClaim.requestID,formerRequest);
  const formerLease = {target_request:formerRequest,target_user:transferOwner.user,target_epoch:transferOwner.epoch,target_lease:formerClaim.leaseToken};
  assert.equal(ok(await admin.rpc('capture_maintenance_deletion_objects',formerLease)),true);
  assert.equal(ok(await admin.rpc('erase_maintenance_deletion_records',formerLease)),true);
  assert.deepEqual(transferSnapshot(),originalRecords); assert.equal(sql(`select owner_id from public.homes where id='${transferHome}';`),successor.user);
  assert.equal(ok(await observer.client.from('products').select('id').eq('id',transferProduct))[0]?.id,transferProduct);
  assert.equal(ok(await transferOwner.client.auth.getUser()).user.id,transferOwner.user);
  // Runs LAST: composed private review fences must not alter preceding cases.
  await verifyDisposableFamilyAttachmentAtomic({account,admin,origin,service,options,bytes,createAttachmentFetch,readAttachmentResponse,createHomeHandoffInventoryIdentityVerifier,createHomeHandoffInventoryActorVerifier,sessionAfterAuthVerification,createAccountClosureReviewTransactionPort,createAccountClosureReviewServer,createAccountClosureReviewPrivateTransactions,createClosureReauthenticationMaintenance});
  // No whole-account completion, Apple proof or shared Auth deletion is asserted.
 } finally { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); }
});
