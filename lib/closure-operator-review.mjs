import {createHash} from 'node:crypto';
import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const fields=Object.freeze({homes:['name'],products:['name','maker','modelNumber','memo'],maintenance_tasks:['name','sourceUrl','sourceNote','sourceFrequency'],maintenance_history:['note']});
function checkedField(input,redaction=false){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped reviewed field required');
 const fixed=Object.freeze({...input});
 const keys=redaction?'confirmation,epochID,eventID,expectedDigest,field,recordID,relation,replacement,reviewRequestID,userID':'epochID,field,recordID,relation,reviewRequestID,userID';
 if(Object.keys(fixed).sort().join(',')!==keys||![fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.recordID].every(uuid)
  ||!Object.hasOwn(fields,fixed.relation)||!fields[fixed.relation].includes(fixed.field))throw Error('Scoped reviewed field required');
 if(redaction&&(!uuid(fixed.eventID)||fixed.confirmation!=='REDACT_REVIEWED_PERSONAL_INFORMATION'
  ||typeof fixed.expectedDigest!=='string'||!/^[0-9a-f]{64}$/.test(fixed.expectedDigest)
  ||!(fixed.replacement===null||typeof fixed.replacement==='string')
  ||(typeof fixed.replacement==='string'&&new TextEncoder().encode(fixed.replacement).byteLength>8192)))throw Error('Explicit reviewed replacement required');
 return fixed;
}
const fieldArgs=fixed=>[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.relation,fixed.recordID,fixed.field];
const validFieldCursor=value=>typeof value==='string'&&value.length<=160&&/^(homes|products|maintenance_tasks|maintenance_history):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(name|maker|modelNumber|memo|sourceUrl|sourceNote|sourceFrequency|note)$/.test(value);
function snapshotInput(input,capture){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped text snapshot required');
 const fixed=Object.freeze({...input});
 if(Object.keys(fixed).sort().join(',')!==(capture?'confirmation,epochID,planID,replacesPlanID,reviewRequestID,userID':'epochID,planID,reviewRequestID,userID')
  ||![fixed.planID,fixed.reviewRequestID,fixed.userID,fixed.epochID].every(uuid))throw Error('Scoped text snapshot required');
 if(capture&&(!(fixed.replacesPlanID===null||uuid(fixed.replacesPlanID))||fixed.planID===fixed.replacesPlanID
  ||fixed.confirmation!==(fixed.replacesPlanID===null?'CAPTURE_REVIEW_TEXT_SNAPSHOT':'REPLACE_REVIEW_TEXT_SNAPSHOT')))throw Error('Explicit text snapshot capture required');
 return fixed;
}
function snapshotReceipt(value,fixed,read){
 if(!value||Object.keys(value).sort().join(',')!==(read?'accountErasureConfirmed,epochID,itemCount,kind,needsNewSnapshot,planID,reviewRequestID,state':'accountErasureConfirmed,epochID,itemCount,kind,planID,reviewRequestID,state')
  ||value.kind!=='closure-text-snapshot/v1'||value.planID!==fixed.planID||value.reviewRequestID!==fixed.reviewRequestID||value.epochID!==fixed.epochID
  ||!['open','superseded'].includes(value.state)||!Number.isSafeInteger(value.itemCount)||value.itemCount<0||value.accountErasureConfirmed!==false
  ||(read&&(typeof value.needsNewSnapshot!=='boolean'||(value.state==='superseded'&&!value.needsNewSnapshot))))throw Error('Text snapshot unconfirmed');
 return Object.freeze({...value});
}
const fileMimes=Object.freeze({'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'});
const fileStates=['reserved','stored','removed'],writeStates=['untracked','missing','started','settled'];
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
     ||!f||Object.keys(f).sort().join(',')!=='attachmentID,bucket,expectedSHA256,homeID,homeInstanceID,mime,objectPath,productID,removalPending,sha256,sizeBytes,state,subjectConfirmed,uploaderEpoch,uploaderID,writeState'
     ||f.attachmentID!==fixed.fileID||![f.uploaderID,f.uploaderEpoch,f.productID].every(uuid)
     ||!((f.homeID===null&&f.homeInstanceID===null)||(uuid(f.homeID)&&uuid(f.homeInstanceID)))
     ||f.bucket!=='ouchi-product-attachments'||!Object.hasOwn(fileMimes,f.mime)||!fileStates.includes(f.state)||!writeStates.includes(f.writeState)
     ||typeof f.removalPending!=='boolean'||f.subjectConfirmed!==false||!Number.isSafeInteger(f.sizeBytes)||f.sizeBytes<1||f.sizeBytes>5242880
     ||!(f.sha256===null||digest(f.sha256))||!(f.expectedSHA256===null||digest(f.expectedSHA256))
     ||f.objectPath!==`${f.uploaderID}/${f.uploaderEpoch}/${f.attachmentID}.${fileMimes[f.mime]}`)throw Error('Reviewed file unconfirmed');
    return Object.freeze({...value,file:Object.freeze({...f})});
}
async function boundedFileRead(promise,signal){
 signal.throwIfAborted();let stop;const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener('abort',stop);}
}
const fileReadSQL='select maintenance_private.read_closure_review_file($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as receipt';
const fileReadArgs=fixed=>[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID,fixed.expectedMetadataDigest];
/** Private operator port. Its dedicated database login must be independently
 * provisioned and explicitly enabled; client bearer/JWT flags cannot enable it.
 * A recorded assessment is NOT erasure clearance, a job or completed deletion.
 * Retry a lost acknowledgement with the SAME event ID and immutable payload.
 */
export function createClosureOperatorReview({connect,readFileBytes}){
 const transaction=createReceiptTransactions({connect});
 return Object.freeze({
  async fileInventory(input,signal){
   const fixed=checkedFileScope(input,false);
   return transaction(async tx=>{
    const result=await tx.query('select * from maintenance_private.closure_review_file_inventory($1::uuid,$2::uuid,$3::uuid,$4::uuid)',[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.afterFile]);
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
    const result=await tx.query('select maintenance_private.read_closure_review_file($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as receipt',[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID,fixed.expectedMetadataDigest]);
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
    if(f.state!=='stored'||f.writeState!=='settled'||f.removalPending||!digest(f.sha256)||f.sha256!==f.expectedSHA256)throw Error('Settled verified file required');
    // Dedicated provider must use fixed private Storage, bounded bytes and this
    // signal. Keep SQL review/home/file/write locks through the final read/COMMIT.
    const blob=await boundedFileRead(Promise.resolve().then(()=>readFileBytes(f,signal)),signal);
    if(!(blob instanceof Blob)||blob.size!==f.sizeBytes||blob.type!==f.mime)throw Error('Reviewed file content mismatch');
    const bytes=await boundedFileRead(blob.arrayBuffer(),signal);
    if(bytes.byteLength!==f.sizeBytes||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==f.sha256)throw Error('Reviewed file content mismatch');
    const final=await read();if(JSON.stringify(final)!==JSON.stringify(original))throw Error('Reviewed file changed');
    const recorded=await tx.query('select maintenance_private.record_closure_file_inspection($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::bigint) as inspection_id',[inspectionID,...fileReadArgs(fixed),f.sha256,f.sizeBytes]);
    if(recorded?.rows?.length!==1||recorded.rows[0].inspection_id!==inspectionID)throw Error('File inspection record unconfirmed');
    signal.throwIfAborted();
    return Object.freeze({inspectionID,fileID:f.attachmentID,metadataDigest:fixed.expectedMetadataDigest,sha256:f.sha256,sizeBytes:f.sizeBytes,mime:f.mime,
     // Return an immutable copy of the verified bytes, never a provider subclass.
     content:new Blob([bytes],{type:f.mime}),subjectConfirmed:false,familyRetentionApproved:false,accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async recordFileDecision(input,signal){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Explicit file decision required');
   const fixed=Object.freeze({...input}),confirmations={needs_review:'REQUIRE_ADDITIONAL_FILE_REVIEW',erase_personal_file:'ERASE_REVIEWED_PERSONAL_FILE',retain_family_copy:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_PERSON_INFORMATION'};
   if(Object.keys(fixed).sort().join(',')!=='action,confirmation,decisionID,epochID,evidenceDigest,fileID,inspectionID,reviewRequestID,userID'
    ||![fixed.decisionID,fixed.inspectionID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID].every(uuid)||!digest(fixed.evidenceDigest)
    ||!Object.hasOwn(confirmations,fixed.action)||fixed.confirmation!==confirmations[fixed.action])throw Error('Explicit file decision required');
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.record_closure_file_decision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text,$8::text) as decision_id',[fixed.decisionID,fixed.inspectionID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.fileID,fixed.action,fixed.evidenceDigest]);
    if(result?.rows?.length!==1||result.rows[0].decision_id!==fixed.decisionID)throw Error('File decision unconfirmed');
    return Object.freeze({decisionID:fixed.decisionID,state:'file_decision_recorded',familyRetentionExecuted:false,accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async readFileDecision(input,signal){
   const fixed=checkedFileScope(input,true);
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.read_closure_file_decision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) as receipt',fileReadArgs(fixed));
    const r=result?.rows?.length===1?result.rows[0].receipt:null;
    if(!r||Object.keys(r).sort().join(',')!=='accountErasureConfirmed,action,current,decisionID,familyRetentionExecuted,fileID,inspectionID,kind,metadataDigest'
     ||r.kind!=='closure-file-decision/v1'||r.fileID!==fixed.fileID||r.metadataDigest!==fixed.expectedMetadataDigest||typeof r.current!=='boolean'
     ||r.accountErasureConfirmed!==false||r.familyRetentionExecuted!==false
     ||!((r.decisionID===null&&r.inspectionID===null&&r.action===null&&!r.current)||(uuid(r.decisionID)&&uuid(r.inspectionID)&&['needs_review','erase_personal_file','retain_family_copy'].includes(r.action))))throw Error('File decision read unconfirmed');
    return Object.freeze({...r});
   },{signal,readOnly:false});
  },
  async captureTextSnapshot(input,signal){
   const fixed=snapshotInput(input,true);
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.capture_closure_text_snapshot($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as receipt',[fixed.planID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.replacesPlanID]);
    if(result?.rows?.length!==1)throw Error('Text snapshot unconfirmed');
    return snapshotReceipt(result.rows[0].receipt,fixed,false);
   },{signal,readOnly:false});
  },
  async readTextSnapshot(input,signal){
   const fixed=snapshotInput(input,false);
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.read_closure_text_snapshot($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt',[fixed.planID,fixed.reviewRequestID,fixed.userID,fixed.epochID]);
    if(result?.rows?.length!==1)throw Error('Text snapshot unconfirmed');
    return snapshotReceipt(result.rows[0].receipt,fixed,true);
   },{signal,readOnly:false});
  },
  async inventory(input,signal){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped inventory required');
   const fixed=Object.freeze({...input});
   if(Object.keys(fixed).sort().join(',')!=='afterKey,epochID,reviewRequestID,userID'
    ||![fixed.reviewRequestID,fixed.userID,fixed.epochID].every(uuid)
    ||!(fixed.afterKey===null||validFieldCursor(fixed.afterKey)))throw Error('Scoped inventory cursor required');
   return transaction(async tx=>{
    const result=await tx.query('select * from maintenance_private.closure_review_field_inventory($1::uuid,$2::uuid,$3::uuid,$4::text)',[fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.afterKey]);
    if(!Array.isArray(result?.rows)||result.rows.length>51)throw Error('Field inventory unconfirmed');
    let previous=fixed.afterKey;
    const rows=result.rows.map(row=>{
     if(!row||Object.keys(row).sort().join(',')!=='content_digest,field_key,field_name,home_id,preview,record_id,relation_name,truncated'
      ||![row.home_id,row.record_id].every(uuid)||!Object.hasOwn(fields,row.relation_name)||!fields[row.relation_name].includes(row.field_name)
      ||row.field_key!==`${row.relation_name}:${row.record_id}:${row.field_name}`||!validFieldCursor(row.field_key)
      ||(previous!==null&&row.field_key<=previous)||typeof row.preview!=='string'||Array.from(row.preview).length>512
      ||typeof row.content_digest!=='string'||!/^[0-9a-f]{64}$/.test(row.content_digest)||typeof row.truncated!=='boolean')throw Error('Field inventory unconfirmed');
     previous=row.field_key;return Object.freeze({...row});
    });
    const items=Object.freeze(rows.slice(0,50)),hasMore=rows.length>50;
    return Object.freeze({items,hasMore,nextCursor:hasMore?items.at(-1).field_key:null,consistentSnapshot:false,accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async recordLegacyContext(input,signal){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped legacy context required');
   const fixed=Object.freeze({...input});
   if(Object.keys(fixed).sort().join(',')!=='action,confirmation,epochID,eventID,evidenceDigest,homeID,reviewRequestID,userID'
    ||![fixed.eventID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.homeID].every(uuid)
    ||!['confirmed','revoked'].includes(fixed.action)
    ||fixed.confirmation!==(fixed.action==='confirmed'?'CONFIRM_REVIEWED_LEGACY_CONTEXT':'REVOKE_LEGACY_CONTEXT')
    ||typeof fixed.evidenceDigest!=='string'||!/^[0-9a-f]{64}$/.test(fixed.evidenceDigest))throw Error('Explicit reviewed legacy context required');
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.record_closure_legacy_home_context($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text) as event_id',
     [fixed.eventID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.homeID,fixed.action,fixed.evidenceDigest]);
    if(result?.rows?.length!==1||Object.keys(result.rows[0]).join(',')!=='event_id'||result.rows[0].event_id!==fixed.eventID)throw Error('Legacy context unconfirmed');
    return Object.freeze({eventID:fixed.eventID,state:'legacy_context_recorded',accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async queue(afterReview,signal){
   if(afterReview!==null&&!uuid(afterReview))throw Error('Valid queue cursor required');
   return transaction(async tx=>{
    const result=await tx.query('select * from maintenance_private.closure_operator_queue($1::uuid)',[afterReview]);
    if(!Array.isArray(result?.rows)||result.rows.length>50)throw Error('Operator queue unconfirmed');
    const rows=result.rows.map(row=>{
     if(!row||Object.keys(row).sort().join(',')!=='app_epoch_id,latest_event_id,latest_outcome,latest_recorded_at,requested_at,review_request_id,user_id'
      ||![row.review_request_id,row.user_id,row.app_epoch_id].every(uuid)
      ||!(typeof row.requested_at==='string'||row.requested_at instanceof Date)||!Number.isFinite(new Date(row.requested_at).getTime())
      ||!((row.latest_event_id===null&&row.latest_outcome===null&&row.latest_recorded_at===null)
       ||(uuid(row.latest_event_id)&&['needs_review','assessment_recorded','revoked'].includes(row.latest_outcome)
        &&(typeof row.latest_recorded_at==='string'||row.latest_recorded_at instanceof Date)&&Number.isFinite(new Date(row.latest_recorded_at).getTime()))))throw Error('Operator queue unconfirmed');
     return Object.freeze({...row,requested_at:new Date(row.requested_at).toISOString(),latest_recorded_at:row.latest_recorded_at===null?null:new Date(row.latest_recorded_at).toISOString()});
    });
    return Object.freeze(rows);
   },{signal,readOnly:true});
  },
  async readField(input,signal){
   const fixed=checkedField(input);
   // The SQL reader locks the exact hierarchy for scope consistency.
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.read_closure_redaction_field($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::text) as snapshot',fieldArgs(fixed));
    const value=result?.rows?.[0]?.snapshot;
    if(result?.rows?.length!==1||!value||Object.keys(value).sort().join(',')!=='digest,value'
     ||typeof value.digest!=='string'||!/^[0-9a-f]{64}$/.test(value.digest)||!(value.value===null||typeof value.value==='string'))throw Error('Reviewed field unconfirmed');
    return Object.freeze({...value});
   },{signal,readOnly:false});
  },
  async redactField(input,signal){
   const fixed=checkedField(input,true);
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.redact_closure_reviewed_field($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text) as event_id',
     [fixed.eventID,...fieldArgs(fixed),fixed.expectedDigest,fixed.replacement]);
    if(result?.rows?.length!==1||Object.keys(result.rows[0]).join(',')!=='event_id'||result.rows[0].event_id!==fixed.eventID)throw Error('Reviewed redaction unconfirmed');
    return Object.freeze({eventID:fixed.eventID,state:'field_redacted',accountErasureConfirmed:false});
   },{signal,readOnly:false});
  },
  async record(input,signal){
   if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped operator assessment required');
   const fixed=Object.freeze({...input});
   if(Object.keys(fixed).sort().join(',')!=='epochID,eventID,evidenceDigest,outcome,reviewRequestID,userID'
    ||![fixed.eventID,fixed.reviewRequestID,fixed.userID,fixed.epochID].every(uuid)
    ||!['needs_review','assessment_recorded','revoked'].includes(fixed.outcome)
    ||typeof fixed.evidenceDigest!=='string'||!/^[0-9a-f]{64}$/.test(fixed.evidenceDigest))throw Error('Scoped operator assessment required');
   return transaction(async tx=>{
    const result=await tx.query('select maintenance_private.record_closure_operator_assessment($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text) as event_id',
     [fixed.eventID,fixed.reviewRequestID,fixed.userID,fixed.epochID,fixed.outcome,fixed.evidenceDigest]);
    if(result?.rows?.length!==1||Object.keys(result.rows[0]).join(',')!=='event_id'||result.rows[0].event_id!==fixed.eventID)throw Error('Operator assessment unconfirmed');
    return Object.freeze({eventID:fixed.eventID,state:'assessment_recorded',erasureConfirmed:false});
   },{signal,readOnly:false});
  }
 });
}
