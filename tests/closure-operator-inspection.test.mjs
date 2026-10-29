import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,link,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {product} from './fixtures/home-handoff-identifiers.mjs';
import {operatorInspectionConfig,createOperatorInspectionConnection,readPrivateOperatorJSON,inspectClosureOperatorRequest,renderOperatorInspection,savePrivateOperatorInspection,runPrivateOperatorInspection} from '../lib/closure-operator-inspection.mjs';
const project='abcdefghijklmnopqrst';
const config={projectRef:project,databaseURL:`postgresql://ouchi_closure_inspection_runtime:synthetic-test-password@db.${project}.supabase.co/postgres`};
const actualSQL=process.env.OUCHI_OPERATOR_INSPECTION_SQL_TEST==='true';
const databaseFactory=actualSQL?async()=>{
 const port=Number(process.env.OUCHI_TEST_DB_PORT);assert.ok(Number.isInteger(port)&&port>1024&&port<65536);
 const client=new Client({host:'127.0.0.1',port,user:'postgres',password:'synthetic-ci-only',database:'postgres',connectionTimeoutMillis:3000,query_timeout:10000});await client.connect();
 assert.match((await client.query('show server_version')).rows[0].server_version,/^17\.6(?:\D|$)/);
 return {query:(sql,args)=>client.query(sql,args),exec:sql=>client.query(sql),close:()=>client.end()};
}:undefined;

test('inspection config pins project and operator role, rejects admin/fallback/foreign parameters and always verifies TLS',()=>{
 const good=operatorInspectionConfig(config,project);assert.equal(good.database.ssl.rejectUnauthorized,true);assert.equal(good.database.user,'ouchi_closure_inspection_runtime');assert.equal(good.database.port,5432);
 for(const raw of [{...config,projectRef:'other'},{...config,databaseURL:config.databaseURL.replace('ouchi_closure_inspection_runtime','postgres')},{...config,databaseURL:config.databaseURL+'?sslmode=disable'},{...config,databaseURL:config.databaseURL.replace('5432','6543').replace('/postgres',':6543/postgres')},{...config,databaseURL:config.databaseURL.replace('db.'+project+'.supabase.co','attacker.example')},{...config,serviceKey:'must-not-be-used'},{...config,ca:'invalid certificate'}])assert.equal(operatorInspectionConfig(raw,project),null);
 assert.equal(operatorInspectionConfig(config,'zzzzzzzzzzzzzzzzzzzz'),null);
 const pool={...config,databaseURL:`postgres://ouchi_closure_inspection_runtime.${project}:synthetic-test-password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`};assert.equal(operatorInspectionConfig(pool,project).database.ssl.rejectUnauthorized,true);
});

test('verified dedicated principal precedes role selection and wrong principal closes the transport',async()=>{
 for(const valid of [true,false]){
  const calls=[];let ended=0;
  const connect=createOperatorInspectionConnection({rawConfig:config,expectedProject:project,createClient:cfg=>{
   assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.connectionTimeoutMillis,3000);assert.equal(cfg.query_timeout,5000);
   return {on(){},async connect(){calls.push('connect');},async end(){ended++;},async query(sql){calls.push(sql);return {rows:sql.startsWith('select session_user')?[{principal:valid?'ouchi_closure_inspection_runtime':'postgres',database:'postgres'}]:[]};}};
  }});
  if(valid){const connection=await connect({signal:AbortSignal.timeout(5000)});await connection.query('BEGIN READ ONLY');assert.equal(calls.at(-1),'SET LOCAL ROLE ouchi_closure_inspector');await connection.close();}
  else await assert.rejects(connect({signal:AbortSignal.timeout(5000)}),/principal unavailable/);
  assert.equal(ended,1);assert.equal(calls[1].startsWith('select session_user'),true);
  if(!valid)assert.equal(calls.some(x=>x.startsWith('SET LOCAL ROLE')),false);
 }
});

test('private file reader refuses public permissions, links, malformed and oversized input; output is exclusive and private',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-operator-inspection-'));
 try{
  const input=join(directory,'config.json');await writeFile(input,JSON.stringify(config),{mode:0o600});assert.deepEqual(await readPrivateOperatorJSON(input),config);
  await chmod(input,0o644);await assert.rejects(readPrivateOperatorJSON(input),/Private operator input/);await chmod(input,0o600);
  const symbolic=join(directory,'symbolic.json');await symlink(input,symbolic);await assert.rejects(readPrivateOperatorJSON(symbolic));
  const hard=join(directory,'hard.json');await link(input,hard);await assert.rejects(readPrivateOperatorJSON(input),/Private operator input/);await rm(hard);
  const large=join(directory,'large.json');await writeFile(large,'x'.repeat(98305),{mode:0o600});await assert.rejects(readPrivateOperatorJSON(large),/Private operator input/);
  const malformed=join(directory,'malformed.json');await writeFile(malformed,'{',{mode:0o600});await assert.rejects(readPrivateOperatorJSON(malformed));
  const fifo=join(directory,'input.pipe');const made=spawnSync('mkfifo',[fifo],{encoding:'utf8',timeout:1000});assert.equal(made.status,0);await assert.rejects(readPrivateOperatorJSON(fifo),/Private operator input/);
  const output=join(directory,'review.html'),report={kind:'closure-operator-inspection/v1',operation:'queue',scope:{afterReview:null},observedAt:'synthetic time',approvalRecorded:false,accountErasureConfirmed:false,result:[]};
  await savePrivateOperatorInspection(output,report);assert.equal((await stat(output)).mode&0o777,0o600);const before=await readFile(output,'utf8');await assert.rejects(savePrivateOperatorInspection(output,report));assert.equal(await readFile(output,'utf8'),before);
  const invalid=join(directory,'invalid.html');await assert.rejects(savePrivateOperatorInspection(invalid,{}));await assert.rejects(stat(invalid),{code:'ENOENT'});
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('inspector reads real scoped SQL metadata and text, renders untrusted content inertly and refuses mutation or withdrawn scope',async()=>{
 const f=await householdCopyFixture({databaseFactory});
 try{
  await f.db.exec(readFileSync('supabase/migrations/20261016161923_ouchi_closure_household_file_review.sql','utf8'));
  await f.db.exec(readFileSync('supabase/migrations/20261017031407_ouchi_private_operator_inspection.sql','utf8'));
  let inspectionConnect=async options=>{
   const connection=await f.connect(options);
   return {...connection,query:async(sql,args)=>{
    const result=await connection.query(sql,args);
    if(sql==='BEGIN'||sql==='BEGIN READ ONLY')await connection.query('SET LOCAL ROLE ouchi_closure_inspector');
    return result;
   }};
  };
  let actualInspectorClient;
  if(actualSQL){
   await f.db.exec("create role ouchi_closure_inspection_runtime login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'synthetic-inspector-fixture-only';grant ouchi_closure_inspector to ouchi_closure_inspection_runtime;insert into maintenance_private.closure_operator_principals values('ouchi_closure_inspection_runtime',true)");
   actualInspectorClient=cfg=>{
    assert.equal(cfg.host,'db.'+project+'.supabase.co');assert.equal(cfg.ssl.rejectUnauthorized,true);
    // Explicit disposable transport alias. This tests the actual restricted
    // LOGIN and session_user probe, but does not verify managed TLS or credentials.
    return new Client({...cfg,host:'127.0.0.1',port:Number(process.env.OUCHI_TEST_DB_PORT),database:'postgres',password:'synthetic-inspector-fixture-only',ssl:false});
   };
   inspectionConnect=createOperatorInspectionConnection({rawConfig:config,expectedProject:project,createClient:actualInspectorClient});
  }
  const scope={reviewRequestID:f.input.reviewRequestID,userID:f.input.userID,epochID:f.input.epochID};
  const run=input=>inspectClosureOperatorRequest({connect:inspectionConnect,input,signal:f.signal});
  const queue=await run({operation:'queue',afterReview:null});assert.equal(queue.result.length,1);assert.equal(queue.approvalRecorded,false);assert.equal(queue.accountErasureConfirmed,false);
  const fields=await run({operation:'fields',...scope,afterKey:null});assert.ok(fields.result.items.length>0);assert.equal(fields.result.consistentSnapshot,false);
  const malicious='<img src="https://attacker.example/leak" onerror="alert(1)"><script>secret()</script>';
  await f.db.query('update public.products set memo=$1 where id=$2',[malicious,product]);
  const field=await run({operation:'field',...scope,relation:'products',recordID:product,field:'memo'});assert.equal(field.result.value,malicious);
  assert.deepEqual(field.scope,{...scope,relation:'products',recordID:product,field:'memo'});assert.equal(Object.isFrozen(field.scope),true);
  const html=renderOperatorInspection(field);assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<img '),false);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('default-src &#39;none&#39;')||html.includes("default-src 'none'"));
  if(actualSQL){
   const directory=await mkdtemp(join(tmpdir(),'ouchi-private-inspector-flow-'));
   try{
    const credential=join(directory,'config.json'),request=join(directory,'request.json'),output=join(directory,'review.html');
    await writeFile(credential,JSON.stringify(config),{mode:0o600});await writeFile(request,JSON.stringify({operation:'field',...scope,relation:'products',recordID:product,field:'memo'}),{mode:0o600});
    const saved=await runPrivateOperatorInspection({args:['--config',credential,'--project-ref',project,'--request',request,'--output',output],createClient:actualInspectorClient});
    assert.equal(saved.status,'saved');assert.equal(saved.approvalRecorded,false);assert.equal((await stat(output)).mode&0o777,0o600);
    const rendered=await readFile(output,'utf8');assert.ok(rendered.includes('&lt;img'));assert.equal(rendered.includes('<script>'),false);assert.equal(rendered.includes('synthetic-test-password'),false);assert.equal(rendered.includes('synthetic-inspector-fixture-only'),false);
   }finally{await rm(directory,{recursive:true,force:true});}
  }
  const files=await run({operation:'files',...scope,afterFile:null});assert.equal(files.result.items.length,1);
  const household=await run({operation:'household-files',...scope,afterFile:null});assert.equal(household.result.items.length,0);
  let connections=0;
  for(const operation of ['record','redact','seal','copy','retire','worker'])await assert.rejects(inspectClosureOperatorRequest({connect:async()=>{connections++;throw Error('Unexpected connection');},input:{operation},signal:f.signal}),/Read-only inspection/);
  assert.equal(connections,0);
  const allowed=(await f.db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','maintenance_private') and p.prokind='f' and has_function_privilege('ouchi_closure_inspector',p.oid,'execute') order by p.proname")).rows.map(x=>x.proname);
  assert.deepEqual(allowed,['closure_operator_queue','closure_review_field_inventory','closure_review_file_inventory','closure_review_household_file_inventory','read_closure_redaction_field']);
  await f.db.exec('set role ouchi_closure_inspector');
  await assert.rejects(f.db.query('select * from auth.users'),/permission denied/);
  await assert.rejects(f.db.query('select * from public.products'),/permission denied/);
  await assert.rejects(f.db.query('select maintenance_private.record_closure_file_decision(null,null,null,null,null,null,null,null)'),/permission denied/);
  await f.db.exec('reset role');
  await f.db.exec('update maintenance_private.closure_operator_principals set enabled=false');
  await assert.rejects(run({operation:'queue',afterReview:null}),/Authorized operator connection required/);
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.account_deletion_requests')).rows[0].n,0);
 }finally{await f.db.close();}
});

test('CLI refuses unsafe credential file before connection and never prints its password or driver details',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-operator-cli-'));
 try{
  const input=join(directory,'credential.json'),request=join(directory,'request.json'),output=join(directory,'review.html');
  await writeFile(input,JSON.stringify(config),{mode:0o644});await chmod(input,0o644);await writeFile(request,JSON.stringify({operation:'queue',afterReview:null}),{mode:0o600});
  const result=spawnSync(process.execPath,[resolve('scripts/inspect-maintenance-closure.mjs'),'--config',input,'--project-ref',project,'--request',request,'--output',output],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);assert.ok(result.stderr.includes('Inspection unavailable'));assert.equal((result.stdout+result.stderr).includes('synthetic-test-password'),false);assert.equal((result.stdout+result.stderr).includes('postgresql://'),false);await assert.rejects(stat(output),{code:'ENOENT'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
