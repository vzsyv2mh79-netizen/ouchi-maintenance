import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function module(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(module(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const {verifyStoreAccountPair:pair}=await import(module('billing-store-account-pair'));
const now=1791676800000;
const scope={bundleId:'dev.synthetic.ouchi',environment:'Sandbox'};
const app={bundleId:scope.bundleId,receiptType:'Sandbox',appTransactionId:'synthetic-app-transaction',receiptCreationDate:now};
const transaction={bundleId:scope.bundleId,environment:'Sandbox',appTransactionId:app.appTransactionId,transactionId:'synthetic-tx',originalTransactionId:'synthetic-original',productId:'ouchi.premium.monthly',type:'Auto-Renewable Subscription',appAccountToken:'11111111-1111-4111-8111-111111111111',signedDate:now,purchaseDate:now-1000,expiresDate:now+1000,inAppOwnershipType:'PURCHASED'};
const deps=(a=app,t=transaction)=>({verifyApp:async jws=>{assert.equal(jws,'synthetic-app-jws');return a;},verifyTransaction:async jws=>{assert.equal(jws,'synthetic-transaction-jws');return t;}});
const call=(a=app,t=transaction,s=scope,d=deps(a,t))=>pair('synthetic-app-jws','synthetic-transaction-jws',s,d,now);
test('pair verified app and purchase scopes without authorizing transfer',async()=>{
 const value=await call();assert.equal(value.appTransactionId,app.appTransactionId);assert.equal(value.transaction.accountToken,transaction.appAccountToken);assert.ok(!Object.hasOwn(value,'authorized'));assert.ok(!Object.hasOwn(value,'newAccountToken'));
 const prod={bundleId:scope.bundleId,environment:'Production',appAppleId:123};
 assert.equal((await call({...app,receiptType:'Production',appAppleId:123},{...transaction,environment:'Production'},prod)).transaction.environment,'Production');
 for(const a of [{...app,appTransactionId:''},{...app,appTransactionId:'other'},{...app,bundleId:'foreign'},{...app,receiptType:'Production'},{...app,receiptCreationDate:now+60001}])await assert.rejects(call(a));
 for(const t of [{...transaction,appTransactionId:undefined},{...transaction,inAppOwnershipType:'FAMILY_SHARED'},{...transaction,signedDate:now+60001},{...transaction,environment:'Production'},{...transaction,productId:'ouchi.tip.small',type:'Consumable'}])await assert.rejects(call(app,t));
 await assert.rejects(call({...app,receiptType:'Production',appAppleId:124},{...transaction,environment:'Production'},prod));
 await assert.rejects(call(app,transaction,{...scope,environment:'Production'}));
 for(const appAppleId of [0,-1,1.5,NaN])await assert.rejects(call({...app,appAppleId},transaction,{...scope,appAppleId}));
 for(const a of [null,[],{...app,receiptCreationDate:0},{...app,receiptCreationDate:NaN},{...app,appTransactionId:'has whitespace'}])await assert.rejects(call(a));
 for(const t of [null,[],{...transaction,signedDate:0},{...transaction,signedDate:1.5}])await assert.rejects(call(app,t));
});
test('JWS verification and bounded input required; no fallback decode',async()=>{
 let transactions=0;
 await assert.rejects(call(app,transaction,scope,{verifyApp:async()=>{throw Error('signature rejected');},verifyTransaction:async()=>{transactions++;return transaction;}}));assert.equal(transactions,0);
 await assert.rejects(call(app,transaction,scope,{verifyApp:async()=>app,verifyTransaction:async()=>{throw Error('signature rejected');}}));
 const unused={verifyApp:async()=>{throw Error('must not verify');},verifyTransaction:async()=>{throw Error('must not verify');}};
 await assert.rejects(pair('','synthetic-transaction-jws',scope,unused,now),/Invalid proof input/);
 await assert.rejects(pair('x'.repeat(131073),'synthetic-transaction-jws',scope,unused,now),/Invalid proof input/);
});
