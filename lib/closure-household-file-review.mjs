// Retention review must exclude departing-account content, including authored
// shared content, as well as personal information. This operator acknowledgement
// is not automated authorship discovery or permission to skip scoped SQL checks.
import {createHash} from 'node:crypto';
import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const fileMimes=Object.freeze({'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'});
const fileStates=['staged','active','removed'],writeStates=['untracked','missing','started','settled'];
const digest=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function checkedFileScope(input,read){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped file review required');
 const fixed=Object.freeze({...input});
 if(Object.keys(fixed).sort().join(',')!==(read?'epochID,expectedMetadataDigest,fileID,reviewRequestID,userID':'afterFile,epochID,reviewRequestID,userID')
  ||![fixed.reviewRequestID,fixed.userID,fixed.epochID].every(uuid)
  ||(read?(!uuid(fixed.fileID)||!digest(fixed.expectedMetadataDigest)):!(fixed.afterFile===null||uuid(fixed.afterFile))))throw Error('Scoped file review required');
 return fixed;
}
function checkedFileRow(row){
 if(!row||Object.keys(row).sort().join(',')!=='attachment_id,file_state,home_id,home_instance_id,metadata_digest,mime,product_id,removal_pending,size_bytes,write_state'
  ||![row.attachment_id,row.product_id].every(uuid)||!((row.home_id===null&&row.home_instance_id===null)||(uuid(row.home_id)&&uuid(row.home_instance_id)))
  ||!Object.hasOwn(fileMimes,row.mime)||!fileStates.includes(row.file_state)||!writeStates.includes(row.write_state)
  ||typeof row.removal_pending!=='boolean'||!digest(row.metadata_digest)
  ||!(Number.isSafeInteger(row.size_bytes)||(typeof row.size_bytes==='string'&&/^[1-9][0-9]{0,6}$/.test(row.size_bytes))))throw Error('File inventory unconfirmed');
 const size=Number(row.size_bytes);if(!Number.isSafeInteger(size)||size<1||size>5242880)throw Error('File inventory unconfirmed');
 return Object.freeze({...row,size_bytes:size});
}
function checkedFileReceipt(result,fixed){
    const value=result?.rows?.length===1?result.rows[0].receipt:null,f=value?.file;
    if(!value||Object.keys(value).sort().join(',')!=='accountErasureConfirmed,file,metadataDigest'||value.accountErasureConfirmed!==false||value.metadataDigest!==fixed.expectedMetadataDigest
     ||!f||Object.keys(f).sort().join(',')!=='attachmentID,bucket,expectedSHA256,homeID,homeInstanceID,mime,objectPath,productID,removalPending,sha256,sizeBytes,state,subjectConfirmed,writeState'
     ||f.attachmentID!==fixed.fileID||![f.homeID,f.homeInstanceID,f.productID].every(uuid)
     ||!((f.homeID===null&&f.homeInstanceID===null)||(uuid(f.homeID)&&uuid(f.homeInstanceID)))
     ||f.bucket!=='ouchi-product-attachments'||!Object.hasOwn(fileMimes,f.mime)||!fileStates.includes(f.state)||!writeStates.includes(f.writeState)
     ||typeof f.removalPending!=='boolean'||f.subjectConfirmed!==false||!Number.isSafeInteger(f.sizeBytes)||f.sizeBytes<1||f.sizeBytes>5242880
     ||!(f.sha256===null||digest(f.sha256))||!(f.expectedSHA256===null||digest(f.expectedSHA256))
     ||f.objectPath!==`households/${f.homeInstanceID}/${f.attachmentID}.${fileMimes[f.mime]}`)throw Error('Reviewed file unconfirmed');
    return Object.freeze({...value,file:Object.freeze({...f})});
}
async function boundedFileRead(promise,signal){
 signal.throwIfAborted();let stop;const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener('abort',stop);}
}
const fileReadSQL='select maintenance_private.read_closure_review_household_file($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as receipt';
const fileReadArgs=fixed=>[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID,fixed.expectedMetadataDigest];
/** Dormant household-file evidence port; metadata scope is not subject
 * approval, a complete inventory seal, activation or erasure authority. */
export function createClosureHouseholdFileReview({connect,readFileBytes}){
 const transaction=createReceiptTransactions({connect});
 return Object.freeze({
  async fileInventory(input,signal){
   const fixed=checkedFileScope(input,false);
   return transaction(async tx=>{
    const result=await tx.query('select * from maintenance_private.closure_review_household_file_inventory($1::uuid,$2::uuid,$3::uuid,$4::uuid)',[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.afterFile]);
    if(!Array.isArray(result?.rows)||result.rows.length>51)throw Error('File inventory unconfirmed');
    let prior=fixed.afterFile;
    const rows=result.rows.map(value=>{const row=checkedFileRow(value);if(prior!==null&&row.attachment_id<=prior)throw Error('File inventory unconfirmed');prior=row.attachment_id;return row;});
    const items=Object.freeze(rows.slice(0,50)),hasMore=rows.length>50;
    return Object.freeze({items,hasMore,nextCursor:hasMore?items.at(-1).attachment_id:null,consistentSnapshot:false,subjectConfirmed:false,accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async readFile(input,signal){
   const fixed=checkedFileScope(input,true);
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.read_closure_review_household_file($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as receipt',[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID,fixed.expectedMetadataDigest]);
    return checkedFileReceipt(result,fixed);
   },{signal,readOnly:false});
  },
  async inspectFile(input,callerSignal){
   if(!input||typeof input!=='object'||Array.isArray(input)||!uuid(input.inspectionID))throw Error('Scoped inspection ID required');
   const {inspectionID,...scope}=input;const fixed=checkedFileScope(scope,true);
   if(typeof readFileBytes!=='function'||!(callerSignal instanceof AbortSignal))throw Error('Bounded private file reader required');
   const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(5000)]);
   return transaction(async tx=>{
    const read=async()=>checkedFileReceipt(await tx.query(fileReadSQL,fileReadArgs(fixed)),fixed);
    const original=await read(),f=original.file;
    if(f.state!=='active'||f.writeState!=='settled'||f.removalPending||!digest(f.sha256)||f.sha256!==f.expectedSHA256)throw Error('Settled verified file required');
    // Dedicated provider must use fixed private Storage, bounded bytes and this
    // signal. Keep SQL review/home/file/write locks through the final read/COMMIT.
    const blob=await boundedFileRead(Promise.resolve().then(()=>readFileBytes(f,signal)),signal);
    if(!(blob instanceof Blob)||blob.size!==f.sizeBytes||blob.type!==f.mime)throw Error('Reviewed file content mismatch');
    const bytes=await boundedFileRead(blob.arrayBuffer(),signal);
    if(bytes.byteLength!==f.sizeBytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==f.sha256)throw Error('Reviewed file content mismatch');
    const final=await read();if(JSON.stringify(final)!==JSON.stringify(original))throw Error('Reviewed file changed');
    const recorded=await tx.query('select maintenance_private.record_closure_household_file_inspection($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::bigint) as inspection_id',[inspectionID,...fileReadArgs(fixed),f.sha256,f.sizeBytes]);
    if(recorded?.rows?.length!==1||recorded.rows[0].inspection_id!==inspectionID)throw Error('File inspection record unconfirmed');
    signal.throwIfAborted();
    return Object.freeze({inspectionID,fileID:f.attachmentID,metadataDigest:fixed.expectedMetadataDigest,sha256:f.sha256,sizeBytes:f.sizeBytes,mime:f.mime,
     // Return an immutable copy of the verified bytes, never a provider subclass.
     content:new Blob([bytes],{type:f.mime}),subjectConfirmed:false,householdRetentionApproved:false,accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async recordFileDecision(input,signal){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Explicit file decision required');
   const fixed=Object.freeze({...input}),confirmations={needs_review:'REQUIRE_ADDITIONAL_FILE_REVIEW',erase_personal_file:'ERASE_REVIEWED_PERSONAL_FILE',retain_household_file:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION'};
   if(Object.keys(fixed).sort().join(',')!=='action,confirmation,decisionID,epochID,evidenceDigest,fileID,inspectionID,reviewRequestID,userID'
    ||![fixed.decisionID,fixed.inspectionID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID].every(uuid)||!digest(fixed.evidenceDigest)
    ||!Object.hasOwn(confirmations,fixed.action)||fixed.confirmation!==confirmations[fixed.action])throw Error('Explicit file decision required');
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.record_closure_household_file_decision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::text) as decision_id',[fixed.decisionID,fixed.inspectionID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID,fixed.action,fixed.evidenceDigest]);
    if(result?.rows?.length!==1||result.rows[0].decision_id!==fixed.decisionID)throw Error('File decision unconfirmed');
    return Object.freeze({decisionID:fixed.decisionID,state:'file_decision_recorded',householdRetentionExecuted:false,accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async readFileDecision(input,signal){
   const fixed=checkedFileScope(input,true);
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.read_closure_household_file_decision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as receipt',fileReadArgs(fixed));
    const r=result?.rows?.length===1?result.rows[0].receipt:null;
    if(!r||Object.keys(r).sort().join(',')!=='accountErasureConfirmed,action,current,decisionID,fileID,householdRetentionExecuted,inspectionID,kind,metadataDigest'
     ||r.kind!=='closure-household-file-decision/v1'||r.fileID!==fixed.fileID||r.metadataDigest!==fixed.expectedMetadataDigest||typeof r.current!=='boolean'
     ||r.accountErasureConfirmed!==false||r.householdRetentionExecuted!==false
     ||!((r.decisionID===null&&r.inspectionID===null&&r.action===null&&!r.current)||(uuid(r.decisionID)&&uuid(r.inspectionID)&&['needs_review','erase_personal_file','retain_household_file'].includes(r.action))))throw Error('File decision read unconfirmed');
    return Object.freeze({...r});
   },{signal,readOnly:false});
  }
 });
}
