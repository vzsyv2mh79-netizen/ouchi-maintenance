import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {reviewedCleanupFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {rs} from './fixtures/home-handoff-identifiers.mjs';
const hash=createHash('sha256').update('synthetic receipt').digest('hex');
async function fixture({enabled=true}={}){
 const f=await reviewedCleanupFixture();
 if(enabled)await f.db.exec('update maintenance_private.closure_read_policy set enabled=true,lifetime_seconds=3600');
 await f.retire.execute(f.execute,f.signal);return f;
}
async function scoped(f,role,sql,args,{claim=f.scope.userID}={}){
 await f.db.exec('begin;set local role '+role);
 try{await f.db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[claim,JSON.stringify({sub:claim})]);const r=await f.db.query(sql,args);await f.db.exec('commit');return r.rows[0]?.receipt;}
 catch(e){await f.db.exec('rollback');throw e;}
}
const scope=f=>[f.scope.userID,rs,f.scope.epochID,f.submission,f.execute.eventID];
const describe=(f,args=scope(f),options)=>scoped(f,'ouchi_closure_receipt_registrar','select maintenance_private.read_closure_read_window($1,$2,$3,$4,$5) receipt',args,options);
const register=(f,id,expiry,digest=hash)=>scoped(f,'ouchi_closure_receipt_registrar','select maintenance_private.register_closure_read_credential($1,$2,$3,$4,$5,$6,$7,$8) receipt',[...scope(f),id,digest,expiry]);
const read=(f,id,digest=hash,values=[f.scope.epochID,f.submission,f.execute.eventID,id,digest])=>scoped(f,'ouchi_closure_receipt_reader','select maintenance_private.read_closure_credential_progress($1,$2,$3,$4,$5) receipt',values);
test('disabled policy creates no window and enabling later does not backfill an old submission',async()=>{
 const f=await fixture({enabled:false});try{assert.equal(await describe(f),null);await f.db.exec('update maintenance_private.closure_read_policy set enabled=true,lifetime_seconds=3600');assert.equal(await describe(f),null);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_read_windows')).rows[0].n,0);}finally{await f.db.close();}
});
test('scoped descriptor and saved device credential read only the exact Ouchi job; exact registration retry cannot rotate or extend',async()=>{
 const f=await fixture();try{
  const descriptor=await describe(f);assert.equal(descriptor.kind,'app-closure-read-window/v1');assert.equal(descriptor.requestID,f.execute.eventID);assert.notEqual(descriptor.requestID,f.scope.reviewRequestID);assert.match(descriptor.expiresAt,/\.\d{3}Z$/);
  const id=randomUUID(),registered=await register(f,id,descriptor.expiresAt);assert.equal(registered.registered,true);assert.equal(registered.credentialID,id);assert.deepEqual(await register(f,id,descriptor.expiresAt),registered);
  assert.equal((await read(f,id)).state,'pending');assert.equal(await read(f,id,'0'.repeat(64)),null);assert.equal(await read(f,randomUUID()),null);
  await assert.rejects(register(f,id,descriptor.expiresAt,'1'.repeat(64)),/cannot rotate/);
  assert.equal(await register(f,id,new Date(Date.parse(descriptor.expiresAt)+1000).toISOString()),null);
  for(let index=0;index<3;index++){const values=[f.scope.epochID,f.submission,f.execute.eventID,id,hash];values[index]=randomUUID();assert.equal(await read(f,id,hash,values),null);}
  const row=(await f.db.query('select * from maintenance_private.closure_read_credentials')).rows[0];assert.deepEqual(Object.keys(row).sort(),['credential_id','request_id','token_hash']);assert.equal(row.token_hash,hash);
 }finally{await f.db.close();}
});
test('fresh original Auth session remains necessary for descriptor/registration, but saved status credential survives its expiry',async()=>{
 const f=await fixture();try{
  const usersBefore=(await f.db.query('select count(*)::int n from auth.users')).rows[0].n;
  const descriptor=await describe(f),id=randomUUID();await register(f,id,descriptor.expiresAt);
  for(const index of [0,1,2,3,4]){const args=scope(f);args[index]=randomUUID();if(index===0)await assert.rejects(describe(f,args),/Verified submission identity/);else assert.equal(await describe(f,args),null);}
  await assert.rejects(describe(f,scope(f),{claim:randomUUID()}),/Verified submission identity/);
  await f.db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[rs]);
  assert.equal(await describe(f),null);assert.equal(await register(f,randomUUID(),descriptor.expiresAt),null);
  assert.equal((await read(f,id)).state,'pending');
  assert.equal((await f.db.query('select count(*)::int n from auth.users')).rows[0].n,usersBefore);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where id=$1',[rs])).rows[0].n,1);
 }finally{await f.db.close();}
});
test('eight fixed device credentials are admitted without granting a minimum role raw table access or mutation rights',async()=>{
 const f=await fixture();try{
  const d=await describe(f);for(let i=0;i<8;i++)assert.equal((await register(f,randomUUID(),d.expiresAt)).registered,true);
  await assert.rejects(register(f,randomUUID(),d.expiresAt),/device limit/);
  const role='ouchi_closure_receipt_reader';await assert.rejects(scoped(f,role,'select * from auth.sessions',[]),/permission denied/);
  await assert.rejects(scoped(f,role,'select * from maintenance_private.closure_read_credentials',[]),/permission denied/);
  await assert.rejects(scoped(f,role,'select maintenance_private.read_closure_read_window($1,$2,$3,$4,$5) receipt',scope(f)),/permission denied/);
  await assert.rejects(scoped(f,'ouchi_closure_receipt_registrar','select maintenance_private.read_closure_credential_progress($1,$2,$3,$4,$5) receipt',[f.scope.epochID,f.submission,f.execute.eventID,randomUUID(),hash]),/permission denied/);
 }finally{await f.db.close();}
});
test('expired window and credentials prune together without deleting the job or reopening a window',async()=>{
 const f=await fixture();try{
  const d=await describe(f),id=randomUUID();await register(f,id,d.expiresAt);
  await f.db.query("update maintenance_private.closure_read_windows set expires_at=clock_timestamp()-interval '1 second' where request_id=$1",[f.execute.eventID]);
  assert.equal(await read(f,id),null);assert.equal(await describe(f),null);
  await f.db.exec('set role service_role');assert.equal((await f.db.query('select maintenance_private.prune_expired_closure_read_windows(500) n')).rows[0].n,1);await f.db.exec('reset role');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_read_credentials')).rows[0].n,0);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,1);assert.equal(await describe(f),null);
 }finally{await f.db.close();}
});
test('a raw completed flag cannot acknowledge account erasure without the existing canonical sealed evidence',async()=>{
 const f=await fixture();try{
  const d=await describe(f),id=randomUUID();await register(f,id,d.expiresAt);
  await f.db.exec("update maintenance_private.account_deletion_requests set state='complete'");
  assert.equal(await read(f,id),null);
 }finally{await f.db.close();}
});

const {readFileSync}=await import('node:fs');const ts=(await import('typescript')).default;
const modules=new Map();function compile(name){if(name.endsWith('.mjs'))return import.meta.resolve('../lib/'+name);if(modules.has(name))return modules.get(name);let source=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/import ['"]server-only['"];?/g,'');source=source.replace(/from ['"]([^'"]+)['"]/g,(_,dep)=>'from '+JSON.stringify(dep.startsWith('./')?compile(dep.slice(2)):import.meta.resolve(dep)));const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');modules.set(name,url);return url;}
const {createClosureReadCustodyServer}=await import(compile('closure-read-custody'));
function bearer(user){const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return enc({alg:'HS256'})+'.'+enc({sub:user,session_id:rs,exp:Math.floor(Date.now()/1000)+3600})+'.synthetic';}
function request(body,{token,auth,origin,method='POST',signal}={}){return new Request('https://example.invalid/prepared-closure-read',{method,headers:{'content-type':'application/json',...(token?{'x-ouchi-closure-read':token}:{}),...(auth?{authorization:'Bearer '+auth}:{}),...(origin?{origin}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{}),signal});}
test('HTTP preparation uses fresh Auth, saved canonical device key and Ouchi-only SQL; a lost registration COMMIT reply recovers exact custody',async()=>{
 const f=await fixture();try{
  const auth=bearer(f.scope.userID);let authCalls=0;
  const getUser=async value=>{assert.equal(value,auth);authCalls++;return {data:{user:{id:f.scope.userID}},error:null};};
  const describe=createClosureReadCustodyServer({enabled:true,action:'describe',connect:f.connect,getUser});
  const register=createClosureReadCustodyServer({enabled:true,action:'register',connect:f.connect,getUser});
  const status=createClosureReadCustodyServer({enabled:true,action:'status',connect:f.connect});
  const base={requestID:f.execute.eventID,expectedEpochID:f.scope.epochID,submissionID:f.submission};
  const result=await describe(request(base,{auth}));assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');const descriptor=await result.json();
  const token=Buffer.alloc(32,17).toString('base64url'),credentialID=randomUUID(),saved={...base,credentialID},registration={...saved,expiresAt:descriptor.expiresAt};
  f.loseNextCommit();assert.equal((await register(request(registration,{token,auth}))).status,503);
  const recovered=await register(request(registration,{token,auth}));assert.equal(recovered.status,200);assert.equal((await recovered.json()).registered,true);
  const read=await status(request(saved,{token}));assert.equal(read.status,200);assert.equal((await read.json()).state,'pending');assert.equal(authCalls,3);
  const row=(await f.db.query('select token_hash from maintenance_private.closure_read_credentials')).rows[0];assert.equal(row.token_hash,createHash('sha256').update('Ouchi/closure-read/v1\n'+token).digest('hex'));
  assert.equal((await status(request(saved,{token,auth}))).status,400);
  assert.equal((await status(request(saved,{token,origin:'https://foreign.invalid'}))).status,403);
  assert.equal((await status(request({...saved,userID:f.scope.userID},{token}))).status,400);
  assert.equal((await status(request(saved,{token:Buffer.alloc(32,18).toString('base64url')}))).status,404);
  assert.equal((await status(request(saved,{token,method:'GET'}))).status,405);
  assert.equal((await register(request({...registration,expiresAt:new Date(Date.parse(descriptor.expiresAt)+1000).toISOString()},{token,auth}))).status,404);
 }finally{await f.db.close();}
});
test('disabled, failed Auth and cancelled preparation never create a credential',async()=>{
 const f=await fixture();try{
  const base={requestID:f.execute.eventID,expectedEpochID:f.scope.epochID,submissionID:f.submission},auth=bearer(f.scope.userID);
  let calls=0;const getUser=async()=>{calls++;return {data:{user:null},error:Error('Denied')};};
  const disabled=createClosureReadCustodyServer({action:'describe',getUser,connect:f.connect});assert.equal((await disabled(request(base,{auth}))).status,503);assert.equal(calls,0);
  const refused=createClosureReadCustodyServer({enabled:true,action:'describe',getUser,connect:f.connect});assert.equal((await refused(request(base,{auth}))).status,401);
  const controller=new AbortController();controller.abort();assert.equal((await refused(request(base,{auth,signal:controller.signal}))).status,400);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.closure_read_credentials')).rows[0].n,0);
 }finally{await f.db.close();}
});
const {closureReadCustodyDeployment}=await import(compile('closure-read-custody-deployment'));
test('runtime configuration separates registrar from status-reader credentials and refuses generic service credentials or unapproved activation',()=>{
 const project='abcdefghijklmnopqrst',env={OUCHI_CLOSURE_READ_CUSTODY_ENABLED:'true',OUCHI_CLOSURE_READ_CUSTODY_DEPLOYMENT_APPROVED:'true',OUCHI_CLOSURE_READ_CUSTODY_PROJECT_REF:project,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',NEXT_PUBLIC_SUPABASE_URL:`https://${project}.supabase.co`,OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL:`postgres://ouchi_closure_receipt_register_runtime:synthetic@db.${project}.supabase.co/postgres`,OUCHI_CLOSURE_READ_CUSTODY_READ_DATABASE_URL:`postgres://ouchi_closure_receipt_read_runtime:synthetic@db.${project}.supabase.co/postgres`};
 assert.equal(closureReadCustodyDeployment(env,'describe').role,'ouchi_closure_receipt_register_runtime');assert.equal(closureReadCustodyDeployment(env,'status').database.ssl.rejectUnauthorized,true);
 assert.equal(closureReadCustodyDeployment({...env,OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL:undefined},'status').role,'ouchi_closure_receipt_read_runtime');
 for(const change of [{OUCHI_CLOSURE_READ_CUSTODY_DEPLOYMENT_APPROVED:'false'},{OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL:undefined,SUPABASE_SERVICE_ROLE_KEY:'synthetic'},{OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL:env.OUCHI_CLOSURE_READ_CUSTODY_READ_DATABASE_URL},{NEXT_PUBLIC_SUPABASE_URL:'https://foreign.invalid'},{OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL:env.OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL+'?sslmode=disable'}])assert.equal(closureReadCustodyDeployment({...env,...change},'register'),null);
 assert.equal(closureReadCustodyDeployment({...env,OUCHI_CLOSURE_READ_CUSTODY_READ_DATABASE_URL:env.OUCHI_CLOSURE_READ_CUSTODY_REGISTER_DATABASE_URL},'status'),null);
});
