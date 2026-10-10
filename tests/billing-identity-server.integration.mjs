import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as proxyRequest} from 'node:http';
import {randomUUID,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
test('actual additive migration preserves unbound household access and rejects stale purchase sessions',{skip:process.env.OUCHI_IDENTITY_MIGRATION_TEST!=='true',timeout:60000},async()=>{
 const gateway=createServer((request,response)=>{
  const auth=request.url?.startsWith('/auth/v1/'),rest=request.url?.startsWith('/rest/v1/');
  if(!auth&&!rest){response.writeHead(404).end();return;}
  const upstream=proxyRequest((auth?'http://127.0.0.1:9999':'http://127.0.0.1:3002')+request.url.slice(8),{method:request.method,headers:request.headers},result=>{response.writeHead(result.statusCode??502,result.headers);result.pipe(response);});
  upstream.on('error',()=>response.writeHead(502).end());request.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(54321,'127.0.0.1',resolve);});
 try{
  const options={auth:{persistSession:false,autoRefreshToken:false}},origin='http://127.0.0.1:54321';
  const user=createClient(origin,'synthetic-public-key',options),email='identity-'+randomUUID()+'@example.invalid',password='Synthetic-'+randomUUID();
  const signup=await user.auth.signUp({email,password});assert.equal(signup.error,null);assert.ok(signup.data.session);
  const id=signup.data.user.id,claims=JSON.parse(Buffer.from(signup.data.session.access_token.split('.')[1],'base64url'));
  const home=randomUUID();assert.equal((await user.from('homes').insert({id:home,owner_id:id,name:'Synthetic migration home',kind:'home'})).error,null);
  const before=await user.rpc('load_household');assert.equal(before.error,null);assert.ok(before.data.homes.some(row=>row.id===home));
  assert.ok((await user.rpc('current_maintenance_purchase_account',{target_user:id,verified_session:claims.session_id})).error);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
  const service=unsigned+'.'+createHmac('sha256','synthetic-isolated-ci-only-jwt-secret-never-use-in-production').update(unsigned).digest('base64url');
  const admin=createClient(origin,service,options),bind=session=>admin.rpc('current_maintenance_purchase_account',{target_user:id,verified_session:session});
  const binding=await bind(claims.session_id);assert.equal(binding.error,null);assert.ok(binding.data);assert.notEqual(binding.data,id);assert.equal((await bind(claims.session_id)).data,binding.data);
  // Synthetic normalized events only; no Apple signature or purchase claimed.
  const event={environment:'Sandbox',transactionId:'100',originalTransactionId:'10',accountToken:binding.data,productId:'ouchi.premium.monthly',signedAt:100,purchasedAt:50,expiresAt:200};
  const write=payload=>admin.rpc('apply_maintenance_verified_transaction',{payload,proof_sha256:'a'.repeat(64)});
  const first=await write(event);assert.equal(first.error,null);assert.equal(first.data,'inserted');assert.equal((await write(event)).data,'ignored');
  assert.equal((await write({...event,signedAt:101,revokedAt:101})).data,'updated');assert.equal((await write(event)).data,'ignored');
  assert.equal((await write({...event,environment:'Production'})).data,'inserted');
  assert.ok((await user.rpc('apply_maintenance_verified_transaction',{payload:event,proof_sha256:'a'.repeat(64)})).error);
  // Renewal notification lookup is service-only and carries no entitlement grant.
  const originalArgs={target_environment:'Sandbox',target_original:'10'};
  const original=await admin.rpc('read_maintenance_original_transaction',originalArgs);assert.equal(original.error,null);assert.equal(original.data.transactionId,'100');assert.equal(original.data.accountToken,binding.data);assert.equal(original.data.revokedAt,101);
  assert.ok((await user.rpc('read_maintenance_original_transaction',originalArgs)).error);
  const absentOriginal=await admin.rpc('read_maintenance_original_transaction',{...originalArgs,target_original:'999'});assert.equal(absentOriginal.error,null);assert.equal(absentOriginal.data,null);
  const productionOriginal=await admin.rpc('read_maintenance_original_transaction',{...originalArgs,target_environment:'Production'});assert.equal(productionOriginal.error,null);assert.equal(productionOriginal.data.environment,'Production');
  const readArgs={target_user:id,verified_session:claims.session_id,target_epoch:binding.data,target_environment:'Sandbox'};
  const seedRead=()=>admin.rpc('read_maintenance_reconciliation_seed',readArgs);
  const seed=await seedRead();assert.equal(seed.error,null);assert.equal(seed.data.transactionId,'100');assert.equal(seed.data.accountToken,binding.data);
  assert.ok((await user.rpc('read_maintenance_reconciliation_seed',readArgs)).error);
  assert.ok((await admin.rpc('read_maintenance_reconciliation_seed',{...readArgs,target_epoch:randomUUID()})).error);
  const productionSeed=await admin.rpc('read_maintenance_reconciliation_seed',{...readArgs,target_environment:'Production'});assert.equal(productionSeed.error,null);assert.equal(productionSeed.data.environment,'Production');
  const enqueueJob=await admin.rpc('enqueue_maintenance_reconciliation',readArgs);assert.equal(enqueueJob.error,null);assert.ok(enqueueJob.data);
  assert.ok((await user.rpc('enqueue_maintenance_reconciliation',readArgs)).error);
  const claimed=await admin.rpc('claim_maintenance_reconciliation',{target_environment:'Sandbox'});assert.equal(claimed.error,null);assert.equal(claimed.data.id,enqueueJob.data);assert.equal(claimed.data.accountToken,binding.data);
  assert.equal((await admin.rpc('claim_maintenance_reconciliation',{target_environment:'Sandbox'})).data,null);
  const scopedLease={target_job:claimed.data.id,target_lease:claimed.data.leaseToken};
  const progress=await admin.rpc('read_maintenance_reconciliation_status',readArgs);assert.equal(progress.error,null);assert.deepEqual(progress.data,{state:'running',environment:'Sandbox'});
  assert.ok((await user.rpc('read_maintenance_reconciliation_status',readArgs)).error);
  assert.equal((await admin.rpc('maintenance_reconciliation_lease_is_current',scopedLease)).data,true);
  const leasedSeed=await admin.rpc('read_maintenance_reconciliation_job_seed',scopedLease);assert.equal(leasedSeed.error,null);assert.equal(leasedSeed.data.transactionId,claimed.data.transactionId);
  assert.ok((await user.rpc('read_maintenance_reconciliation_job_seed',scopedLease)).error);
  const finishJob=await admin.rpc('finish_maintenance_reconciliation',{target_job:claimed.data.id,target_lease:claimed.data.leaseToken,is_complete:true,next_revision:null,error_code:null});assert.equal(finishJob.error,null);assert.equal(finishJob.data,true);assert.deepEqual((await admin.rpc('read_maintenance_reconciliation_status',readArgs)).data,{state:'complete',environment:'Sandbox'});assert.equal((await admin.rpc('maintenance_reconciliation_lease_is_current',scopedLease)).data,false);assert.ok((await admin.rpc('read_maintenance_reconciliation_job_seed',scopedLease)).error);
  const state=await admin.rpc('read_maintenance_verified_entitlement',readArgs);assert.equal(state.error,null);assert.equal(state.data.plan,'free');
  const now=Date.now();assert.equal((await write({...event,transactionId:'101',originalTransactionId:'11',signedAt:now,purchasedAt:now-10000,expiresAt:now+3600000})).error,null);
  assert.equal((await admin.rpc('read_maintenance_verified_entitlement',readArgs)).data.plan,'premium');
  assert.equal((await admin.rpc('read_maintenance_verified_entitlement',{...readArgs,target_environment:'Production'})).data.plan,'free');
  assert.ok((await user.rpc('read_maintenance_verified_entitlement',readArgs)).error);
  assert.ok((await user.rpc('load_household')).data.homes.some(row=>row.id===home));
  // Normalized synthetic renewals: exercise real service ownership/grace SQL, not Apple signatures.
  const expiredTx={...event,transactionId:'102',originalTransactionId:'12',signedAt:now+1,purchasedAt:now-20000,expiresAt:now-10000};
  assert.equal((await write({...event,transactionId:'101',originalTransactionId:'11',signedAt:now+1,purchasedAt:now-10000,expiresAt:now+3600000,revokedAt:now})).error,null);
  assert.equal((await write(expiredTx)).error,null);assert.equal((await admin.rpc('read_maintenance_verified_entitlement',readArgs)).data.plan,'free');
  const renewal={environment:'Sandbox',originalTransactionId:'12',accountToken:binding.data,productId:event.productId,signedAt:now+2,renewalDate:expiredTx.expiresAt,autoRenewStatus:1,isInBillingRetryPeriod:true,gracePeriodExpiresAt:now+3600000};
  const renewalArgs={payload:renewal,proof_sha256:'e'.repeat(64)};
  const renewalWrite=await admin.rpc('apply_maintenance_verified_renewal',renewalArgs);assert.equal(renewalWrite.error,null);assert.equal(renewalWrite.data,'inserted');
  assert.equal((await admin.rpc('apply_maintenance_verified_renewal',renewalArgs)).data,'ignored');
  const graceRights=await admin.rpc('read_maintenance_verified_entitlement',readArgs);assert.equal(graceRights.error,null);assert.equal(graceRights.data.expiresAt,renewal.gracePeriodExpiresAt);
  assert.ok((await user.rpc('apply_maintenance_verified_renewal',renewalArgs)).error);
  assert.ok((await admin.rpc('apply_maintenance_verified_renewal',{...renewalArgs,payload:{...renewal,accountToken:randomUUID()}})).error);
  assert.equal((await write({...expiredTx,signedAt:now+3,revokedAt:now})).error,null);assert.equal((await admin.rpc('read_maintenance_verified_entitlement',readArgs)).data.plan,'free');
  // Durable metadata only: no Apple-signed notification is claimed by this fixture.
  const notification={environment:'Sandbox',notificationId:randomUUID(),notificationType:'DID_CHANGE_RENEWAL_STATUS',signedAt:Date.now(),disposition:'needs_reconciliation'};
  const recordArgs={payload:notification,proof_sha256:'c'.repeat(64)};
  const inbox=()=>admin.rpc('record_maintenance_verified_notification',recordArgs);
  const received=await inbox();assert.equal(received.error,null);assert.equal(received.data,'inserted');assert.equal((await inbox()).data,'duplicate');
  assert.equal((await admin.rpc('record_maintenance_verified_notification',{...recordArgs,payload:{...notification,environment:'Production'}})).data,'inserted');
  assert.ok((await admin.rpc('record_maintenance_verified_notification',{...recordArgs,proof_sha256:'d'.repeat(64)})).error);
  assert.ok((await user.rpc('record_maintenance_verified_notification',recordArgs)).error);
  const second=createClient(origin,'synthetic-public-key',options),login=await second.auth.signInWithPassword({email,password});assert.equal(login.error,null);
  const secondClaims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url'));assert.notEqual(secondClaims.session_id,claims.session_id);assert.equal((await bind(secondClaims.session_id)).data,binding.data);
  assert.equal((await admin.rpc('current_maintenance_purchase_account',{target_user:randomUUID(),verified_session:secondClaims.session_id})).data,null);
  assert.match(secondClaims.session_id,/^[0-9a-f-]{36}$/i);
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{input:"update auth.sessions set not_after=now()-interval '1 second' where id='"+secondClaims.session_id+"';",timeout:10000,stdio:['pipe','pipe','pipe']});
  assert.ok((await admin.rpc('read_maintenance_reconciliation_seed',{...readArgs,verified_session:secondClaims.session_id})).error);
  const expired=await bind(secondClaims.session_id);assert.equal(expired.error,null);assert.equal(expired.data,null);
  assert.equal((await user.auth.signOut({scope:'local'})).error,null);const revoked=await bind(claims.session_id);assert.equal(revoked.error,null);assert.equal(revoked.data,null);
  assert.ok((await seedRead()).error);
  // Fresh Auth remains valid after app-only closure, while actual PostgREST CRUD is denied.
  const third=createClient(origin,'synthetic-public-key',options),freshLogin=await third.auth.signInWithPassword({email,password});assert.equal(freshLogin.error,null);
  const freshClaims=JSON.parse(Buffer.from(freshLogin.data.session.access_token.split('.')[1],'base64url'));assert.equal((await bind(freshClaims.session_id)).data,binding.data);
  const liveHomes=await third.from('homes').select('id').eq('id',home);assert.equal(liveHomes.error,null);assert.equal(liveHomes.data.length,1);
  const deletionArgs={target_user:id,verified_session:freshClaims.session_id,target_epoch:binding.data};
  const deletion=await admin.rpc('request_maintenance_account_deletion',deletionArgs);assert.equal(deletion.error,null);assert.ok(deletion.data);assert.equal((await admin.rpc('request_maintenance_account_deletion',deletionArgs)).data,deletion.data);assert.ok((await third.rpc('request_maintenance_account_deletion',deletionArgs)).error);
  execFileSync('docker',['compose','-p','ouchi-identity-ci','-f','tests/fixtures/auth/compose.yml','exec','-T','db','psql','-U','postgres','-d','auth_test','-v','ON_ERROR_STOP=1'],{input:"update maintenance_private.account_access set enabled=false where user_id='"+id+"';",timeout:10000,stdio:['pipe','pipe','pipe']});
  const closedHomes=await third.from('homes').select('id').eq('id',home);assert.equal(closedHomes.error,null);assert.deepEqual(closedHomes.data,[]);
  assert.ok((await third.from('homes').insert({id:randomUUID(),owner_id:id,name:'Blocked home',kind:'home'})).error);
  assert.ok((await third.rpc('create_home_invite',{home_id:home})).error);
  assert.equal((await bind(freshClaims.session_id)).data,null);assert.ok((await admin.rpc('request_maintenance_account_deletion',deletionArgs)).error);
  const sharedLogin=await third.auth.getUser();assert.equal(sharedLogin.error,null);assert.equal(sharedLogin.data.user.id,id);
 }finally{gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
});
