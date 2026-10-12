import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request as proxyRequest} from 'node:http';
import {randomUUID, createHmac, createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';

// Explicit opt-in, disposable local containers only. No configurable remote URL.
const sql = input => execFileSync('docker', ['compose', '-p', 'ouchi-identity-ci', '-f', 'tests/fixtures/auth/compose.yml', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'auth_test', '-v', 'ON_ERROR_STOP=1', '-At'], {input, encoding:'utf8', timeout:10000, stdio:['pipe','pipe','pipe']}).trim();
const uuid = value => { assert.match(value, /^[a-f0-9-]{36}$/i); return value; };
const ok = result => { assert.equal(result.error, null); return result.data; };

test('actual Auth and Storage preserve shared records on retirement refusal, while an unshared home can close', {skip:process.env.OUCHI_FAMILY_STORAGE_TEST !== 'true', timeout:60000}, async () => {
 const gateway = createServer((req,res) => {
  const prefix = ['/auth/v1/','/rest/v1/','/storage/v1/'].find(p => req.url?.startsWith(p));
  if (!prefix) { res.writeHead(404).end(); return; }
  const port = prefix === '/auth/v1/' ? 9999 : prefix === '/rest/v1/' ? 3002 : 5002;
  const upstream = proxyRequest('http://127.0.0.1:'+port+'/'+req.url.slice(prefix.length), {method:req.method,headers:req.headers}, response => { res.writeHead(response.statusCode ?? 502,response.headers); response.pipe(res); });
  upstream.on('error',() => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(upstream);
 });
 await new Promise((resolve,reject) => { gateway.once('error',reject); gateway.listen(54321,'127.0.0.1',resolve); });
 try {
  const options = {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init) => fetch(url,{...init,signal:init?.signal ?? AbortSignal.timeout(10000)})}};
  const origin = 'http://127.0.0.1:54321';
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const unsigned = encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:now,exp:now+300});
  const service = unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin = createClient(origin,service,options);
  async function account() {
   const client = createClient(origin,'synthetic-public-key',options);
   const result = await client.auth.signUp({email:'family-ci-'+randomUUID()+'@example.invalid',password:'Synthetic-'+randomUUID()});
   const data = ok(result); assert.ok(data.session);
   const user = uuid(data.user.id), session = uuid(JSON.parse(Buffer.from(data.session.access_token.split('.')[1],'base64url')).session_id), epoch = randomUUID();
   // Operator fixtures bind a real GoTrue session, but do not claim enrollment/MFA UI proof.
   sql(`begin;insert into maintenance_private.app_epochs values('${user}','${epoch}',true);insert into maintenance_private.account_access values('${user}',true);insert into maintenance_private.app_session_epochs values('${session}','${user}','${epoch}');commit;`);
   return {client,user,session,epoch};
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
  const bytes = Buffer.from('synthetic retained family warranty'), hash = createHash('sha256').update(bytes).digest('hex');
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
  // Separate unshared fixture; do not remove the family member to make deletion pass.
  const soloHome = randomUUID(); ok(await solo.client.from('homes').insert({id:soloHome,owner_id:solo.user,name:'Synthetic solo',kind:'home'}));
  const requestID = ok(await admin.rpc('request_maintenance_account_deletion',{target_user:solo.user,verified_session:solo.session,target_epoch:solo.epoch}));
  const claimed = ok(await admin.rpc('claim_maintenance_account_deletion')); assert.equal(claimed.requestID,requestID);
  const lease = {target_request:requestID,target_user:solo.user,target_epoch:solo.epoch,target_lease:claimed.leaseToken};
  assert.equal(ok(await admin.rpc('capture_maintenance_deletion_objects',lease)),true);
  assert.equal(ok(await admin.rpc('erase_maintenance_deletion_records',lease)),true);
  assert.equal(sql(`select count(*) from public.homes where id='${soloHome}';`),'0');
  assert.deepEqual(snapshot(),before); assert.equal(ok(await solo.client.auth.getUser()).user.id,solo.user);
  // No whole-account completion, Apple proof or shared Auth deletion is asserted.
 } finally { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); }
});
