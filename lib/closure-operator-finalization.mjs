import {open,constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAccountContentReviewPorts} from './closure-account-content-review.mjs';
import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function request(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['redact-text','seal-coverage'].includes(input.operation))throw Error('Explicit finalization request required');
 const {operation,...scope}=input,redact=operation==='redact-text';
 const keys=redact?'confirmation,epochID,eventID,expectedDigest,itemKey,planID,replacement,reviewRequestID,userID':'confirmation,epochID,eventID,evidenceDigest,planID,reviewRequestID,userID';
 if(Object.keys(scope).sort().join(',')!==keys||![scope.planID,scope.reviewRequestID,scope.userID,scope.epochID,scope.eventID].every(uuid))throw Error('Exact finalization scope required');
 if(redact?(!hash(scope.expectedDigest)||typeof scope.itemKey!=='string'||scope.itemKey.length>240||!/^text:[A-Za-z0-9_:-]+$/.test(scope.itemKey)
  ||!(scope.replacement===null||typeof scope.replacement==='string')||(typeof scope.replacement==='string'&&(!scope.replacement.isWellFormed()||scope.replacement.includes('\0')||Buffer.byteLength(scope.replacement)>65536))||scope.confirmation!=='REDACT_REVIEWED_COVERAGE_TEXT')
  :(!hash(scope.evidenceDigest)||scope.confirmation!=='CONFIRM_COMPLETE_APP_SCOPED_REVIEW'))throw Error('Explicit reviewed finalization required');
 const normalized=Object.fromEntries(Object.entries({operation,...scope}).sort(([a],[b])=>a<b?-1:a>b?1:0));
 const requestDigest=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
 return {operation,scope:Object.freeze(scope),requestDigest};
}
const planScope=s=>({planID:s.planID,reviewRequestID:s.reviewRequestID,userID:s.userID,epochID:s.epochID});
const flags=Object.freeze({retirementExecuted:false,accountErasureConfirmed:false,mutationAuthorized:false});

/** A preview digest binds content, not human approval or authorization. SQL
 * still authenticates the operator and compares current scoped content. */
export async function previewPrivateOperatorFinalization({connect,input,signal}){
 const {operation,scope,requestDigest}=request(input),ports=createAccountContentReviewPorts({connect});
 let detail;
 if(operation==='redact-text'){
  const before=await ports.coverage.readText({...planScope(scope),itemKey:scope.itemKey},signal);
  if(before.digest!==scope.expectedDigest||before.value===scope.replacement)throw Error('Current changed text required for preview');
  detail=Object.freeze({before:before.value,replacement:scope.replacement,expectedDigest:before.digest,requiresNewCapture:true});
 }else detail=await ports.coverage.status(planScope(scope),signal);
 return Object.freeze({kind:'closure-operator-finalization-preview/v1',operation,scope,requestDigest,detail,outcome:'preview',currentMayChange:true,...flags});
}
export async function applyPrivateOperatorFinalization({connect,input,previewDigest,signal}){
 const {operation,scope,requestDigest}=request(input);
 if(!hash(previewDigest)||previewDigest!==requestDigest)throw Error('Exact preview digest required');
 const ports=createAccountContentReviewPorts({connect});
 const result=await ports.coverage[operation==='redact-text'?'redactText':'seal'](scope,signal);
 return Object.freeze({kind:'closure-operator-finalization/v1',operation,scope,requestDigest,result,outcome:'recorded',requiresNewCapture:operation==='redact-text',...flags});
}

export async function runPrivateOperatorFinalization({args,createClient}){
 const keys=['--config','--project-ref','--request','--receipt'],preview=args?.[0]==='--preview';
 if(!Array.isArray(args)||!['--preview','--apply-reviewed'].includes(args[0])||args.length!==(preview?9:11)
  ||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2])||(!preview&&args[9]!=='--preview-digest'))throw Error('Explicit finalization command required');
 const [rawConfig,input]=await Promise.all([readPrivateOperatorJSON(args[2]),readPrivateOperatorJSON(args[6])]);
 const {requestDigest}=request(input);
 if(!preview&&(!hash(args[10])||args[10]!==requestDigest))throw Error('Exact preview digest required');
 const connect=createPrivateOperatorConnection({rawConfig,expectedProject:args[4],createClient,purpose:'decision'});
 const handle=await open(args[8],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const write=async value=>{
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');await handle.truncate(0);let offset=0;
  while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Private result write unavailable');offset+=bytesWritten;}
  await handle.sync();
 };
 try{
  await write({kind:'closure-operator-finalization/v1',requestDigest,outcome:'unconfirmed',...flags});
  const signal=AbortSignal.timeout(15000);
  const result=preview?await previewPrivateOperatorFinalization({connect,input,signal}):await applyPrivateOperatorFinalization({connect,input,previewDigest:args[10],signal});
  await write({...result,observedAt:new Date().toISOString()});
  return Object.freeze({status:result.outcome,receipt:args[8],...(preview?{previewDigest:requestDigest}:{}),...flags});
 }finally{await handle.close();}
}
