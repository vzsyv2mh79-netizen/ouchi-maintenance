import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/billing-ledger-entitlement.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readVerifiedLedgerEntitlement:read}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const args={target_user:'user',verified_session:'session',target_epoch:'epoch',target_environment:'Sandbox'};
const state={plan:'premium',environment:'Sandbox',productId:'ouchi.premium.monthly',expiresAt:200};
test('read uses server RPC and exact live-account/environment scope',async()=>{
 const result=await read(async(name,input)=>{assert.equal(name,'read_maintenance_verified_entitlement');assert.equal(input,args);return {data:state,error:null};},args,100);
 assert.deepEqual(result,state);
 assert.equal((await read(async()=>({data:state,error:null}),args,200)).plan,'free');
});
test('database failures and inconsistent response do not masquerade as free access',async()=>{
 for(const data of [null,[],{...state,environment:'Production'},{...state,productId:'ouchi.tip.small'},{...state,expiresAt:'200'},{plan:'free',environment:'Sandbox',expiresAt:200}])await assert.rejects(()=>read(async()=>({data,error:null}),args,100));
 await assert.rejects(()=>read(async()=>({data:{plan:'free',environment:'Sandbox'},error:Error('database')}),args,100));
 await assert.rejects(()=>read(async()=>{throw Error('transport');},args,100));
});
test('valid free state is preserved and invalid scope never reaches RPC',async()=>{
 assert.deepEqual(await read(async()=>({data:{plan:'free',environment:'Sandbox'},error:null}),args,100),{plan:'free',environment:'Sandbox'});
 let calls=0;await assert.rejects(()=>read(async()=>{calls++;return {data:null,error:null};},{...args,target_environment:'Other'},100));assert.equal(calls,0);
});
