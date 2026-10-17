import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const key=v=>typeof v==='string'&&v.length<=240&&/^(scope:|scope_gap:|text:|personal_file:|household_file:)[A-Za-z0-9_:-]+$/.test(v);
function scope(input,extra=''){
 const required=['planID','reviewRequestID','userID','epochID',...extra.split(',').filter(Boolean)].sort().join(',');
 if(!exact(input,required)||![input.planID,input.reviewRequestID,input.userID,input.epochID].every(uuid))throw Error('Exact coverage scope required');return Object.freeze({...input});
}
const args=s=>[s.planID,s.reviewRequestID,s.userID,s.epochID];
function receipt(r,s){
 const v=r?.rows?.length===1?r.rows[0].receipt:null;
 if(!exact(v,'accountErasureConfirmed,current,epochID,itemCount,kind,mutationAuthorized,planID,reviewRequestID,sealEventID,state,unresolvedCount')||v.kind!=='closure-coverage/v1'||v.planID!==s.planID||v.reviewRequestID!==s.reviewRequestID||v.epochID!==s.epochID
  ||!['open','sealed','superseded'].includes(v.state)||typeof v.current!=='boolean'||(v.state==='superseded'&&v.current)||!Number.isInteger(v.itemCount)||v.itemCount<0||v.itemCount>10000||!Number.isInteger(v.unresolvedCount)||v.unresolvedCount<0||v.unresolvedCount>v.itemCount
  ||!(v.sealEventID===null||uuid(v.sealEventID))||(v.state==='sealed'&&!uuid(v.sealEventID))||(v.state==='open'&&v.sealEventID!==null)||v.mutationAuthorized!==false||v.accountErasureConfirmed!==false)throw Error('Coverage observation unconfirmed');return Object.freeze({...v});
}
const readSQL='select maintenance_private.read_closure_coverage($1::uuid,$2::uuid,$3::uuid,$4::uuid) receipt';
/** Private server operator evidence port. Sealed classifications are historical
 * evidence, not a future mutation permit. A dispatcher must independently lock
 * every writer, recheck the whole live set and bind physical cleanup receipts. */
export function createClosureReviewCoverage({connect}){
 const transaction=createReceiptTransactions({connect});
 const read=(tx,s)=>tx.query(readSQL,args(s)).then(r=>receipt(r,s));
 const checkID=(r,name,id)=>{if(r?.rows?.length!==1||r.rows[0][name]!==id)throw Error('Coverage event unconfirmed');};
 return Object.freeze({
  async capture(input,signal){
   const s=scope(input,'replacesPlanID,confirmation');if(!(s.replacesPlanID===null||uuid(s.replacesPlanID))||s.replacesPlanID===s.planID||s.confirmation!==(s.replacesPlanID===null?'CAPTURE_COMPLETE_SCOPED_REVIEW':'REPLACE_COMPLETE_SCOPED_REVIEW'))throw Error('Explicit coverage capture required');
   return transaction(async tx=>{checkID(await tx.query('select maintenance_private.capture_closure_coverage($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) plan_id',[...args(s),s.replacesPlanID]),'plan_id',s.planID);return read(tx,s);},{signal,readOnly:false});
  },
  async status(input,signal){const s=scope(input);return transaction(tx=>read(tx,s),{signal,readOnly:false});},
  async page(input,signal){
   const s=scope(input,'afterKey');if(!(s.afterKey===null||key(s.afterKey)))throw Error('Bounded coverage cursor required');
   return transaction(async tx=>{
    const r=await tx.query('select * from maintenance_private.page_closure_coverage($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text)',[...args(s),s.afterKey]);if(!Array.isArray(r?.rows)||r.rows.length>51)throw Error('Coverage page unconfirmed');
    let previous=s.afterKey;const rows=r.rows.map(v=>{
     if(!exact(v,'content_digest,field_name,home_id,home_instance_id,item_key,kind,record_id,relation_name')||!['scope','scope_gap','text','personal_file','household_file'].includes(v.kind)||!key(v.item_key)||!v.item_key.startsWith(v.kind+':')||!uuid(v.record_id)||!hash(v.content_digest)
      ||!((v.home_id===null&&v.home_instance_id===null)||(uuid(v.home_id)&&uuid(v.home_instance_id)))||(previous!==null&&v.item_key<=previous)
      ||(v.kind==='text'?(!['homes','products','maintenance_tasks','maintenance_history','home_members'].includes(v.relation_name)||!['name','maker','modelNumber','memo','sourceUrl','sourceNote','sourceFrequency','note','nickname','categoryId'].includes(v.field_name)):(v.relation_name!==null||v.field_name!==null)))throw Error('Coverage page unconfirmed');previous=v.item_key;return Object.freeze({...v});
    });
    const items=Object.freeze(rows.slice(0,50));return Object.freeze({items,hasMore:rows.length>50,nextCursor:rows.length>50?items.at(-1).item_key:null,immutableSnapshot:true,accountErasureConfirmed:false,mutationAuthorized:false});
   },{signal,readOnly:false});
  },
  async readText(input,signal){
   const s=scope(input,'itemKey');if(!key(s.itemKey)||!s.itemKey.startsWith('text:'))throw Error('Captured text key required');
   return transaction(async tx=>{const r=await tx.query('select maintenance_private.read_closure_coverage_text($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text) receipt',[...args(s),s.itemKey]),v=r?.rows?.length===1?r.rows[0].receipt:null;
    if(!exact(v,'digest,value')||!hash(v.digest)||typeof v.value!=='string'||new TextEncoder().encode(v.value).length>65536)throw Error('Coverage text unconfirmed');return Object.freeze({...v});},{signal,readOnly:false});
  },
  async recordTextDecision(input,signal){
   const s=scope(input,'itemKey,eventID,action,evidenceDigest,confirmation');const confirmations={retain_reviewed:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_PERSON_INFORMATION',needs_review:'REQUIRE_ADDITIONAL_TEXT_REVIEW'};
   if(!key(s.itemKey)||!s.itemKey.startsWith('text:')||!uuid(s.eventID)||!hash(s.evidenceDigest)||!Object.hasOwn(confirmations,s.action)||s.confirmation!==confirmations[s.action])throw Error('Explicit coverage text decision required');
   return transaction(async tx=>{checkID(await tx.query('select maintenance_private.record_closure_coverage_text_decision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text) event_id',[s.eventID,...args(s),s.itemKey,s.action,s.evidenceDigest]),'event_id',s.eventID);return Object.freeze({eventID:s.eventID,accountErasureConfirmed:false,mutationAuthorized:false});},{signal,readOnly:false});
  },
  async redactText(input,signal){
   const s=scope(input,'itemKey,eventID,expectedDigest,replacement,confirmation');
   if(!key(s.itemKey)||!s.itemKey.startsWith('text:')||!uuid(s.eventID)||!hash(s.expectedDigest)||!(s.replacement===null||typeof s.replacement==='string')||(typeof s.replacement==='string'&&new TextEncoder().encode(s.replacement).length>65536)||s.confirmation!=='REDACT_REVIEWED_COVERAGE_TEXT')throw Error('Explicit coverage text redaction required');
   return transaction(async tx=>{checkID(await tx.query('select maintenance_private.redact_closure_coverage_text($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text) event_id',[s.eventID,...args(s),s.itemKey,s.expectedDigest,s.replacement]),'event_id',s.eventID);return Object.freeze({eventID:s.eventID,state:'reviewed_text_redacted',accountErasureConfirmed:false,mutationAuthorized:false});},{signal,readOnly:false});
  },
  async seal(input,signal){
   const s=scope(input,'eventID,evidenceDigest,confirmation');if(!uuid(s.eventID)||!hash(s.evidenceDigest)||s.confirmation!=='CONFIRM_COMPLETE_APP_SCOPED_REVIEW')throw Error('Explicit coverage seal required');
   return transaction(async tx=>{checkID(await tx.query('select maintenance_private.seal_closure_coverage($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text) event_id',[s.eventID,...args(s),s.evidenceDigest]),'event_id',s.eventID);return read(tx,s);},{signal,readOnly:false});
  }
 });
}
