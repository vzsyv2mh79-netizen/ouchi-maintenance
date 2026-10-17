import {createHash} from 'node:crypto';
import {open,constants} from 'node:fs/promises';
import {createAccountContentReviewPorts} from './closure-account-content-review.mjs';
import {createReviewedRetirement} from './reviewed-retirement.mjs';
import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const flags=Object.freeze({workerDispatched:false,accountErasureConfirmed:false,sharedAuthDeleted:false});
function checked(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='confirmation,epochID,eventID,planID,reviewRequestID,sealEventID,userID'
  ||input.confirmation!=='EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS')throw Error('Exact reviewed retirement request required');
 const {confirmation,...scope}=input;
 if(!Object.values(scope).every(uuid))throw Error('Exact reviewed retirement scope required');
 const canonical=Object.fromEntries(Object.entries({...scope,confirmation}).sort(([a],[b])=>a<b?-1:a>b?1:0));
 return {scope:Object.freeze(scope),requestDigest:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};
}
const plan=s=>({planID:s.planID,reviewRequestID:s.reviewRequestID,userID:s.userID,epochID:s.epochID});
const effects=Object.freeze({mayDisableOuchiAccess:true,mayDetachSharedHomeManagement:true,mayRemoveDepartingMemberships:true,mayActivateReviewedFamilyCopies:true,mayQueueScopedErasure:true});

/** A preview is a separate observation, not an execution permit. Its digest
 * binds only immutable input. The SQL executor must recheck the entire current
 * review, writer set, policies, exact seal and capacity under its own locks.
 */
export async function previewPrivateOperatorRetirement({connect,input,signal}){
 const {scope,requestDigest}=checked(input),prior=await createReviewedRetirement({connect}).status(scope,signal);
 const coverage=prior?null:await createAccountContentReviewPorts({connect}).coverage.status(plan(scope),signal);
 return Object.freeze({kind:'closure-operator-retirement-preview/v1',scope,requestDigest,prior,coverage,effects,
  currentMayChange:true,executionEligibilityVerified:false,mutationAuthorized:false,...flags});
}
export async function queuePrivateOperatorRetirement({connect,input,previewDigest,signal}){
 const {scope,requestDigest}=checked(input);
 if(typeof previewDigest!=='string'||!/^[a-f0-9]{64}$/.test(previewDigest)||previewDigest!==requestDigest)throw Error('Exact retirement preview digest required');
 const receipt=await createReviewedRetirement({connect}).execute({...scope,confirmation:input.confirmation},signal);
 return Object.freeze({kind:'closure-operator-retirement/v1',scope,requestDigest,receipt,retirementQueued:true,...flags});
}
export async function readPrivateOperatorRetirement({connect,input,signal}){
 const {scope,requestDigest}=checked(input),receipt=await createReviewedRetirement({connect}).status(scope,signal);
 // Completed erasure can remove this historical metadata. Absence is unknown,
 // never proof that an earlier request did nothing or that erasure completed.
 return Object.freeze({kind:'closure-operator-retirement/v1',scope,requestDigest,receipt,retirementQueued:receipt?true:null,
  absenceMeansNoRetirement:false,completionVerified:false,...flags});
}

export async function runPrivateOperatorRetirement({args,createClient}){
 const modes={'--preview-retirement':'preview','--queue-reviewed-retirement':'queue','--read-retirement-status':'status'},queue=args?.[0]==='--queue-reviewed-retirement';
 const keys=['--config','--project-ref','--request','--receipt',...(queue?['--preview-digest']:[])];
 if(!Array.isArray(args)||!Object.hasOwn(modes,args[0])||args.length!==1+keys.length*2||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2]))throw Error('Explicit retirement command required');
 const [rawConfig,input]=await Promise.all([readPrivateOperatorJSON(args[2]),readPrivateOperatorJSON(args[6])]);
 const {scope,requestDigest}=checked(input);
 if(queue&&args[10]!==requestDigest)throw Error('Exact retirement preview digest required');
 const connect=createPrivateOperatorConnection({rawConfig,expectedProject:args[4],createClient,purpose:'decision'});
 const handle=await open(args[8],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const persist=async value=>{
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');await handle.truncate(0);let offset=0;
  while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Private receipt write unavailable');offset+=bytesWritten;}
  await handle.sync();
 };
 try{
  await persist({kind:'closure-operator-retirement/v1',scope,requestDigest,outcome:'unconfirmed',...flags});
  const mode=modes[args[0]],fn=mode==='preview'?previewPrivateOperatorRetirement:mode==='queue'?queuePrivateOperatorRetirement:readPrivateOperatorRetirement;
  const result=await fn({connect,input,previewDigest:queue?args[10]:undefined,signal:AbortSignal.timeout(15000)});
  const outcome=mode==='preview'?'preview':mode==='queue'?'queued':result.receipt?'observed':'unconfirmed';
  await persist({...result,outcome,observedAt:new Date().toISOString()});
  return Object.freeze({status:outcome,receipt:args[8],...(mode==='preview'?{previewDigest:requestDigest}:{}),...flags});
 }finally{await handle.close();}
}
