import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
function scoped(input){if(!exact(input,'epochID,leaseToken,requestID,userID')||!Object.values(input).every(uuid))throw Error('Exact reviewed worker scope required');return Object.freeze({...input});}
function checkedPage(result,s,afterKey){
 const p=result?.rows?.length===1?result.rows[0].page:null;
 if(!exact(p,'accountErasureConfirmed,epochID,hasMore,items,mode,nextKey,requestID,userID')||!['ordinary','reviewed'].includes(p.mode)||['requestID','userID','epochID'].some(k=>p[k]!==s[k])||p.accountErasureConfirmed!==false||typeof p.hasMore!=='boolean'||!Array.isArray(p.items)||p.items.length>50)throw Error('Scoped cleanup page unconfirmed');
 let previous=afterKey;
 const items=p.items.map(item=>{
  if(!exact(item,'fileID,kind,state')||!uuid(item.fileID)||!['personal_file','household_file'].includes(item.kind)||!['pending','absence_confirmed'].includes(item.state))throw Error('Typed cleanup item unconfirmed');
  const key=item.kind+':'+item.fileID;if(previous!==null&&key<=previous)throw Error('Cleanup cursor did not advance');previous=key;return Object.freeze({...item});
 });
 if(p.hasMore?(items.length!==50||p.nextKey!==previous):p.nextKey!==null)throw Error('Cleanup page remainder unconfirmed');
 if(p.mode==='ordinary'&&(items.length||p.hasMore||afterKey!==null))throw Error('Cleanup mode changed mid-page');return Object.freeze({...p,items:Object.freeze(items)});
}
function finalized(r,s,item){return r&&r.kind==='reviewed-file-finalization/v1'&&['requestID','userID','epochID'].every(k=>r[k]===s[k])&&r.fileID===item.fileID&&r.fileKind===item.kind&&r.sourceMetadataErased===true&&r.retiredIDProtected===true&&r.capacityBytesHeld===true&&r.capacityReleased===false&&r.accountErasureConfirmed===false;}
/** Private, dormant prelude. SQL chooses reviewed vs ordinary; callers cannot
 * supply that choice, paths, or a success flag. Every item rechecks its lease
 * independently. Missing providers fail before starting any irreversible work.
 */
export function createReviewedDeletionPrelude({connect,cleanup,finalization}){
 if(typeof cleanup?.cleanup!=='function'||typeof finalization?.status!=='function'||typeof finalization?.finalize!=='function')throw Error('Complete reviewed deletion ports required');
 const transaction=createReceiptTransactions({connect}),clean=cleanup.cleanup,status=finalization.status,finalize=finalization.finalize;
 return Object.freeze({prepare:async(input,callerSignal)=>{
  const s=scoped(input);if(!(callerSignal instanceof AbortSignal))throw Error('Bounded reviewed worker signal required');
  const signal=AbortSignal.any([callerSignal,AbortSignal.timeout(60000)]);let afterKey=null,processed=0;
  for(let pageNumber=0;pageNumber<=200;pageNumber++){
   signal.throwIfAborted();const page=await transaction(async tx=>checkedPage(await tx.query('select maintenance_private.page_reviewed_cleanup($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) page',[s.requestID,s.userID,s.epochID,s.leaseToken,afterKey]),s,afterKey),{signal,readOnly:false});
   if(page.mode==='ordinary')return true;
   for(const item of page.items){
    if(++processed>10000)throw Error('Reviewed cleanup scope exceeds captured bound');
    const operation=Object.freeze({...s,kind:item.kind,fileID:item.fileID});signal.throwIfAborted();
    const prior=await status(operation,signal);signal.throwIfAborted();
    if(prior!==null){if(!finalized(prior,s,item))throw Error('Finalization readback unconfirmed');continue;}
    const observed=await clean(operation,signal);signal.throwIfAborted();
    if(!observed||observed.kind!=='reviewed-file-absence/v1'||['requestID','userID','epochID'].some(k=>observed[k]!==s[k])||observed.fileID!==item.fileID||observed.fileKind!==item.kind||observed.sourceAbsenceObserved!==true||observed.capacityReleaseAuthorized!==false||observed.accountErasureConfirmed!==false)throw Error('Source cleanup unconfirmed');
    if(!finalized(await finalize(operation,signal),s,item))throw Error('Source finalization unconfirmed');signal.throwIfAborted();
   }
   if(!page.hasMore)return true;afterKey=page.nextKey;
  }
  throw Error('Reviewed cleanup page bound exceeded');
 }});
}
