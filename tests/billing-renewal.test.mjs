import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/billing-renewal.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {normalizeVerifiedRenewal:normalize,verifiedPeriodAccess:access}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const transaction={environment:'Sandbox',transactionId:'1',originalTransactionId:'10',productId:'ouchi.premium.monthly',accountToken:'11111111-1111-4111-8111-111111111111',signedAt:100,purchasedAt:50,expiresAt:200};
const input={environment:'Sandbox',originalTransactionId:'10',productId:transaction.productId,appAccountToken:transaction.accountToken,signedDate:201,renewalDate:200,autoRenewStatus:1,isInBillingRetryPeriod:true,gracePeriodExpiresDate:300};
test('verified renewal must match environment, original purchase, account, product and exact paid period',()=>{
 assert.equal(normalize(input,transaction).gracePeriodExpiresAt,300);assert.equal(normalize({...input,appAccountToken:undefined},transaction).accountToken,transaction.accountToken);
 for(const value of [{...input,environment:'Production'},{...input,originalTransactionId:'other'},{...input,productId:'ouchi.premium.annual'},{...input,appAccountToken:'22222222-2222-4222-8222-222222222222'},{...input,autoRenewStatus:2},{...input,autoRenewStatus:'1'},{...input,renewalDate:201},{...input,signedDate:0},{...input,signedDate:1.5},{...input,signedDate:Number.MAX_SAFE_INTEGER+1},{...input,isInBillingRetryPeriod:'true'},{...input,gracePeriodExpiresDate:200}])assert.throws(()=>normalize(value,transaction));
 const production={...transaction,environment:'Production'};assert.equal(normalize({...input,environment:'Production'},production,'Production').environment,'Production');assert.throws(()=>normalize(input,production,'Production'));
});
test('cancellation retains paid period; retry without signed grace, grace expiry and refund do not authorize',()=>{
 const renewal=normalize(input,transaction);
 assert.deepEqual(access(transaction,{...renewal,autoRenewStatus:0},199),{state:'paid',expiresAt:200});
 assert.deepEqual(access(transaction,renewal,200),{state:'grace',expiresAt:300});assert.deepEqual(access(transaction,renewal,299),{state:'grace',expiresAt:300});
 for(const r of [undefined,{...renewal,gracePeriodExpiresAt:undefined},{...renewal,isInBillingRetryPeriod:false},{...renewal,accountToken:'other'},{...renewal,originalTransactionId:'other'},{...renewal,environment:'Production'},{...renewal,renewalDate:201}])assert.deepEqual(access(transaction,r,201),{state:'free'});
 assert.deepEqual(access(transaction,renewal,300),{state:'free'});
 for(const t of [{...transaction,revokedAt:201},{...transaction,isUpgraded:true},{...transaction,productId:'ouchi.tip.small'},{...transaction,purchasedAt:400},{...transaction,environment:'Production'}])assert.deepEqual(access(t,renewal,201),{state:'free'});
 assert.deepEqual(access(transaction,renewal,NaN),{state:'free'});
});
