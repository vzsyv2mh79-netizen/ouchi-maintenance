import {createHash,randomUUID} from 'node:crypto';
import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const extensions={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
function fixedInput(input,prepare=false){
 if(!exact(input,prepare?'decisionID,destinationID,epochID,fileID,intentID,reviewRequestID,userID':'epochID,intentID,reviewRequestID,userID')||!Object.values(input).every(uuid))throw Error('Exact household copy scope required');return Object.freeze({...input});
}
const scopeArgs=s=>[s.intentID,s.reviewRequestID,s.userID,s.epochID];
function checkedManifest(result,scope){
 const m=result?.rows?.length===1?result.rows[0].manifest:null;
 if(!exact(m,'capacityClaimID,decisionID,destination,epochID,inspectionID,intentID,kind,metadataDigest,reviewRequestID,source,state,userID,writeAttemptID,writerState')||m.kind!=='household-copy/v1'
  ||['intentID','reviewRequestID','userID','epochID'].some(k=>m[k]!==scope[k])||!['reserved','copy_verified'].includes(m.state)||![m.decisionID,m.inspectionID,m.capacityClaimID].every(uuid)||m.capacityClaimID!==scope.intentID||!hash(m.metadataDigest)||!['unissued','issued','acknowledged','legacy_unknown'].includes(m.writerState)||(m.writerState==='unissued'?m.writeAttemptID!==null:!uuid(m.writeAttemptID)))throw Error('Household copy manifest unconfirmed');
 const f=m.source,d=m.destination;
 if(!exact(f,'attachmentID,bucket,expectedSHA256,homeID,homeInstanceID,mime,objectPath,productID,removalPending,sha256,sizeBytes,state,subjectConfirmed,uploaderEpoch,uploaderID,writeState')
  ||![f.attachmentID,f.uploaderID,f.uploaderEpoch,f.homeID,f.homeInstanceID,f.productID].every(uuid)||f.bucket!=='ouchi-product-attachments'||!Object.hasOwn(extensions,f.mime)
  ||!Number.isSafeInteger(f.sizeBytes)||f.sizeBytes<1||f.sizeBytes>5242880||!hash(f.sha256)||f.expectedSHA256!==f.sha256||f.state!=='stored'||f.writeState!=='settled'||f.removalPending!==false||f.subjectConfirmed!==false
  ||f.objectPath!==`${f.uploaderID}/${f.uploaderEpoch}/${f.attachmentID}.${extensions[f.mime]}`
  ||!exact(d,'homeID,homeInstanceID,id,mime,objectPath,productID,sha256,size')||!uuid(d.id)||d.homeID!==f.homeID||d.homeInstanceID!==f.homeInstanceID||d.productID!==f.productID||d.mime!==f.mime||d.size!==f.sizeBytes||d.sha256!==f.sha256
  ||d.objectPath!==`households/${f.homeInstanceID}/${d.id}.${extensions[f.mime]}`)throw Error('Household copy paths unconfirmed');
 if(scope.decisionID&&(scope.decisionID!==m.decisionID||scope.destinationID!==d.id||scope.fileID!==f.attachmentID))throw Error('Household copy scope changed');
 return Object.freeze({...m,source:Object.freeze({...f}),destination:Object.freeze({...d})});
}
async function bounded(promise,signal){signal.throwIfAborted();let stop;const abort=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});try{return await Promise.race([promise,abort]);}finally{signal.removeEventListener('abort',stop);}}
async function verified(blob,m,signal){
 if(!(blob instanceof Blob)||blob.size!==m.destination.size||blob.type!==m.destination.mime)throw Error('Household copy bytes mismatch');
 const bytes=await bounded(blob.arrayBuffer(),signal);if(bytes.byteLength!==m.destination.size||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==m.destination.sha256)throw Error('Household copy bytes mismatch');return new Blob([bytes],{type:m.destination.mime});
}
/** Copy-only backend coordinator. prepare commits the immutable destination and
 * capacity BEFORE I/O. A dedicated bounded/authenticated Storage provider must
 * enforce these exact paths and signals; absence must mean genuine NoSuchKey.
 * copy rechecks private SQL authority while holding its source/review/actor locks
 * through measured destination verification/COMMIT. No activation or removal
 * port exists. Pending/unknown outcomes keep intent, staged file and capacity.
 */
export function createHouseholdCopy({connect,storage}){
 const transaction=createReceiptTransactions({connect});
 const providers=storage&&Object.freeze({inspectDestination:storage.inspectDestination,readSource:storage.readSource,writeDestination:storage.writeDestination});
 return Object.freeze({
  async prepare(input,signal){const s=fixedInput(input,true);return transaction(async tx=>checkedManifest(await tx.query('select maintenance_private.prepare_household_copy($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid) manifest',[s.intentID,s.decisionID,s.reviewRequestID,s.userID,s.epochID,s.fileID,s.destinationID]),s),{signal,readOnly:false});},
  async status(input,signal){const s=fixedInput(input);return transaction(async tx=>{
   const r=await tx.query('select maintenance_private.read_household_copy_status($1::uuid,$2::uuid,$3::uuid,$4::uuid) receipt',scopeArgs(s)),v=r?.rows?.length===1?r.rows[0].receipt:null;
   if(!exact(v,'accountErasureConfirmed,activationConfirmed,capacityClaimID,destinationID,epochID,intentID,kind,reviewRequestID,sourceEraseConfirmed,state,userID,writeAttemptID,writerState')||v.kind!=='household-copy-status/v1'||['intentID','reviewRequestID','userID','epochID'].some(k=>v[k]!==s[k])||!uuid(v.destinationID)||v.capacityClaimID!==s.intentID||!['reserved','copy_verified'].includes(v.state)||v.activationConfirmed!==false||v.sourceEraseConfirmed!==false||v.accountErasureConfirmed!==false||!['unissued','issued','acknowledged','legacy_unknown'].includes(v.writerState)||(v.writerState==='unissued'?v.writeAttemptID!==null:!uuid(v.writeAttemptID)))throw Error('Household copy status unconfirmed');return Object.freeze({...v});
  },{signal,readOnly:false});},
  async copy(input,callerSignal){const s=fixedInput(input);if(!providers||Object.values(providers).some(fn=>typeof fn!=='function')||!(callerSignal instanceof AbortSignal))throw Error('Bounded household copy Storage required');
   const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(15000)]),load=async tx=>checkedManifest(await tx.query('select maintenance_private.lock_household_copy_intent($1::uuid,$2::uuid,$3::uuid,$4::uuid) manifest',scopeArgs(s)),s);
   const outcome=(m,state)=>Object.freeze({intentID:s.intentID,destinationID:m.destination.id,state,writerState:m.writerState,activationConfirmed:false,sourceEraseConfirmed:false,accountErasureConfirmed:false});
   const confirm=async(tx,m)=>{
    const destination=await bounded(Promise.resolve().then(()=>providers.inspectDestination(m,signal)),signal);await verified(destination,m,signal);
    const measured=checkedManifest(await tx.query('select maintenance_private.confirm_household_copy_bytes($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint) manifest',[...scopeArgs(s),m.destination.sha256,m.destination.size]),s);
    if(measured.state!=='copy_verified'||measured.writerState!=='acknowledged'||['decisionID','inspectionID','metadataDigest','writeAttemptID'].some(k=>measured[k]!==m[k])||['source','destination'].some(field=>Object.keys(m[field]).some(k=>m[field][k]!==measured[field][k])))throw Error('Measured household copy unconfirmed');return outcome(measured,'copy_verified');
   };
   const preflight=await transaction(async tx=>{
    const m=await load(tx);
    if(m.writerState==='issued'||m.writerState==='legacy_unknown')return {result:outcome(m,'pending')};
    if(m.writerState==='acknowledged')return {result:await confirm(tx,m)};
    const destination=await bounded(Promise.resolve().then(()=>providers.inspectDestination(m,signal)),signal);
    if(destination!==null)throw Error('Unowned copy destination must be reconciled');return {destinationID:m.destination.id};
   },{signal,readOnly:false});
   if(preflight.result)return preflight.result;
   // Nonces are generated here, never accepted from JSON or returned by status.
   // Successful issuance COMMIT must precede the only permitted POST. No ticket
   // exists when issuance acknowledgement fails; closing that specific attempt
   // as not-dispatched is then a factual callback, not a timeout assumption.
   const attemptID=randomUUID(),nonce=randomUUID();
   const recordFact=async(tx,fact)=>{
    const r=await tx.query('select maintenance_private.record_household_copy_write_fact($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::text) recorded',[...scopeArgs(s),attemptID,nonce,fact]);
    return r?.rows?.length===1&&r.rows[0].recorded===true;
   };
   const settle=async fact=>{try{return await transaction(tx=>recordFact(tx,fact),{signal:AbortSignal.timeout(5000),readOnly:false});}catch{return false;}};
   let issued;
   try{
    issued=await transaction(async tx=>{
     const r=await tx.query('select maintenance_private.issue_household_copy_write($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) receipt',[...scopeArgs(s),attemptID,nonce]),v=r?.rows?.length===1?r.rows[0].receipt:null;
     if(!exact(v,'attemptID,intentID,issued,kind,writerState')||v.kind!=='household-copy-writer/v1'||v.intentID!==s.intentID||!uuid(v.attemptID)||typeof v.issued!=='boolean'||!['issued','acknowledged','legacy_unknown'].includes(v.writerState)||(v.issued&&(v.attemptID!==attemptID||v.writerState!=='issued')))throw Error('Copy writer issue unconfirmed');return v;
    },{signal,readOnly:false});
   }catch(error){await settle('not_dispatched');throw error;}
   if(!issued.issued)return Object.freeze({intentID:s.intentID,destinationID:preflight.destinationID,state:'pending',writerState:issued.writerState,activationConfirmed:false,sourceEraseConfirmed:false,accountErasureConfirmed:false});
   let postStarted=false,ackObserved=false;
   try{
    await transaction(async tx=>{
     const m=checkedManifest(await tx.query('select maintenance_private.lock_household_copy_write($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) manifest',[...scopeArgs(s),attemptID,nonce]),s);
     if(m.writerState!=='issued'||m.writeAttemptID!==attemptID)throw Error('Own unused writer required');
     const source=await verified(await bounded(Promise.resolve().then(()=>providers.readSource(m,signal)),signal),m,signal);
     signal.throwIfAborted();postStarted=true;
     await bounded(Promise.resolve().then(()=>providers.writeDestination(m,source,signal)),signal);ackObserved=true;
     if(!await recordFact(tx,'acknowledged'))throw Error('Copy writer acknowledgement unconfirmed');
    },{signal,readOnly:false});
   }catch(error){
    // A response actually observed by this process can be recorded even after
    // caller cancellation/transaction rollback. An interrupted POST without
    // that response stays issued and can NEVER cause another POST on retry.
    if(ackObserved)await settle('acknowledged');else if(!postStarted)await settle('not_dispatched');throw error;
   }
   return transaction(async tx=>confirm(tx,await load(tx)),{signal,readOnly:false});
  }
 });
}
