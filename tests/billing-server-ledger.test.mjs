import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash,generateKeyPairSync} from 'node:crypto';import ts from 'typescript';
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const cache=new Map();
function compile(name){
 if(cache.has(name))return cache.get(name);
 let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replace("import 'server-only';",'').replace(/from '(\.\/[a-z-]+)'/g,(_,path)=>'from '+JSON.stringify(compile(path.slice(2))));
 for(const dependency of ['@apple/app-store-server-library','@supabase/supabase-js'])code=code.replaceAll(JSON.stringify(dependency),JSON.stringify(import.meta.resolve(dependency))).replaceAll("'"+dependency+"'",JSON.stringify(import.meta.resolve(dependency)));
 const url=moduleURL(code);cache.set(name,url);return url;
}
const server=await import(compile('billing-server'));
test('actual Apple verifier factory binds Production scope and rejects unsigned proof',async()=>{
 const verifier=server.billingVerifier({certificates:[],environment:'Production',bundleId:'test.ouchi',appAppleId:123456789});
 assert.equal(verifier.environment,'Production');assert.equal(verifier.bundleId,'test.ouchi');assert.equal(verifier.appAppleId,123456789);assert.equal(verifier.enableOnlineChecks,true);
 await assert.rejects(()=>verifier.verifyAndDecodeTransaction('e30.e30.c2ln'));
 await assert.rejects(()=>verifier.verifyAndDecodeRenewalInfo('e30.e30.c2ln'));
 await assert.rejects(()=>server.verifyBillingRenewal('e30.e30.c2ln',{}, {certificates:[],environment:'Production',bundleId:'test.ouchi',appAppleId:123456789}));
 assert.throws(()=>server.billingVerifier({certificates:[],environment:'Production',bundleId:'test.ouchi'}));
});
test('billing configuration keeps production disabled and rejects unknown storage mode',()=>{
 const keys=['BILLING_MODE','BILLING_ACCOUNT_BINDING_MODE','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','APPLE_BUNDLE_ID','APPLE_ROOT_CERTIFICATES_BASE64','BILLING_STORAGE_MODE','APPLE_APP_ID','BILLING_PRODUCTION_VERIFICATION_ENABLED'];const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
 Object.assign(process.env,{BILLING_MODE:'sandbox',BILLING_ACCOUNT_BINDING_MODE:'epoch',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',APPLE_BUNDLE_ID:'test.ouchi',APPLE_ROOT_CERTIFICATES_BASE64:Buffer.from('synthetic-not-a-real-certificate').toString('base64')});
 delete process.env.BILLING_STORAGE_MODE;assert.equal(server.billingConfiguration().storage,'sandbox-legacy');
 delete process.env.BILLING_PRODUCTION_VERIFICATION_ENABLED;delete process.env.APPLE_APP_ID;
 process.env.BILLING_STORAGE_MODE='verified-ledger';assert.equal(server.billingConfiguration().storage,'verified-ledger');
 process.env.BILLING_STORAGE_MODE='typo';assert.equal(server.billingConfiguration(),null);
 process.env.BILLING_STORAGE_MODE='verified-ledger';process.env.BILLING_MODE='production';assert.equal(server.billingConfiguration(),null);
 process.env.BILLING_PRODUCTION_VERIFICATION_ENABLED='true';assert.equal(server.billingConfiguration(),null);
 for(const identifier of ['0','1.5','-1','9007199254740992',' 123']){process.env.APPLE_APP_ID=identifier;assert.equal(server.billingConfiguration(),null);}
 process.env.APPLE_APP_ID='123456789';let config=server.billingConfiguration();assert.equal(config.environment,'Production');assert.equal(config.appAppleId,123456789);
 process.env.BILLING_STORAGE_MODE='sandbox-legacy';assert.equal(server.billingConfiguration(),null);
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('actual persistence helper selects ledger RPC and rejects missing acknowledgement',async()=>{
 const transaction={accountToken:'synthetic',environment:'Sandbox'},signed='exact-synthetic-jws';let calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:'inserted',error:null};}};
 await server.persistBillingTransaction(db,{storage:'verified-ledger'},signed,transaction);
 assert.equal(calls[0].name,'apply_maintenance_verified_transaction');assert.equal(calls[0].args.payload,transaction);assert.equal(calls[0].args.proof_sha256,createHash('sha256').update(signed).digest('hex'));
 await assert.rejects(()=>server.persistBillingTransaction({rpc:async()=>({data:null,error:null})},{storage:'verified-ledger'},signed,transaction));
 calls=[];await server.persistBillingTransaction(db,{storage:'sandbox-legacy'},signed,transaction);assert.equal(calls[0].name,'apply_ouchi_sandbox_transaction');
});
test('actual entitlement helper scopes read to verified bearer session and current epoch',async()=>{
 const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333';
 const token='e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.c2ln';let calls=0;
 const db={rpc:async(name,args)=>{calls++;assert.equal(name,'read_maintenance_verified_entitlement');assert.deepEqual(args,{target_user:user,verified_session:session,target_epoch:epoch,target_environment:'Sandbox'});return {data:{plan:'free',environment:'Sandbox'},error:null};}};
 assert.equal((await server.ledgerEntitlementAfterAuth(db,token,user,epoch)).plan,'free');assert.equal(calls,1);
 await assert.rejects(()=>server.ledgerEntitlementAfterAuth(db,token,epoch,epoch));assert.equal(calls,1);
});

test('actual renewal helper requires verified-ledger scope, exact proof hash and durable acknowledgement',async()=>{
 const renewal={environment:'Sandbox'},config={storage:'verified-ledger',environment:'Sandbox'};let args;
 await server.persistBillingRenewal({rpc:async(name,value)=>{assert.equal(name,'apply_maintenance_verified_renewal');args=value;return {data:'inserted',error:null};}},config,'synthetic-renewal',renewal);
 assert.equal(args.payload,renewal);assert.equal(args.proof_sha256,createHash('sha256').update('synthetic-renewal').digest('hex'));
 for(const data of [null,[],['updated'],'saved'])await assert.rejects(()=>server.persistBillingRenewal({rpc:async()=>({data,error:null})},config,'synthetic-renewal',renewal));
 await assert.rejects(()=>server.persistBillingRenewal({rpc:async()=>({data:'updated',error:Error('outage')})},config,'synthetic-renewal',renewal));
 let called=false;const never={rpc:async()=>{called=true;return {};}};
 await assert.rejects(()=>server.persistBillingRenewal(never,{...config,environment:'Production'},'synthetic-renewal',renewal));
 await assert.rejects(()=>server.persistBillingRenewal(never,{...config,storage:'sandbox-legacy'},'synthetic-renewal',renewal));assert.equal(called,false);
});

test('actual Server API recovery factory stays disabled without explicit opt-in and valid signing setup',()=>{
 const keys=['BILLING_RECONCILIATION_ENABLED','APPLE_IAP_PRIVATE_KEY_BASE64','APPLE_IAP_KEY_ID','APPLE_IAP_ISSUER_ID'];const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const config={storage:'verified-ledger',environment:'Sandbox',bundleId:'test.ouchi'};
 try{
  for(const key of keys)delete process.env[key];assert.equal(server.billingReconciliationClient(config),null);
  process.env.BILLING_RECONCILIATION_ENABLED='true';assert.equal(server.billingReconciliationClient(config),null);
  process.env.APPLE_IAP_KEY_ID='ABCDEFGHIJ';process.env.APPLE_IAP_ISSUER_ID='11111111-1111-4111-8111-111111111111';process.env.APPLE_IAP_PRIVATE_KEY_BASE64=Buffer.from('synthetic-not-a-private-key').toString('base64');assert.equal(server.billingReconciliationClient(config),null);
  assert.equal(server.billingReconciliationClient({...config,storage:'sandbox-legacy'}),null);
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});process.env.APPLE_IAP_PRIVATE_KEY_BASE64=Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64');
  assert.equal(server.billingReconciliationClient(config).urlBase,'https://api.storekit-sandbox.apple.com');
  assert.equal(server.billingReconciliationClient({...config,environment:'Production'}).urlBase,'https://api.storekit.apple.com');
  assert.equal(server.billingReconciliationClient({...config,environment:'Xcode'}),null);
  process.env.BILLING_RECONCILIATION_ENABLED='false';assert.equal(server.billingReconciliationClient(config),null);
 }finally{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
test('actual recovery adapter uses exact job lease RPC and refuses malformed seed before Apple requests',async()=>{
 const keys=['BILLING_RECONCILIATION_ENABLED','APPLE_IAP_PRIVATE_KEY_BASE64','APPLE_IAP_KEY_ID','APPLE_IAP_ISSUER_ID'],old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const epoch='11111111-1111-4111-8111-111111111111',job={id:'22222222-2222-4222-8222-222222222222',userId:'33333333-3333-4333-8333-333333333333',accountToken:epoch,environment:'Sandbox',transactionId:'1',revision:null,leaseToken:'44444444-4444-4444-8444-444444444444',leaseUntil:new Date(Date.now()+120000).toISOString()},config={storage:'verified-ledger',environment:'Sandbox',bundleId:'test.ouchi'};
 try{
  process.env.BILLING_RECONCILIATION_ENABLED='true';process.env.APPLE_IAP_KEY_ID='ABCDEFGHIJ';process.env.APPLE_IAP_ISSUER_ID=epoch;const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});process.env.APPLE_IAP_PRIVATE_KEY_BASE64=Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64');
  for(const validLease of [false,true]){const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='maintenance_reconciliation_lease_is_current'?validLease:name==='finish_maintenance_reconciliation'?true:null,error:null};}};
   assert.equal((await server.runBillingRecoveryJob(db,config,job)).retryRequested,true);assert.deepEqual(calls[0],{name:'maintenance_reconciliation_lease_is_current',args:{target_job:job.id,target_lease:job.leaseToken}});
   assert.equal(calls.some(c=>c.name==='read_maintenance_reconciliation_job_seed'),validLease);assert.equal(calls.at(-1).args.error_code,'read_unavailable');assert.equal(calls.at(-1).args.next_revision,null);
  }
  await assert.rejects(()=>server.runBillingRecoveryJob({}, {...config,environment:'Production'},job),/unavailable/);
  // Synthetic claim decoding only; this helper is invoked only after Auth.getUser in the actual route.
  const session='55555555-5555-4555-8555-555555555555',bearer='e30.'+Buffer.from(JSON.stringify({sub:job.userId,session_id:session,exp:Math.floor(Date.now()/1000)+300})).toString('base64url')+'.c2ln';
  for(const [data,expected] of [[null,false],[job.id,true]]){let observed;const db={rpc:async(name,args)=>{observed={name,args};return {data,error:null};}};assert.equal(await server.enqueueBillingRecoveryAfterAuth(db,config,bearer,job.userId,epoch),expected);assert.deepEqual(observed,{name:'enqueue_maintenance_reconciliation',args:{target_user:job.userId,verified_session:session,target_epoch:epoch,target_environment:'Sandbox'}});}
  for(const data of [undefined,{},'invalid','00000000-0000-0000-0000-000000000000'])await assert.rejects(()=>server.enqueueBillingRecoveryAfterAuth({rpc:async()=>({data,error:null})},config,bearer,job.userId,epoch));
  await assert.rejects(()=>server.enqueueBillingRecoveryAfterAuth({},config,bearer,epoch,epoch),/session/);

 }finally{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
