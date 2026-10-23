import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=p=>ts.transpileModule(readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const request=uri(compile('lib/account-deletion-request.ts')),session=uri(compile('lib/verified-app-session.ts'));
const {DeletionFamilyHandoffRequiredError,DeletionFamilyReviewRequiredError}=await import(request);
const {deletionRequestDependencies}=await import(uri(compile('lib/account-deletion-request-store.ts').replace("'./account-deletion-request'",JSON.stringify(request)).replace("'./verified-app-session'",JSON.stringify(session))));

test('store reports only exact trusted SQL family refusal; generic failures remain unconfirmed',async()=>{
 const identity={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',email:'synthetic@example.invalid'};
 for(const [error,typed] of [[{code:'P0001',message:'Family handoff required'},true],[{code:'XX000',message:'Family handoff required'},false],[{code:'P0001',message:'Other failure'},false]]){
  const admin={rpc:async(name,args)=>{
   assert.equal(name,'request_maintenance_account_deletion');assert.deepEqual(args,{target_user:identity.userID,verified_session:identity.sessionID,target_epoch:identity.epochID});
   return {data:null,error};
  }};
  const deps=deletionRequestDependencies(admin,()=>{throw Error('No reauthentication in this store-boundary test');});
  await assert.rejects(deps.enqueue(identity),value=>typed?value instanceof DeletionFamilyHandoffRequiredError:!(value instanceof DeletionFamilyHandoffRequiredError));
 }
});

test('only exact trusted SQL review refusal becomes a shared-member review error',async()=>{
 for(const code of ['P0001','XX000']){
  const deps=deletionRequestDependencies({rpc:async()=>({error:{code,message:'Family review required'},data:null})},()=>{});
  await assert.rejects(deps.enqueue({userID:'user',sessionID:'session',epochID:'epoch'}),value=>code==='P0001'?value instanceof DeletionFamilyReviewRequiredError:!(value instanceof DeletionFamilyReviewRequiredError));
 }
});
