import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import ts from 'typescript';
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
