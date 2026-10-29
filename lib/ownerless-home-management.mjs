import {createReceiptTransactions} from './deletion-receipt-transactions.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
export class ManagementReauthenticationRequired extends Error {}
function currentIdentity(value){
 if(!value||![value.userID,value.sessionID,value.epochID].every(uuid)
  ||!['aal1','aal2'].includes(value.aal)||!Number.isSafeInteger(value.authenticatedAt)||value.authenticatedAt<=0
  ||!Number.isSafeInteger(value.checkedAt)||value.checkedAt<value.authenticatedAt||value.checkedAt-value.authenticatedAt>600000
  ||typeof value.authStateDigest!=='string'||!/^[0-9a-f]{64}$/.test(value.authStateDigest))throw new ManagementReauthenticationRequired('Recent verified management identity required');
 return Object.freeze({...value});
}
/** Backend composition only. Supply the existing pinned inventory identity
 * verifier (exact-bearer Auth + current policy/AAL + recent password/TOTP).
 * Its locks remain held through this transaction's commit. No connection,
 * credentials, public route, policy switch or retirement dispatcher is created.
 */
export function createOwnerlessHomeManagement({connect,verifyIdentity,verifyCurrent=verifyIdentity}){
 if(typeof verifyIdentity!=='function'||typeof verifyCurrent!=='function')throw Error('Pinned management identity verifier required');
 const transaction=createReceiptTransactions({connect});
 const read=async(input,bearer,signal,receipt)=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Scoped management read required');
  const fixed=Object.freeze({...input});
  const keys=receipt?'epochID,generation,homeID,requestID':'epochID,homeID';
  if(Object.keys(fixed).sort().join(',')!==keys||!Object.values(fixed).every(uuid))throw Error('Scoped management read required');
  if(typeof bearer!=='string'||!/^[^\s,]{1,16384}$/.test(bearer))throw Error('Verified bearer required');
  return transaction(async tx=>{
   const first=await verifyCurrent(bearer,tx);
   if(!first||![first.userID,first.sessionID,first.epochID].every(uuid)||first.epochID!==fixed.epochID)throw Error('Current matching management identity required');
   const original=Object.freeze({...first});
   const result=await tx.query(receipt?'select maintenance_private.read_ownerless_home_claim($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) as receipt':'select maintenance_private.read_ownerless_home_status($1::uuid,$2::uuid,$3::uuid,$4::uuid) as receipt',
    receipt?[fixed.requestID,fixed.homeID,fixed.generation,original.userID,original.sessionID,original.epochID]:[fixed.homeID,original.userID,original.sessionID,original.epochID]);
   const value=result?.rows?.length===1?result.rows[0].receipt:null;
   if(!value||value.homeID!==fixed.homeID||value.epochID!==fixed.epochID)throw Error('Management read unconfirmed');
   if(receipt){
    if(Object.keys(value).sort().join(',')!=='epochID,generation,homeID,kind,requestID,state'||value.kind!=='ownerless-home-claim/v1'
     ||value.requestID!==fixed.requestID||value.generation!==fixed.generation||!['claimed','superseded','not_recorded'].includes(value.state))throw Error('Management read unconfirmed');
   }else if(Object.keys(value).sort().join(',')!=='canClaim,epochID,generation,homeID,kind,state'||value.kind!=='ownerless-home-status/v1'
    ||!['managed','awaiting_management'].includes(value.state)||typeof value.canClaim!=='boolean'
    ||(value.state==='managed'?(value.generation!==null||value.canClaim):!uuid(value.generation)))throw Error('Management read unconfirmed');
   const final=await verifyCurrent(bearer,tx);
   if(!final||['userID','sessionID','epochID'].some(key=>final[key]!==original[key]))throw Error('Management identity changed');
   return Object.freeze({...value});
  },{signal,readOnly:false});
 };
 return Object.freeze({
 readStatus:(input,bearer,signal)=>read(input,bearer,signal,false),
 readClaim:(input,bearer,signal)=>read(input,bearer,signal,true),
 async claim(input,bearer,signal){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Explicit management claim required');
  const fixed=Object.freeze({...input});
  if(Object.keys(fixed).sort().join(',')!=='confirmation,epochID,generation,homeID,requestID'
   ||![fixed.requestID,fixed.homeID,fixed.generation,fixed.epochID].every(uuid)
   ||fixed.confirmation!=='CLAIM_HOME_MANAGEMENT')throw Error('Explicit management claim required');
  if(typeof bearer!=='string'||!/^[^\s,]{1,16384}$/.test(bearer))throw Error('Verified bearer required');
  return transaction(async tx=>{
   const first=currentIdentity(await verifyIdentity(bearer,tx));
   if(first.epochID!==fixed.epochID)throw Error('Current matching enrollment required');
   const result=await tx.query('select maintenance_private.claim_ownerless_home($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid) as receipt',
    [fixed.requestID,fixed.homeID,fixed.generation,first.userID,first.sessionID,first.epochID]);
   const value=result?.rows?.length===1?result.rows[0].receipt:null;
   if(!value||Object.keys(value).sort().join(',')!=='epochID,generation,homeID,kind,requestID,state'
    ||value.kind!=='ownerless-home-claim/v1'||value.requestID!==fixed.requestID||value.homeID!==fixed.homeID
    ||value.generation!==fixed.generation||value.epochID!==first.epochID||!['claimed','superseded'].includes(value.state))throw Error('Management result unconfirmed');
   // Recheck original bearer/policy before COMMIT; identity/AAL/auth state must
   // not be replaced by a new session, epoch or authentication event mid-claim.
   const final=currentIdentity(await verifyIdentity(bearer,tx));
   if(['userID','sessionID','epochID','aal','authenticatedAt','authStateDigest'].some(key=>first[key]!==final[key])
    ||final.checkedAt<first.checkedAt)throw Error('Management identity changed');
   return Object.freeze({...value});
  },{signal,readOnly:false});
 }});
}
