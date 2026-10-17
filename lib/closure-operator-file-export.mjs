import {mkdir,open,constants} from 'node:fs/promises';
import {join} from 'node:path';
import {createAccountContentReviewPorts} from './closure-account-content-review.mjs';
import {createPrivateOperatorConnection} from './closure-operator-connection.mjs';
import {readPrivateOperatorJSON} from './closure-operator-inspection.mjs';
import {createClosureFileStorageReader,createClosureHouseholdFileStorageReader} from './closure-storage-runtime.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const flags=Object.freeze({subjectConfirmed:false,retentionApproved:false,retirementExecuted:false,accountErasureConfirmed:false});
function checked(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['personal-file','household-file'].includes(input.operation))throw Error('Exact file inspection operation required');
 const {operation,...scope}=input;
 if(Object.keys(scope).sort().join(',')!=='epochID,expectedMetadataDigest,fileID,inspectionID,reviewRequestID,userID'
  ||![scope.epochID,scope.fileID,scope.inspectionID,scope.reviewRequestID,scope.userID].every(uuid)||typeof scope.expectedMetadataDigest!=='string'||!/^[a-f0-9]{64}$/.test(scope.expectedMetadataDigest))throw Error('Exact file inspection scope required');
 return {operation,scope:Object.freeze(scope)};
}

/** Downloads only the descriptor authorized and hash-checked by the SQL port.
 * A Storage secret has broader underlying powers than this read-only adapter.
 * Its provisioning and the operator role require separate reviewed approval.
 */
export async function inspectPrivateOperatorFile({connect,input,storageConfig,expectedProject,signal}){
 const {operation,scope}=checked(input);
 if(!storageConfig||Object.keys(storageConfig).sort().join(',')!=='projectRef,secretKey'||storageConfig.projectRef!==expectedProject)throw Error('Explicit private Storage configuration required');
 const readFileBytes=(operation==='personal-file'?createClosureFileStorageReader:createClosureHouseholdFileStorageReader)({projectID:expectedProject,secretKey:storageConfig.secretKey});
 const ports=createAccountContentReviewPorts({connect,readFileBytes});
 const {content,...receipt}=await ports[operation==='personal-file'?'personalFiles':'householdFiles'].inspectFile(scope,signal);
 return Object.freeze({operation,scope,content,receipt:Object.freeze({...receipt,...flags})});
}
async function persist(handle,bytes){
 await handle.truncate(0);let offset=0;
 while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,offset);if(!bytesWritten)throw Error('Private export write unavailable');offset+=bytesWritten;}
 await handle.sync();
}
export async function runPrivateOperatorFileExport({args,createClient}){
 const keys=['--config','--storage-config','--project-ref','--request','--output-directory'];
 if(!Array.isArray(args)||args.length!==11||args[0]!=='--inspect-file'||keys.some((key,i)=>args[1+i*2]!==key||typeof args[2+i*2]!=='string'||!args[2+i*2]))throw Error('Explicit file inspection command required');
 const [rawConfig,storageConfig,input]=await Promise.all([readPrivateOperatorJSON(args[2]),readPrivateOperatorJSON(args[4]),readPrivateOperatorJSON(args[8])]);
 const {operation,scope}=checked(input);
 // Validate both configurations before creating output or making a connection.
 const connect=createPrivateOperatorConnection({rawConfig,expectedProject:args[6],createClient,purpose:'decision'});
 if(!storageConfig||Object.keys(storageConfig).sort().join(',')!=='projectRef,secretKey'||storageConfig.projectRef!==args[6])throw Error('Explicit private Storage configuration required');
 createClosureFileStorageReader({projectID:args[6],secretKey:storageConfig.secretKey});
 const directory=args[10];await mkdir(directory,{mode:0o700});
 const receiptPath=join(directory,'inspection.json'),handle=await open(receiptPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{
  await persist(handle,Buffer.from(JSON.stringify({kind:'closure-file-export/v1',operation,scope,outcome:'unconfirmed',...flags},null,2)+'\n'));
  const inspected=await inspectPrivateOperatorFile({connect,input,storageConfig,expectedProject:args[6],signal:AbortSignal.timeout(15000)});
  const filename='attachment.'+({'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[inspected.receipt.mime]);
  const attachment=await open(join(directory,filename),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await persist(attachment,Buffer.from(await inspected.content.arrayBuffer()));}finally{await attachment.close();}
  await persist(handle,Buffer.from(JSON.stringify({kind:'closure-file-export/v1',operation,scope,outcome:'exported',filename,receipt:inspected.receipt,observedAt:new Date().toISOString(),...flags},null,2)+'\n'));
  return Object.freeze({status:'exported',directory,...flags});
 }finally{await handle.close();}
}
