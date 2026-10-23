import {open,constants} from 'node:fs/promises';
import {createHouseholdCopy} from './household-copy.mjs';
import {createHouseholdCopyStorage} from './closure-storage-runtime.mjs';
import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const confirmations=Object.freeze({prepare:'PREPARE_REVIEWED_FAMILY_FILE_COPY',copy:'COPY_REVIEWED_FAMILY_FILE_WITHOUT_ACTIVATION_OR_REMOVAL'});
const flags=Object.freeze({activationConfirmed:false,sourceEraseConfirmed:false,retirementExecuted:false,accountErasureConfirmed:false});
function checked(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['status','prepare','copy'].includes(input.operation))throw Error('Explicit private copy operation required');
 const {operation,confirmation,...scope}=input;
 if(Object.keys(input).some(k=>!['operation','confirmation','decisionID','destinationID','epochID','fileID','intentID','reviewRequestID','userID'].includes(k))
  ||Object.keys(scope).sort().join(',')!==(operation==='prepare'?'decisionID,destinationID,epochID,fileID,intentID,reviewRequestID,userID':'epochID,intentID,reviewRequestID,userID')||!Object.values(scope).every(uuid)
  ||(operation==='status'?Object.hasOwn(input,'confirmation'):confirmation!==confirmations[operation]))throw Error('Exact explicitly reviewed copy request required');
 return {operation,scope:Object.freeze(scope)};
}

/** This adapter cannot make a retention decision, activate a copy, delete a
 * source or retire an account. SQL independently requires a current inspection,
 * explicit account-content decision, operator principal and capacity admission.
 * Unknown writers remain pending; no force/repost/overwrite operation exists.
 */
export async function operatePrivateOperatorCopy({connect,input,storageConfig,expectedProject,signal}){
 const {operation,scope}=checked(input);let storage;
 if(operation==='copy'){
  if(!storageConfig||Object.keys(storageConfig).sort().join(',')!=='projectRef,secretKey'||storageConfig.projectRef!==expectedProject)throw Error('Explicit private copy Storage configuration required');
  storage=createHouseholdCopyStorage({projectID:expectedProject,secretKey:storageConfig.secretKey});
 }else if(storageConfig!==undefined)throw Error('Storage configuration only permitted for copy');
 const port=createHouseholdCopy({connect,storage}),result=await port[operation](scope,signal);
 return Object.freeze({kind:'closure-operator-copy/v1',operation,scope,result,...flags});
}

export async function runPrivateOperatorCopy({args,createClient}){
 const modes={'--read-copy-status':'status','--prepare-reviewed-copy':'prepare','--copy-reviewed-file':'copy'},copy=args?.[0]==='--copy-reviewed-file';
 const keys=['--config','--project-ref','--request','--receipt',...(copy?['--storage-config']:[])];
 if(!Array.isArray(args)||!Object.hasOwn(modes,args[0])||args.length!==1+keys.length*2||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2]))throw Error('Explicit private copy command required');
 const [rawConfig,input,storageConfig]=await Promise.all([readPrivateOperatorJSON(args[2]),readPrivateOperatorJSON(args[6]),copy?readPrivateOperatorJSON(args[10]):undefined]);
 const {operation,scope}=checked(input);if(operation!==modes[args[0]])throw Error('Copy operation must match explicit command');
 const connect=createPrivateOperatorConnection({rawConfig,expectedProject:args[4],createClient,purpose:'decision'});
 if(copy){
  if(!storageConfig||Object.keys(storageConfig).sort().join(',')!=='projectRef,secretKey'||storageConfig.projectRef!==args[4])throw Error('Explicit private copy Storage configuration required');
  createHouseholdCopyStorage({projectID:args[4],secretKey:storageConfig.secretKey});
 }
 const handle=await open(args[8],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const persist=async value=>{
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');await handle.truncate(0);let offset=0;
  while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Private receipt write unavailable');offset+=bytesWritten;}
  await handle.sync();
 };
 try{
  await persist({kind:'closure-operator-copy/v1',operation,scope,outcome:'unconfirmed',...flags});
  const receipt=await operatePrivateOperatorCopy({connect,input,storageConfig,expectedProject:args[4],signal:AbortSignal.timeout(25000)});
  await persist({...receipt,outcome:'observed',observedAt:new Date().toISOString()});
  return Object.freeze({status:receipt.result.state,receipt:args[8],...flags});
 }finally{await handle.close();}
}
