import {isDeepStrictEqual} from 'node:util';
import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const extensions={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'};
function scope(input){
 if(!exact(input,'epochID,fileID,kind,leaseToken,requestID,userID')||![input.requestID,input.userID,input.epochID,input.leaseToken,input.fileID].every(uuid)||!['personal_file','household_file'].includes(input.kind))throw Error('Exact leased typed cleanup required');return Object.freeze({...input});
}
const args=s=>[s.requestID,s.userID,s.epochID,s.leaseToken,s.kind,s.fileID];
function pinned(result,s){
 const r=result?.rows?.length===1?result.rows[0].pinned:null,m=r?.manifest,f=m?.source,d=m?.retained;
 const object=o=>o&&uuid(o.attachmentID)&&Object.hasOwn(extensions,o.mime)&&Number.isSafeInteger(o.sizeBytes)&&o.sizeBytes>0&&o.sizeBytes<=5242880&&hash(o.sha256);
 if(!exact(r,'fingerprint,manifest')||!hash(r.fingerprint)||!exact(m,d?'homeInstanceID,kind,requestID,retained,source':'homeInstanceID,kind,requestID,source')||m.requestID!==s.requestID||m.kind!==s.kind||!(m.homeInstanceID===null||uuid(m.homeInstanceID))||!object(f)||f.attachmentID!==s.fileID)throw Error('Pinned cleanup manifest unconfirmed');
 const personal=m.kind==='personal_file';
 if(!exact(f,personal?'attachmentID,mime,objectPath,sha256,sizeBytes,uploaderEpoch,uploaderID':'attachmentID,mime,objectPath,sha256,sizeBytes')
  ||(personal?(!uuid(f.uploaderID)||!uuid(f.uploaderEpoch)||f.objectPath!==`${f.uploaderID}/${f.uploaderEpoch}/${f.attachmentID}.${extensions[f.mime]}`):(!uuid(m.homeInstanceID)||f.objectPath!==`households/${m.homeInstanceID}/${f.attachmentID}.${extensions[f.mime]}`))
  ||(d&&(!personal||!uuid(m.homeInstanceID)||!exact(d,'attachmentID,mime,objectPath,sha256,sizeBytes')||!object(d)||d.attachmentID===f.attachmentID||d.objectPath!==`households/${m.homeInstanceID}/${d.attachmentID}.${extensions[f.mime]}`||d.sizeBytes!==f.sizeBytes||d.mime!==f.mime||d.sha256!==f.sha256)))throw Error('Pinned cleanup paths unconfirmed');
 return Object.freeze({fingerprint:r.fingerprint,manifest:Object.freeze({...m,source:Object.freeze({...f}),...(d?{retained:Object.freeze({...d})}:{})})});
}
function receipt(result,s){
 const r=result?.rows?.length===1?result.rows[0].receipt:undefined;if(r===null)return null;
 if(!exact(r,'accountErasureConfirmed,capacityReleaseAuthorized,deleteAcknowledged,epochID,fileID,fileKind,kind,requestID,sourceAbsenceObserved,userID')||r.kind!=='reviewed-file-absence/v1'||r.requestID!==s.requestID||r.userID!==s.userID||r.epochID!==s.epochID||r.fileID!==s.fileID||r.fileKind!==s.kind||r.sourceAbsenceObserved!==true||typeof r.deleteAcknowledged!=='boolean'||r.capacityReleaseAuthorized!==false||r.accountErasureConfirmed!==false)throw Error('Cleanup observation receipt unconfirmed');return Object.freeze({...r});
}
async function bounded(promise,signal){signal.throwIfAborted();let stop;const cancelled=new Promise((_,reject)=>{stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});});try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener('abort',stop);}}
/** Private, dormant leased source-cleanup stage. Dedicated SQL locks pin the
 * exact queue/source/writers/retained origin through bounded Storage I/O and
 * receipt COMMIT. This records API absence only; pending queue, source metadata,
 * capacity and copy journal stay held until the separate checked finalizer.
 * Lost COMMIT uses the SAME request/file scope; no HTTP endpoint is installed.
 */
export function createReviewedFileCleanup({connect,storage}){
 const transaction=createReceiptTransactions({connect}),cleanup=storage?.cleanup;
 return Object.freeze({
  async status(input,signal){const s=scope(input);return transaction(async tx=>receipt(await tx.query('select maintenance_private.read_reviewed_file_absence($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid) receipt',args(s)),s),{signal,readOnly:false});},
  async cleanup(input,callerSignal){
   const s=scope(input);if(typeof cleanup!=='function'||!(callerSignal instanceof AbortSignal))throw Error('Bounded private cleanup provider required');
   const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(15000)]);
   return transaction(async tx=>{
    const prior=receipt(await tx.query('select maintenance_private.read_reviewed_file_absence($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid) receipt',args(s)),s);if(prior)return prior;
    const load=async()=>pinned(await tx.query('select maintenance_private.lock_reviewed_file_cleanup($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid) pinned',args(s)),s),m=await load();
    const fact=await bounded(Promise.resolve().then(()=>cleanup(m.manifest,signal)),signal);
    if(!exact(fact,'capacityReleaseAuthorized,deleteAcknowledged,sourceAbsenceObserved')||fact.sourceAbsenceObserved!==true||typeof fact.deleteAcknowledged!=='boolean'||fact.capacityReleaseAuthorized!==false)throw Error('Bounded source absence observation required');
    if(!isDeepStrictEqual(await load(),m))throw Error('Pinned cleanup manifest changed');
    const result=receipt(await tx.query('select maintenance_private.record_reviewed_file_absence($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::boolean) receipt',[...args(s),m.fingerprint,fact.deleteAcknowledged]),s);
    if(!result)throw Error('Cleanup observation missing');return result;
   },{signal,readOnly:false});
  }
 });
}

function finalizedReceipt(result,s){
 const r=result?.rows?.length===1?result.rows[0].receipt:undefined;if(r===null)return null;
 if(!exact(r,'accountErasureConfirmed,capacityBytesHeld,capacityReleased,epochID,fileID,fileKind,kind,requestID,retiredIDProtected,sourceMetadataErased,userID')||r.kind!=='reviewed-file-finalization/v1'||r.requestID!==s.requestID||r.userID!==s.userID||r.epochID!==s.epochID||r.fileID!==s.fileID||r.fileKind!==s.kind||r.sourceMetadataErased!==true||r.retiredIDProtected!==true||r.capacityBytesHeld!==true||r.capacityReleased!==false||r.accountErasureConfirmed!==false)throw Error('Reviewed file finalization unconfirmed');return Object.freeze({...r});
}
/** Separate SQL-only stage, after a durable bounded source-absence observation.
 * Source IDs are permanently retired BEFORE metadata erase. Physical capacity
 * is moved to an opaque hold, not released. Same-scope status recovers lost
 * COMMIT without another metadata mutation or any Storage operation.
 */
export function createReviewedFileFinalization({connect}){
 const transaction=createReceiptTransactions({connect});
 return Object.freeze({
  async status(input,signal){const s=scope(input);return transaction(async tx=>finalizedReceipt(await tx.query('select maintenance_private.read_reviewed_file_finalization($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid) receipt',args(s)),s),{signal,readOnly:false});},
  async finalize(input,signal){const s=scope(input);return transaction(async tx=>{
   const r=finalizedReceipt(await tx.query('select maintenance_private.finalize_reviewed_file($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid) receipt',args(s)),s);if(!r)throw Error('Reviewed file finalization missing');return r;
  },{signal,readOnly:false});}
 });
}
