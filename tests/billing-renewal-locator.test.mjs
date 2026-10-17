import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync('lib/billing-renewal-locator.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {verifiedRenewalLocator:locate}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const valid={environment:'Sandbox',originalTransactionId:'123',productId:'ouchi.premium.monthly',signedDate:100,renewalDate:200,autoRenewStatus:1};
test('verified renewal lookup rejects invalid scope and semantic fields before database access',()=>{
 assert.deepEqual(locate(valid,'Sandbox'),{environment:'Sandbox',originalTransactionId:'123'});
 for(const patch of [{environment:'Production'},{originalTransactionId:'x'},{originalTransactionId:'1'.repeat(129)},{productId:'ouchi.tip.small'},{signedDate:0},{signedDate:NaN},{renewalDate:-1},{renewalDate:1.5},{autoRenewStatus:2},{isInBillingRetryPeriod:1},{gracePeriodExpiresDate:200},{gracePeriodExpiresDate:Infinity},{appAccountToken:'00000000-0000-0000-0000-000000000000'}])assert.throws(()=>locate({...valid,...patch},'Sandbox'));
 assert.deepEqual(locate({...valid,isInBillingRetryPeriod:true,gracePeriodExpiresDate:300},'Sandbox'),{environment:'Sandbox',originalTransactionId:'123'});
});
