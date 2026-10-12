import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const cache=new Map();function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace("import 'server-only';",'').replace(/from '(\.\/[a-z-]+)'/g,(_,path)=>'from '+JSON.stringify(compile(path.slice(2))));for(const dependency of ['@apple/app-store-server-library','@supabase/supabase-js'])code=code.replaceAll("'"+dependency+"'",JSON.stringify(import.meta.resolve(dependency)));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}

const {restoreProcessResponse:respond}=await import(compile('billing-restore-process-service'));
const userID='11111111-1111-4111-8111-111111111111',sessionID='22222222-2222-4222-8222-222222222222',epochID='33333333-3333-4333-8333-333333333333',requestID='44444444-4444-4444-8444-444444444444';
const token='e30.'+Buffer.from(JSON.stringify({sub:userID,session_id:sessionID,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.c2ln';
const config={billing:{url:'https://synthetic.supabase.co',key:'synthetic',bundleId:'dev.synthetic.ouchi',certificates:[],storage:'verified-ledger',environment:'Sandbox'},attest:{appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'development'}};
const body={requestID,pairSHA256:'a'.repeat(64),assertionSHA256:'b'.repeat(64)};
const request=(value=body,signal)=>new Request('https://ouchi-maintenance.vercel.app/api/billing/restore/process',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Ouchi-App-Epoch':epochID,'Content-Type':'application/json'},body:JSON.stringify(value),signal});
const job={id:requestID,lease:'55555555-5555-4555-8555-555555555555',userID,sessionID,epochID,originalTransactionID:'100001',appTransactionID:'200001',previousAccountToken:'66666666-6666-4666-8666-666666666666',environment:'Sandbox',bundleID:config.billing.bundleId,authorizedAt:Date.now()-10000,phase:'authorized'};
function fixture(options={}){
 const calls=[];let reads=0,started=false,completed=false;let appleToken=job.previousAccountToken;
 const db={auth:{getUser:async()=>({data:{user:{id:userID}},error:options.authError??null})},rpc:async(name,args)=>{
  calls.push(name);
  if(name==='read_maintenance_explicit_enrollment')return {data:++reads===options.changedAt?requestID:epochID,error:null};
  if(name==='claim_maintenance_restore_transfer'){assert.deepEqual(args,{target_request:requestID,target_user:userID,verified_session:sessionID,target_epoch:epochID,expected_bundle:config.billing.bundleId,verified_pair_hash:body.pairSHA256,verified_assertion_hash:body.assertionSHA256});return {data:options.claim??{status:'claimed',job},error:null};}
  if(name==='maintenance_restore_completion_is_current')return {data:completed,error:null};
  if(name==='maintenance_restore_transfer_lease_is_current')return {data:true,error:null};
  if(name==='mark_maintenance_restore_transfer_update'){assert.equal(started,false);started=true;return {data:{...job,phase:'update_started',mutationStartedAt:Date.now()},error:null};}
  if(name==='complete_maintenance_restore_transfer'){completed=true;return options.lostCommit?{data:null,error:{message:'synthetic lost acknowledgement'}}:{data:true,error:null};}
  throw Error('Unexpected RPC '+name);
 }};
 const appleFactory=()=>{calls.push('appleFactory');return {readCurrent:async()=>{
  calls.push('read');return {signedTransaction:'synthetic verified Apple output',appTransactionID:job.appTransactionID,transaction:{environment:'Sandbox',originalTransactionId:job.originalTransactionID,transactionId:'100002',accountToken:appleToken,productId:'ouchi.premium.monthly',signedAt:Date.now(),purchasedAt:Date.now()-1000,expiresAt:Date.now()+3600000,isUpgraded:false}};
 },setToken:async()=>{assert.equal(started,true);calls.push('PUT');if(options.lostPUT)throw Error('synthetic lost update response');appleToken=epochID;}};};
 return {calls,factory:()=>db,appleFactory};
}
test('only a live scoped ledger claim dispatches the worker; response never carries rights or a lease',async()=>{
 const f=fixture(),response=await respond(request(),config,f.factory,f.appleFactory);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{requestID,status:'complete'});
 assert.equal(f.calls.filter(x=>x==='PUT').length,1);assert.ok(f.calls.indexOf('mark_maintenance_restore_transfer_update')<f.calls.indexOf('PUT'));
 for(const status of ['pending','complete']){const f=fixture({claim:{status}}),r=await respond(request(),config,f.factory,f.appleFactory);assert.equal(r.status,200);assert.deepEqual(await r.json(),{requestID,status});assert.equal(f.calls.includes('appleFactory'),false);}
 for(const claim of [{status:'claimed',job:{...job,id:epochID}},{status:'claimed',job:{...job,userID:requestID}},{status:'claimed',job:{...job,sessionID:requestID}},{status:'claimed',job:{...job,epochID:requestID}},{status:'claimed',job:{...job,bundleID:'foreign.app'}},{status:'claimed',job:{...job,extra:true}},{status:'complete',lease:job.lease},{status:'active'}]){const f=fixture({claim}),r=await respond(request(),config,f.factory,f.appleFactory);assert.notEqual(r.status,200);assert.equal(f.calls.includes('appleFactory'),false);}
 for(const changedAt of [1,2]){const f=fixture({changedAt});assert.equal((await respond(request(),config,f.factory,f.appleFactory)).status,503);assert.equal(f.calls.includes('appleFactory'),false);}
 const revoked=fixture({changedAt:3});assert.equal((await respond(request(),config,revoked.factory,revoked.appleFactory)).status,503);
 for(const options of [{lostPUT:true},{lostCommit:true}]){const f=fixture(options),r=await respond(request(),config,f.factory,f.appleFactory);assert.equal(r.status,200);assert.deepEqual(await r.json(),{requestID,status:'pending'});assert.equal(f.calls.filter(x=>x==='PUT').length,1);}
 // Unknown marker is readback-only. A previous uncertain PUT is never repeated.
 const uncertain=fixture({claim:{status:'claimed',job:{...job,phase:'update_started',mutationStartedAt:Date.now()-1000}}}),r=await respond(request(),config,uncertain.factory,uncertain.appleFactory);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{requestID,status:'pending'});assert.equal(uncertain.calls.includes('PUT'),false);
});
test('invalid, cancelled and disabled dispatch requests never initialize Apple or grant premium',async()=>{
 const forbidden=()=>{throw Error('Unexpected factory');};
 for(const value of [{...body,lease:job.lease},{...body,pairSHA256:'A'.repeat(64)},{...body,requestID:'00000000-0000-0000-0000-000000000000'}])assert.equal((await respond(request(value),config,forbidden,forbidden)).status,400);
 const stop=new AbortController();stop.abort();assert.equal((await respond(request(body,stop.signal),config,forbidden,forbidden)).status,503);
 for(const value of [null,{...config,billing:{...config.billing,environment:'Production'}}])assert.equal((await respond(request(),value,forbidden,forbidden)).status,503);
 const {restoreProcessEntry}=await import(compile('billing-restore-process-entry'));
 for(const env of [{},{BILLING_RECONCILIATION_ENABLED:'false'},{BILLING_RECONCILIATION_ENABLED:'true',BILLING_SANDBOX_RESTORE_TRANSFER_ENABLED:'false'}])assert.equal((await restoreProcessEntry(request(),env)).status,503);
 // Synthetic authenticated RPC and verified Apple output only; no real keys,
 // device attestation, Apple mutation, paid rights or shared database changed.
});
