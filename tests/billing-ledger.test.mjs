import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/billing-ledger.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {verifyAndPersistLedgerTransaction:save}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const transaction={accountToken:'account',environment:'Sandbox',transactionId:'1'};
test('verification and account match precede persistence; hash references exact signed input',async()=>{
 let writes=0;
 const persist=async(name,args)=>{writes++;assert.equal(name,'apply_maintenance_verified_transaction');assert.equal(args.payload,transaction);assert.equal(args.proof_sha256,createHash('sha256').update('signed-jws').digest('hex'));return {data:'inserted',error:null};};
 await assert.rejects(()=>save('signed-jws',{verify:async()=>{throw Error('signature');},persist}));
 await assert.rejects(()=>save('signed-jws',{verify:async()=>transaction,persist},'another-account'));
 assert.equal(writes,0);
 assert.equal((await save('signed-jws',{verify:async()=>transaction,persist},'account')).outcome,'inserted');
 assert.equal(writes,1);
});
test('failed, missing or unexpected persistence acknowledgements remain retryable',async()=>{
 for(const result of [{data:null,error:null},{data:'saved',error:null},{data:'inserted',error:Error('database')}])await assert.rejects(()=>save('signed-jws',{verify:async()=>transaction,persist:async()=>result}));
 for(const outcome of ['inserted','updated','ignored'])assert.equal((await save('signed-jws',{verify:async()=>transaction,persist:async()=>({data:outcome,error:null})})).outcome,outcome);
});
test('oversized signed input never reaches verifier or persistence',async()=>{
 let calls=0;const dependencies={verify:async()=>{calls++;return transaction;},persist:async()=>{calls++;return {data:'inserted',error:null};}};
 await assert.rejects(()=>save('あ'.repeat(50000),dependencies));await assert.rejects(()=>save('',dependencies));assert.equal(calls,0);
});
