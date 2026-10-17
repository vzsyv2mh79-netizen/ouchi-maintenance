import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runPrivateDeletionDispatch} from '../lib/private-deletion-dispatch.mjs';
const projectID='abcdefghijklmnopqrst',principal='ouchi_retirement_file_runtime';
const config={projectID,secretKey:'sb_secret_synthetic_dispatch_config',fileExecutorConfig:{projectRef:projectID,databaseURL:`postgresql://${principal}:synthetic-private-dispatch@db.${projectID}.supabase.co/postgres`}};
const token='RUN_ONE_SQL_AUTHORIZED_OUCHI_DELETION_JOB';

test('private dispatcher refuses implicit execution, caller targets and wrong project before runtime acquisition',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-dispatch-guard-'));let acquired=0;
 try{
  const input=join(directory,'config.json'),receipt=join(directory,'receipt.json');await writeFile(input,JSON.stringify(config),{mode:0o600});
  const base=['--config',input,'--project-ref',projectID,'--receipt',receipt],createRuntime=()=>{acquired++;throw Error('Unexpected runtime');};
  for(const args of [['--execute-authorized-job',...base],['--execute-authorized-job',...base,'--confirmation','implicit'],['--force',...base],['--validate-only',...base,'--user','anyone']])await assert.rejects(runPrivateDeletionDispatch({args,createRuntime}));
  await assert.rejects(runPrivateDeletionDispatch({args:['--validate-only','--config',input,'--project-ref','bbbbbbbbbbbbbbbbbbbb','--receipt',receipt],createRuntime}));assert.equal(acquired,0);await assert.rejects(stat(receipt),{code:'ENOENT'});
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('private invocation syncs receipt before claim, preserves uncertainty and never overwrites or claims global completion',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-dispatch-receipt-'));
 try{
  const input=join(directory,'config.json');await writeFile(input,JSON.stringify(config),{mode:0o600});
  const args=(name,execute=true)=>[execute?'--execute-authorized-job':'--validate-only','--config',input,'--project-ref',projectID,'--receipt',join(directory,name),...(execute?['--confirmation',token]:[])];
  let acquired=0,executed=0;
  const runtime={runNext:async signal=>{executed++;assert.ok(signal instanceof AbortSignal);const pending=JSON.parse(await readFile(join(directory,'unknown.json'),'utf8'));assert.equal(pending.outcome,'unconfirmed');assert.equal(pending.jobMayHaveRun,true);throw Error('synthetic response lost');}};
  const createRuntime=value=>{acquired++;assert.deepEqual(value,config);return runtime;};
  await runPrivateDeletionDispatch({args:args('validated.json',false),createRuntime});assert.equal(executed,0);assert.equal(JSON.parse(await readFile(join(directory,'validated.json'),'utf8')).liveCredentialsVerified,false);
  await assert.rejects(runPrivateDeletionDispatch({args:args('unknown.json'),createRuntime}),/response lost/);assert.equal(JSON.parse(await readFile(join(directory,'unknown.json'),'utf8')).outcome,'unconfirmed');assert.equal((await stat(join(directory,'unknown.json'))).mode&0o777,0o600);
  const before=acquired;await assert.rejects(runPrivateDeletionDispatch({args:args('unknown.json'),createRuntime}),{code:'EEXIST'});assert.equal(acquired,before);assert.equal(executed,1);
  for(const state of ['idle','pending','unavailable','busy','complete']){
   const result=await runPrivateDeletionDispatch({args:args(state+'.json'),createRuntime:()=>({runNext:async()=>({state})})});assert.equal(result.state,state);assert.equal(result.globalCompletionConfirmed,false);assert.equal(result.sharedAuthDeleted,false);
  }
  await assert.rejects(runPrivateDeletionDispatch({args:args('bad-state.json'),createRuntime:()=>({runNext:async()=>({state:'complete',untrusted:true})})}),/outcome unconfirmed/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('actual Node server command loads trusted TypeScript for validation, requires server conditions and refuses unsafe inputs without leaking secrets',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ouchi-dispatch-executable-'));
 try{
  const input=join(directory,'config.json');await writeFile(input,JSON.stringify(config),{mode:0o600});
  const command=(name,server=true)=>spawnSync(process.execPath,[...(server?['--conditions=react-server']:[]),'scripts/run-maintenance-deletion.mjs','--validate-only','--config',input,'--project-ref',projectID,'--receipt',join(directory,name)],{encoding:'utf8',timeout:10000});
  const valid=command('validated.json');assert.equal(valid.status,0,valid.stderr);assert.equal(valid.stderr,'');assert.equal(JSON.parse(valid.stdout).state,'configuration-validated');assert.equal(JSON.parse(await readFile(join(directory,'validated.json'),'utf8')).liveCredentialsVerified,false);
  const wrongContext=command('wrong-context.json',false);assert.equal(wrongContext.status,1);assert.equal(wrongContext.stdout,'');assert.match(wrongContext.stderr,/outcome unconfirmed/);await assert.rejects(stat(join(directory,'wrong-context.json')),{code:'ENOENT'});
  await chmod(input,0o644);const unsafe=command('unsafe.json');assert.equal(unsafe.status,1);assert.equal(unsafe.stdout,'');
  for(const result of [valid,wrongContext,unsafe])for(const secret of [config.secretKey,'synthetic-private-dispatch','postgresql://'])assert.equal((result.stdout+result.stderr).includes(secret),false);
  await assert.rejects(stat(join(directory,'unsafe.json')),{code:'ENOENT'});
 }finally{await rm(directory,{recursive:true,force:true});}
});
