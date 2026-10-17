import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function scope(input,execute){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!==(execute?'confirmation,epochID,eventID,planID,reviewRequestID,sealEventID,userID':'epochID,eventID,planID,reviewRequestID,sealEventID,userID')||![input.eventID,input.planID,input.reviewRequestID,input.userID,input.epochID,input.sealEventID].every(uuid)||(execute&&input.confirmation!=='EXECUTE_REVIEWED_APP_RETIREMENT_PRESERVING_FAMILY_RECORDS'))throw Error('Explicit exact reviewed retirement required');return Object.freeze({...input});
}
const args=s=>[s.eventID,s.planID,s.reviewRequestID,s.userID,s.epochID,s.sealEventID];
function receipt(result,s,allowMissing){
 const r=result?.rows?.length===1?result.rows[0].receipt:undefined;if(r===null&&allowMissing)return null;
 if(!r||Object.keys(r).sort().join(',')!=='accountErasureConfirmed,deletionRequestID,departedMembershipCount,detachedHomeCount,epochID,eventID,kind,planID,reviewRequestID,sealEventID,state,userID'
  ||r.kind!=='reviewed-retirement/v1'||['eventID','planID','reviewRequestID','userID','epochID','sealEventID'].some(k=>r[k]!==s[k])||r.deletionRequestID!==s.eventID||r.state!=='retirement_queued'||r.accountErasureConfirmed!==false||![r.detachedHomeCount,r.departedMembershipCount].every(n=>Number.isInteger(n)&&n>=0&&n<=10000))throw Error('Reviewed retirement unconfirmed');return Object.freeze({...r});
}
/** SQL-only private operator port; no endpoint, scheduler, file deletion or
 * shared Auth mutation. Keep the same event ID after ambiguous COMMIT. */
export function createReviewedRetirement({connect}){
 const transaction=createReceiptTransactions({connect});
 return Object.freeze({
  async status(input,signal){const s=scope(input,false);return transaction(async tx=>receipt(await tx.query('select maintenance_private.read_reviewed_retirement($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) receipt',args(s)),s,true),{signal,readOnly:false});},
  async execute(input,signal){const s=scope(input,true);return transaction(async tx=>receipt(await tx.query('select maintenance_private.execute_reviewed_retirement($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) receipt',args(s)),s,false),{signal,readOnly:false});}
 });
}
