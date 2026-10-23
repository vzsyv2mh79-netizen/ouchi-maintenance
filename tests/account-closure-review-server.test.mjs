import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const modules=new Map();
function moduleURL(name){
 if(modules.has(name))return modules.get(name);
 let source=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,dependency)=>`from ${JSON.stringify(dependency.endsWith('.mjs')?import.meta.resolve('../lib/'+dependency):moduleURL(dependency))}`);
 const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,result);return result;
}
const {createAccountClosureReviewServer}=await import(moduleURL('account-closure-review-server'));
const actors=[1,2].map(n=>({userID:`${n}`.repeat(8)+'-'+`${n}`.repeat(4)+'-4'+`${n}`.repeat(3)+'-8'+`${n}`.repeat(3)+'-'+`${n}`.repeat(12),sessionID:`${n+2}`.repeat(8)+'-'+`${n+2}`.repeat(4)+'-4'+`${n+2}`.repeat(3)+'-8'+`${n+2}`.repeat(3)+'-'+`${n+2}`.repeat(12),epochID:`${n+4}`.repeat(8)+'-'+`${n+4}`.repeat(4)+'-4'+`${n+4}`.repeat(3)+'-8'+`${n+4}`.repeat(3)+'-'+`${n+4}`.repeat(12),email:`synthetic-${n}@example.invalid`}));
const submissionID='77777777-7777-4777-8777-777777777777',reviewRequestID='88888888-8888-4888-8888-888888888888';
const token=actor=>'e30.'+Buffer.from(JSON.stringify({sub:actor.userID,session_id:actor.sessionID,aal:'aal1',exp:4102444800})).toString('base64url')+'.c2ln';
const request=(actor,patch={})=>new Request('https://example.invalid/api/account/closure-review/request',{method:'POST',headers:{authorization:'Bearer '+token(actor),'content-type':'application/json'},body:JSON.stringify({expectedEpochID:actor.epochID,submissionID,confirmation:'REQUEST_OUCHI_ACCOUNT_DELETION',password:'synthetic-password',...patch})});
function fixture({enabled=true,authenticate,afterSnapshot}={}){
 let queries=0,snapshots=0;const writes=[];
 const state=new Map(actors.map(a=>[a.userID,{userID:a.userID,email:a.email,password:'synthetic-hash',factors:[],bannedUntil:null,deletedAt:null}]));
 const policy={projectID:'abcdefghijklmnopqrst',singleSession:false,timeboxSeconds:null,inactivitySeconds:null,assuranceMode:'highest-current-aal/v1',totpVerify:true,phoneVerify:false,webAuthnVerify:false};
 const identityOptions={projectID:policy.projectID,policyReader:Object.assign(async()=>policy,{isCurrent:()=>true}),getUser:async bearer=>{
  const actor=actors.find(a=>token(a)===bearer);return {data:{user:actor?{id:actor.userID,email:actor.email}:null},error:null};
 }};
 const transactions={run:async(signal,work)=>{
  const pending=[];
  const value=await work({query:async(sql,args)=>{
   signal.throwIfAborted();queries++;
   if(sql.includes('reauthentication_state')){
    const value=structuredClone(state.get(args[0]));snapshots++;afterSnapshot?.(state,snapshots);return {rows:[{reauthentication_state:value}]};
   }
   if(sql.includes('verified_at')){const a=actors.find(a=>a.sessionID===args[0]&&a.userID===args[1]);return {rows:a?[{verified_at:Date.now(),epoch_id:a.epochID,session_aal:'aal1',has_verified_factor:false,session_current:true}]:[]};}
   if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(sql.includes('pg_catalog.pg_constraint'))return {rows:[{supported:true}]};
   if(sql.startsWith('select id from auth.users'))return {rows:[{id:args[0]}]};
   if(sql.startsWith('select id from auth.sessions'))return {rows:[{id:args[0]}]};
   if(sql.startsWith('select id from auth.mfa_factors'))return {rows:[]};
   if(sql.includes('for update of e,a,b'))return {rows:[{epoch_id:actors.find(a=>a.userID===args[0]).epochID}]};
   assert.match(sql,/select public.request_maintenance_closure_review/);pending.push(args[0]);
   return {rows:[{receipt:{kind:'app-closure-review/v2',state:'review_required',reviewRequestID,epochID:args[2],submissionID:args[3]}}]};
  }});signal.throwIfAborted();writes.push(...pending);return value;
 }};
 const server=createAccountClosureReviewServer({enabled,identityOptions,transactions,authenticate:authenticate??(async email=>{await new Promise(done=>setImmediate(done));return actors.find(a=>a.email===email)?.userID??null;})});
 return {server,writes,queries:()=>queries};
}
test('one shared server keeps concurrent original identities and witnesses separate',async()=>{
 const f=fixture();const replies=await Promise.all(actors.map(a=>f.server(request(a),'request')));
 for(let i=0;i<actors.length;i++){assert.equal(replies[i].status,202);assert.equal((await replies[i].json()).epochID,actors[i].epochID);}
 assert.deepEqual([...f.writes].sort(),actors.map(a=>a.userID).sort());
});
test('disabled server or invalid body never touches Auth database state',async()=>{
 const disabled=fixture({enabled:false});const response=await disabled.server(request(actors[0]),'request');assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(disabled.queries(),0);
 const f=fixture();assert.equal((await f.server(request(actors[0],{userID:actors[1].userID}),'request')).status,400);assert.equal(f.queries(),0);
});
test('failed password authentication cannot create review intake',async()=>{
 const f=fixture({authenticate:async()=>null});assert.equal((await f.server(request(actors[0]),'request')).status,403);assert.deepEqual(f.writes,[]);
});
test('credential change after password snapshots but before pins refuses intake',async()=>{
 const f=fixture({afterSnapshot:(state,n)=>{if(n===2)state.get(actors[0].userID).password='changed-synthetic-hash';}});
 assert.equal((await f.server(request(actors[0]),'request')).status,503);assert.deepEqual(f.writes,[]);
});
