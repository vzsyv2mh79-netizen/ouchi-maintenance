import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const compile=p=>ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {readAuthoritativeReconciliationSeed:read}=await import(url(compile('lib/billing-reconciliation-seed.ts').replace("'./billing'",JSON.stringify(url(compile('lib/billing.ts'))))));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',epoch='33333333-3333-4333-8333-333333333333',args={target_user:user,verified_session:session,target_epoch:epoch,target_environment:'Sandbox'};
const seed={environment:'Sandbox',transactionId:'1',originalTransactionId:'10',productId:'ouchi.premium.monthly',accountToken:epoch,signedAt:100,purchasedAt:50,expiresAt:200,isUpgraded:false};
test('seed read scopes service RPC to live identity and preserves legitimate no-purchase state',async()=>{
 const result=await read(async(name,value)=>{assert.equal(name,'read_maintenance_reconciliation_seed');assert.deepEqual(value,args);return {data:seed,error:null};},args,'test.ouchi');assert.equal(result.accountToken,epoch);assert.equal(result.transactionId,'1');
 assert.equal(await read(async()=>({data:null,error:null}),args,'test.ouchi'),null);
});
test('missing/error/malformed or cross-epoch seed is never trusted as a client-selected transaction',async()=>{
 for(const data of [undefined,[],false,{...seed,environment:'Production'},{...seed,accountToken:user},{...seed,productId:'unknown'},{...seed,expiresAt:40},{...seed,isUpgraded:'false'}])await assert.rejects(()=>read(async()=>({data,error:null}),args,'test.ouchi'));
 await assert.rejects(()=>read(async()=>({data:null,error:Error('outage')}),args,'test.ouchi'));
 let calls=0;await assert.rejects(()=>read(async()=>{calls++;return {};},{...args,target_user:'invalid'},'test.ouchi'));assert.equal(calls,0);
});
