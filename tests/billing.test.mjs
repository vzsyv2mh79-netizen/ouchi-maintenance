import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/billing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const b=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const account='11111111-1111-4111-8111-111111111111';const input={bundleId:'test.ouchi',environment:'Sandbox',productId:'ouchi.premium.monthly',transactionId:'1',originalTransactionId:'1',appAccountToken:account,signedDate:100,purchaseDate:50,expiresDate:200};
test('transaction scope rejects production, arbitrary products and malformed dates',()=>{for(const patch of [{environment:'Production'},{bundleId:'attacker'},{productId:'toString'},{appAccountToken:'x'},{signedDate:NaN},{expiresDate:49},{revocationDate:-1},{isUpgraded:'true'}])assert.throws(()=>b.normalizeAppleTransaction({...input,...patch},'test.ouchi'));});
test('renewal, expiration, cancellation and tip do not fabricate entitlements',()=>{const t=b.normalizeAppleTransaction(input,'test.ouchi');assert.equal(b.entitlementFromTransactions([t],100).plan,'premium');assert.equal(b.canStartSubscription([t],100),false);assert.equal(b.entitlementFromTransactions([t],200).plan,'free');const renewal={...t,transactionId:'2',purchasedAt:200,expiresAt:400};assert.equal(b.entitlementFromTransactions([t,renewal],250).expiresAt,400);assert.equal(b.entitlementFromTransactions([{...t,productId:'ouchi.tip.small'}],100).plan,'free');assert.equal(b.entitlementFromTransactions([],100).plan,'free');});
test('refund wins over stale duplicate delivery and ordering is irrelevant',()=>{const t=b.normalizeAppleTransaction(input,'test.ouchi');const refund={...t,signedAt:150,revokedAt:125};for(const list of [[t,refund,t],[refund,t,t],[t,t,refund]])assert.equal(b.entitlementFromTransactions(list,160).plan,'free');});

test('Apple verifier rejects malformed and unsigned transaction data',async()=>{const {SignedDataVerifier,Environment}=await import('@apple/app-store-server-library');const v=new SignedDataVerifier([],true,Environment.SANDBOX,'test.ouchi');for(const jws of ['bad',Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(input)).toString('base64url')+'.'])await assert.rejects(()=>v.verifyAndDecodeTransaction(jws));});

test('superseded subscription never resurrects after replacement refund or expiry',()=>{
 const original=b.normalizeAppleTransaction(input,'test.ouchi'),superseded=b.normalizeAppleTransaction({...input,isUpgraded:true,signedDate:150},'test.ouchi');
 const replacement={...original,transactionId:'2',productId:'ouchi.premium.annual',purchasedAt:100,expiresAt:500,signedAt:160};
 assert.equal(b.entitlementFromTransactions([original,superseded,replacement],170).productId,'ouchi.premium.annual');
 const refund={...replacement,signedAt:180,revokedAt:175};
 for(const list of [[original,superseded,replacement,refund],[refund,replacement,superseded,original]])assert.equal(b.entitlementFromTransactions(list,190).plan,'free');
 for(const list of [[original,{...superseded,signedAt:original.signedAt}],[{...superseded,signedAt:original.signedAt},original]])assert.equal(b.entitlementFromTransactions(list,150).plan,'free');
 assert.equal(b.entitlementFromTransactions([superseded],170).plan,'free');
});
