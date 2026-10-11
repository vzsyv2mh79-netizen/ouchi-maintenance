import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync('lib/account-deletion-progress.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {handleAccountDeletionProgress:handle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('progress authenticates exact ownership and never upgrades partial erasure to complete',async()=>{
 const requestID='11111111-1111-4111-8111-111111111111',userID='22222222-2222-4222-8222-222222222222';
 const req=()=>new Request('https://example.invalid/account/deletion/'+requestID,{headers:{authorization:'Bearer synthetic'}});
 for(const state of ['pending','running','failed','complete']){
  const response=await handle(req(),requestID,{verify:async()=>userID,read:async scope=>{assert.deepEqual(scope,{requestID,userID});assert.ok(Object.isFrozen(scope));return {...scope,state,records_erased:true,absence_confirmed:true,privateToken:'not-returned'};}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{requestID,state});
 }
 assert.equal((await handle(req(),requestID,{verify:async()=>userID,read:async()=>null})).status,404);
 assert.equal((await handle(req(),requestID,{verify:async()=>userID,read:async()=>({requestID,userID:requestID,state:'complete'})})).status,503);
 assert.equal((await handle(req(),requestID,{verify:async()=>null,read:async()=>{throw Error('must not read');}})).status,401);
 assert.equal((await handle(new Request('https://example.invalid/progress?userID='+userID),requestID,{verify:async()=>userID,read:async()=>null})).status,400);
});
