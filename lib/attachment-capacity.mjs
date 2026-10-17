import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const pattern='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const path=new RegExp(`^(${pattern}/${pattern}|households/${pattern})/${pattern}\\.(jpg|png|pdf)$`);
/** Backend accounting only. No upload rights, file consent, writer freeze,
 * Storage permission, allocation approval or release is inferred from a claim.
 * Reservation commits before any bytes may be written; on lost acknowledgement,
 * retry the SAME immutable claim and payload. Never release on a timeout.
 */
export function createAttachmentCapacity({connect}){
 const transaction=createReceiptTransactions({connect});
 function input(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Exact capacity claim required');const f=Object.freeze({...value});
  if(Object.keys(f).sort().join(',')!=='bytes,claimID,objectPath,purpose'||!uuid(f.claimID)||typeof f.objectPath!=='string'||!path.test(f.objectPath)
   ||!['upload','transfer-copy','household-copy'].includes(f.purpose)||((f.purpose==='household-copy')!==f.objectPath.startsWith('households/'))
   ||!f.objectPath.split('/').slice(f.purpose==='household-copy'?1:0).map(part=>part.split('.')[0]).every(uuid)
   ||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>5242880)throw Error('Exact capacity claim required');return f;
 }
 const args=f=>[f.claimID,f.objectPath,f.bytes,f.purpose];
 return Object.freeze({
  async reserve(value,signal){const f=input(value);return transaction(async tx=>{
   const result=await tx.query('select maintenance_private.reserve_attachment_capacity($1::uuid,$2::text,$3::bigint,$4::text) as claim_id',args(f));
   if(result?.rows?.length!==1||result.rows[0].claim_id!==f.claimID)throw Error('Capacity reservation unconfirmed');
   return Object.freeze({...f,state:'held',writeAuthorized:false});
  },{signal,readOnly:false});},
  async read(value,signal){const f=input(value);return transaction(async tx=>{
   const result=await tx.query('select claim_id,object_path,size_bytes,purpose from maintenance_private.attachment_capacity_claims where claim_id=$1::uuid',[f.claimID]);
   if(!Array.isArray(result?.rows)||result.rows.length>1)throw Error('Capacity read unconfirmed');if(!result.rows.length)return null;
   const r=result.rows[0];if(Object.keys(r).sort().join(',')!=='claim_id,object_path,purpose,size_bytes'||r.claim_id!==f.claimID||r.object_path!==f.objectPath||!(Number.isSafeInteger(r.size_bytes)||(typeof r.size_bytes==='string'&&/^[1-9][0-9]{0,6}$/.test(r.size_bytes)))||Number(r.size_bytes)!==f.bytes||r.purpose!==f.purpose)throw Error('Capacity scope conflict');
   return Object.freeze({...f,state:'held',writeAuthorized:false});
  },{signal,readOnly:true});}
 });
}
