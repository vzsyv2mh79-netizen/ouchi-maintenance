import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const cache=new Map();function compile(name){if(cache.has(name))return cache.get(name);let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace("import 'server-only';",'').replace(/from '(\.\/[a-z-]+)'/g,(_,path)=>'from '+JSON.stringify(compile(path.slice(2))));for(const dependency of ['@apple/app-store-server-library','@supabase/supabase-js'])code=code.replaceAll("'"+dependency+"'",JSON.stringify(import.meta.resolve(dependency)));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(name,url);return url;}

const {restoreStatusResponse:respond}=await import(compile('billing-restore-status-service'));
const userID='11111111-1111-4111-8111-111111111111',sessionID='22222222-2222-4222-8222-222222222222',epochID='33333333-3333-4333-8333-333333333333',requestID='44444444-4444-4444-8444-444444444444';
const token='e30.'+Buffer.from(JSON.stringify({sub:userID,session_id:sessionID,exp:Math.floor(Date.now()/1000)+600})).toString('base64url')+'.c2ln';
const config={billing:{url:'https://synthetic.supabase.co',key:'synthetic',bundleId:'dev.synthetic.ouchi',certificates:[],storage:'verified-ledger',environment:'Sandbox'},attest:{appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'development'}};
const body={requestID,pairSHA256:'a'.repeat(64),assertionSHA256:'b'.repeat(64)};
const request=(value=body,signal)=>new Request('https://ouchi-maintenance.vercel.app/api/billing/restore/status',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Ouchi-App-Epoch':epochID,'Content-Type':'application/json'},body:JSON.stringify(value),signal});
function fixture(options={}){const calls=[];let reads=0;const db={auth:{getUser:async()=>({data:{user:{id:userID}},error:options.authError??null})},rpc:async(name,args)=>{calls.push({name,args});if(name==='read_maintenance_explicit_enrollment')return {data:(++reads===options.changedAt)?'55555555-5555-4555-8555-555555555555':epochID,error:null};if(name==='read_maintenance_restore_job_status'){
 if(options.abort)options.abort.abort();
 return {data:options.missing?null:options.result??{requestID,status:'pending'},error:options.error??null};
 }throw Error('Unexpected write/Apple dispatch RPC '+name);}};return {calls,factory:()=>db};}
test('synthetic authenticated status returns only scoped durable process status, without new reservation, lease or entitlement',async()=>{
 for(const status of ['pending','complete']){const f=fixture({result:{requestID,status}}),response=await respond(request(),config,f.factory);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{requestID,status});assert.deepEqual(f.calls.map(c=>c.name),['read_maintenance_explicit_enrollment','read_maintenance_restore_job_status','read_maintenance_explicit_enrollment']);assert.deepEqual(f.calls[1].args,{target_request:requestID,target_user:userID,verified_session:sessionID,target_epoch:epochID,expected_bundle:config.billing.bundleId,verified_pair_hash:body.pairSHA256,verified_assertion_hash:body.assertionSHA256});}
 for(const options of [{missing:true},{error:{message:'synthetic'}},{result:{requestID,status:'complete',lease:sessionID}},{result:{requestID:epochID,status:'complete'}},{result:{requestID,status:'active'}},{result:{requestID,status:true}},{changedAt:2}]){const f=fixture(options);assert.notEqual((await respond(request(),config,f.factory)).status,200);assert.equal(f.calls.filter(c=>c.name==='read_maintenance_restore_job_status').length,1);}
 for(const options of [{authError:{message:'synthetic'}},{changedAt:1}]){const f=fixture(options);assert.equal((await respond(request(),config,f.factory)).status,503);assert.equal(f.calls.some(c=>c.name==='read_maintenance_restore_job_status'),false);}
 for(const value of [{...body,lease:sessionID},{...body,pairSHA256:'A'.repeat(64)},{...body,assertionSHA256:''},{...body,requestID:'00000000-0000-0000-0000-000000000000'}])assert.equal((await respond(request(value),config,()=>{throw Error('Invalid request reached DB');})).status,400);
 const stopped=new AbortController();stopped.abort();assert.equal((await respond(request(body,stopped.signal),config,()=>{throw Error('Cancelled request reached DB');})).status,503);
 const during=new AbortController(),f=fixture({abort:during});assert.equal((await respond(request(body,during.signal),config,f.factory)).status,503);assert.equal(f.calls.filter(c=>c.name==='read_maintenance_restore_job_status').length,1);
 assert.equal((await respond(request(),null,()=>{throw Error('Disabled factory');})).status,503);assert.equal((await respond(request(),{...config,billing:{...config.billing,environment:'Production'}},()=>{throw Error('Production factory');})).status,503);
 // Auth/HTTP RPC are injected; actual SQL recovery is separately exercised with
 // synthetic enrollment/Apple output. No real Supabase or paid rights verified.
});

test('fixed commit/status entries remain unavailable with the restore flag absent or false',async()=>{
 const {restoreRecoveryEntry}=await import(compile('billing-restore-recovery-entry'));
 for(const operation of ['commit','status'])for(const env of [{},{BILLING_SANDBOX_RESTORE_TRANSFER_ENABLED:'false'}]){
  const response=await restoreRecoveryEntry(request(),operation,env);
  assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
 // Flag check runs before deployment credentials, DB construction or Apple API.
});
