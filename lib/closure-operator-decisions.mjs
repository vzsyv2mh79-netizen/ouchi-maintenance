import {open,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {createAccountContentReviewPorts} from './closure-account-content-review.mjs';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';

function decisionRoute(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Explicit reviewed decision required');
 const {operation,...scope}=input;
 const routes={'text-decision':['coverage','recordTextDecision'],'file-decision':['personalFiles','recordFileDecision'],'household-file-decision':['householdFiles','recordFileDecision']};
 if(!Object.hasOwn(routes,operation))throw Error('Reviewed decision operation required');
 return {operation,scope:Object.freeze(scope),route:routes[operation]};
}

/** Records human judgement only. No capture, redaction, copy, sealing,
 * dispatch or account deletion can be selected through this tool. Existing
 * ports validate scope/confirmation and versioned SQL checks current evidence.
 * Reuse the same input/event after an uncertain commit; never invent a retry ID.
 */
export async function recordPrivateOperatorDecision({connect,input,signal}){
 const {operation,scope,route}=decisionRoute(input);
 const ports=createAccountContentReviewPorts({connect});
 const result=await ports[route[0]][route[1]](scope,signal);
 return Object.freeze({kind:'closure-operator-decision/v1',operation,scope,result,
  outcome:'recorded',accountErasureConfirmed:false,retirementExecuted:false});
}

export async function runPrivateOperatorDecision({args,createClient}){
 const keys=['--config','--project-ref','--request','--receipt'];
 if(!Array.isArray(args)||args.length!==9||args[0]!=='--record-reviewed-decision'
  ||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2]))throw Error('Explicit decision command required');
 const [rawConfig,input]=await Promise.all([readPrivateOperatorJSON(args[2]),readPrivateOperatorJSON(args[6])]);
 decisionRoute(input);
 const connect=createPrivateOperatorConnection({rawConfig,expectedProject:args[4],createClient,purpose:'decision'});
 // Allocate a private, exclusive receipt before any SQL. A stale/failed output
 // must never silently lose a successful acknowledgement or trigger a replay.
 const handle=await open(args[8],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const requestDigest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const write=async value=>{
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
  await handle.truncate(0);let offset=0;
  while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Receipt write unavailable');offset+=bytesWritten;}
  await handle.sync();
 };
 try{
  await write({kind:'closure-operator-decision/v1',requestDigest,outcome:'unconfirmed',accountErasureConfirmed:false,retirementExecuted:false});
  const report=await recordPrivateOperatorDecision({connect,input,signal:AbortSignal.timeout(15000)});
  await write({...report,requestDigest});
  return Object.freeze({status:'recorded',receipt:args[8],accountErasureConfirmed:false,retirementExecuted:false});
 }finally{await handle.close();}
}
