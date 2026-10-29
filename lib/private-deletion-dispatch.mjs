import {open,constants} from 'node:fs/promises';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';
const states=new Set(['idle','busy','unavailable','pending','complete']);
const confirmation='RUN_ONE_SQL_AUTHORIZED_OUCHI_DELETION_JOB';
/** Operator invocation only. No job creation, caller-selected target, policy
 * adoption, credential discovery or scheduler. Execution can erase one eligible
 * server-selected job. Its SQL scope/lease/checker remain mandatory. */
export async function runPrivateDeletionDispatch({args,createRuntime}){
 const execute=args?.[0]==='--execute-authorized-job',keys=['--config','--project-ref','--receipt',...(execute?['--confirmation']:[])];
 if(!Array.isArray(args)||!['--validate-only','--execute-authorized-job'].includes(args[0])||args.length!==1+keys.length*2
  ||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2])
  ||(execute&&args[8]!==confirmation)||typeof createRuntime!=='function')throw Error('Explicit private deletion invocation required');
 const config=await readPrivateOperatorJSON(args[2]);
 if(!/^[a-z]{20}$/.test(args[4])||!config||typeof config!=='object'||Array.isArray(config)||config.projectID!==args[4])throw Error('Exact expected deletion project required');
 // Allocate and sync a new private receipt before runtime construction or claim.
 const handle=await open(args[6],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const persist=async value=>{
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');await handle.truncate(0);let offset=0;
  while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Private dispatch receipt write unavailable');offset+=bytesWritten;}
  await handle.sync();
 };
 const common={kind:'private-ouchi-deletion-dispatch/v1',operation:execute?'execute-one':'validate-only',projectID:args[4],scope:'one-server-selected-ouchi-job',jobCreated:false,sharedAuthDeleted:false,globalCompletionConfirmed:false};
 try{
  await persist({...common,outcome:'unconfirmed',jobMayHaveRun:execute});
  const runtime=createRuntime(config);
  if(typeof runtime?.runNext!=='function')throw Error('Complete deletion runtime required');
  let state='configuration-validated';
  if(execute){
   const result=await runtime.runNext(AbortSignal.timeout(100000));
   if(!result||Object.keys(result).join(',')!=='state'||!states.has(result.state))throw Error('Deletion job outcome unconfirmed');
   state=result.state;
  }
  await persist({...common,outcome:'observed',state,liveCredentialsVerified:execute?null:false,observedAt:new Date().toISOString()});
  return Object.freeze({state,receipt:args[6],scope:common.scope,globalCompletionConfirmed:false,sharedAuthDeleted:false});
 }finally{await handle.close();}
}
