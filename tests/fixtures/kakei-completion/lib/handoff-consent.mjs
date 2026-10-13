import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {normalizeSharedDeletionScope} from './shared-deletion.mjs';
const domain='Kakei/shared-family-handoff/v1';
export function handoffPlanDigest(value,plan) {
 const s=normalizeSharedDeletionScope(value),app=s.apps.find(a=>a.app==='kakei');
 if(!app||!plan||plan.protocolVersion!==s.protocolVersion||plan.requestID!==s.requestID||plan.userID!==s.userID||plan.inventoryDigest!==s.inventoryDigest||plan.appRequestID!==app.requestID||plan.appScopeID!==app.scopeID||!plan.householdID||!plan.successorID||plan.successorID===s.userID||!Array.isArray(plan.memberIDs)||!Array.isArray(plan.familyRecordIDs))throw Error('Consent plan scope mismatch');
 const data={protocolVersion:s.protocolVersion,requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,
  appRequestID:app.requestID,appScopeID:app.scopeID,householdID:plan.householdID,successorID:plan.successorID,
  memberIDs:[...plan.memberIDs].sort(),familyRecordIDs:[...plan.familyRecordIDs].sort()};
 if(plan.familySnapshotDigest!==undefined){if(!/^[a-f0-9]{64}$/.test(plan.familySnapshotDigest))throw Error('Consent content digest invalid');data.familySnapshotDigest=plan.familySnapshotDigest;}
 if(plan.retainedFamilySnapshotDigest!==undefined){if(!/^[a-f0-9]{64}$/.test(plan.retainedFamilySnapshotDigest))throw Error('Consent retained digest invalid');data.retainedFamilySnapshotDigest=plan.retainedFamilySnapshotDigest;}
 return createHash('sha256').update(domain+'\n'+JSON.stringify(data)).digest('hex');
}
function decode(part) {
 if(typeof part!=='string'||!/^[A-Za-z0-9_-]+$/.test(part))throw Error('Invalid consent encoding');
 const bytes=Buffer.from(part,'base64url');if(bytes.toString('base64url')!==part)throw Error('Noncanonical consent encoding');return bytes;
}
function claims(token,key) {
 if(typeof token!=='string'||token.length>8192)throw Error('Invalid consent proof');
 const parts=token.split('.');if(parts.length!==2)throw Error('Invalid consent proof');
 const body=decode(parts[0]),signature=decode(parts[1]);
 const expected=createHmac('sha256',key).update(domain+'\n'+parts[0]).digest();
 if(signature.length!==expected.length||!timingSafeEqual(signature,expected))throw Error('Invalid consent signature');
 const value=JSON.parse(body.toString('utf8'));
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='acceptedAt,actorID,authVerifiedAt,expiresAt,planDigest,purpose,role')throw Error('Invalid consent claims');
 return value;
}
function validClaim(c,actorID,scope,plan,digest,now,allowExpired=false) {
 return c.purpose===domain&&c.planDigest===digest&&['owner','successor'].includes(c.role)&&
  c.actorID===actorID&&c.actorID===(c.role==='owner'?scope.userID:plan.successorID)&&
  [c.acceptedAt,c.authVerifiedAt,c.expiresAt].every(t=>Number.isSafeInteger(t)&&t>0)&&
  c.acceptedAt<=now+60000&&(allowExpired||c.expiresAt>now)&&c.expiresAt>c.acceptedAt&&c.expiresAt-c.acceptedAt<=900000&&
  c.authVerifiedAt>=c.acceptedAt-600000&&c.authVerifiedAt<=c.acceptedAt+60000&&c.authVerifiedAt<=now+60000;
}
function storedStatus(old,key,actorID,scope,plan,now) {
 if(old===null)return {status:'not_accepted'};
 const c=claims(old.token,key),digest=handoffPlanDigest(scope,plan);
 if(old.actorID!==actorID||!validClaim(c,old.actorID,scope,plan,digest,now,true))return {status:'unconfirmed'};
 if(old.revokedAt!==null)return {status:'revoked'};
 if(c.expiresAt<=now)return {status:'expired',expiresAt:c.expiresAt};
 return {status:'accepted',expiresAt:c.expiresAt};
}
function freshIdentity(identity,now) {
 return identity&&typeof identity.userID==='string'&&Number.isSafeInteger(identity.authVerifiedAt)&&identity.authVerifiedAt>=now-600000&&identity.authVerifiedAt<=now+60000;
}
/** This verifies BACKEND attestations, not Supabase JWTs. An issuer must first
 * verify both people with real Auth, current membership/plan and recent password
 * verification, then save immutable proofs in a private scope-bound store.
 * The signing key stays server-side. No deployed endpoint, key provisioning or
 * production consent table is supplied here. loadRecords must lock the private
 * records in tx and return current revocation; never accept client token arrays.
 */
export function createSignedHandoffConsentVerifier({key,loadRecords}) {
 if(!(key instanceof Uint8Array)||key.length<32||typeof loadRecords!=='function')throw Error('Missing private consent verifier');
 const secret=Buffer.from(key);
 return async(value,plan,tx)=>{
  try {
   const scope=normalizeSharedDeletionScope(value),digest=handoffPlanDigest(scope,plan);
   const records=await loadRecords(scope,plan,tx),now=Date.now();
   if(!Array.isArray(records)||records.length!==2)return false;
   const roles=new Set();
   for(const record of records) {
    if(!record||record.revokedAt!==null)return false;
    const c=claims(record.token,secret);
    if(!validClaim(c,record.actorID,scope,plan,digest,now)||roles.has(c.role))return false;
    roles.add(c.role);
   }
   return roles.size===2;
  }catch{return false;}
 };
}
/** Cryptographic evidence only. committedAt must come from an immutable,
 * transaction-bound completion record, never a caller timestamp. This does
 * not authorize a new transfer or ignore current revocation for mutations. */
export function createHandoffConsentEvidenceVerifier({key}) {
 if(!(key instanceof Uint8Array)||key.length<32)throw Error('Missing private consent evidence key');
 const secret=Buffer.from(key);
 return (value,plan,records,committedAt)=>{
  try {
   if(!Number.isSafeInteger(committedAt)||committedAt<=0||committedAt>Date.now()+60000||!Array.isArray(records)||records.length!==2)return false;
   const s=normalizeSharedDeletionScope(value),digest=handoffPlanDigest(s,plan),roles=new Set();
   for(const r of records){
    if(!r||r.revokedAt!==null)return false;
    const c=claims(r.token,secret);
    if(!validClaim(c,r.actorID,s,plan,digest,committedAt)||c.acceptedAt>committedAt||c.authVerifiedAt>committedAt||c.authVerifiedAt<committedAt-600000||roles.has(c.role))return false;
    roles.add(c.role);
   }
   return roles.size===2;
  }catch{return false;}
 };
}
/** Not an HTTP endpoint. Identity and DB adapters are mandatory and must use
 * real verified Auth/current sessions and private immutable plans in production.
 * Only status/expiry is returned to the app, never the proof or signing key.
 */
export function createHandoffConsentIssuer({key,verifyIdentity,store}) {
 if(!(key instanceof Uint8Array)||key.length<32||typeof verifyIdentity!=='function'||!store||['transaction','target','existing','record'].some(k=>typeof store[k]!=='function'))throw Error('Missing consent issuer');
 const secret=Buffer.from(key);
 return async({requestID,householdID,accessToken,confirmation})=>{
  if(confirmation!=='家族データの引き継ぎに同意する')return {status:'unconfirmed'};
  try {
   return await store.transaction(async tx=>{
    const identity=await verifyIdentity(accessToken,tx);let now=Date.now();
    if(!freshIdentity(identity,now))return {status:'unconfirmed'};
    const target=await store.target(tx,requestID,householdID,identity.userID);
    if(!target)return {status:'unconfirmed'};
    const {scope,plan}=target,digest=handoffPlanDigest(scope,plan),role=identity.userID===scope.userID?'owner':'successor';
    const old=await store.existing(tx,scope,plan,identity.userID);
    now=Date.now();
    if(!freshIdentity(identity,now))return {status:'unconfirmed'};
    if(old!==null) {
     // A replay returns the original deadline. No silent renewal/revival.
     return storedStatus(old,secret,identity.userID,scope,plan,now);
    }
    const c={purpose:domain,planDigest:digest,actorID:identity.userID,role,acceptedAt:now,authVerifiedAt:identity.authVerifiedAt,expiresAt:now+900000};
    const body=Buffer.from(JSON.stringify(c)).toString('base64url');
    const token=body+'.'+createHmac('sha256',secret).update(domain+'\n'+body).digest('base64url');
    await store.record(tx,scope,plan,identity.userID,token);
    return {status:'accepted',expiresAt:c.expiresAt};
   });
  }catch{return {status:'unconfirmed'};}
 };
}
/** Private authenticated actions for the current person's consent only.
 * No renewal, request cancellation, handoff or HTTP deployment is performed.
 * The owner must cancel and submit a new request through the reviewed intake
 * before either person can consent to a fresh plan after expiry/revocation.
 */
export function createHandoffConsentActions({key,verifyIdentity,store}) {
 if(!(key instanceof Uint8Array)||key.length<32||typeof verifyIdentity!=='function'||!store||['transaction','target','revocationTarget','existing','revoke'].some(k=>typeof store[k]!=='function'))throw Error('Missing consent actions');
 const secret=Buffer.from(key);
 async function act(body,revoke) {
  if(!body||typeof body!=='object')return {status:'unconfirmed'};
  if(revoke&&body.confirmation!=='家族データの引き継ぎへの同意を取り消す')return {status:'unconfirmed'};
  try{return await store.transaction(async tx=>{
   const identity=await verifyIdentity(body.accessToken,tx);
   if(!freshIdentity(identity,Date.now()))return {status:'unconfirmed'};
   const target=await (revoke?store.revocationTarget:store.target)(tx,body.requestID,body.householdID,identity.userID);
   if(!target)return {status:'unconfirmed'};
   const old=await store.existing(tx,target.scope,target.plan,identity.userID);
   if(!freshIdentity(identity,Date.now()))return {status:'unconfirmed'};
   const state=storedStatus(old,secret,identity.userID,target.scope,target.plan,Date.now());
   if(!revoke||['unconfirmed','not_accepted'].includes(state.status))return state;
   if(!await store.revoke(tx,body.requestID,body.householdID,identity.userID))return {status:'unconfirmed'};
   return {status:'revoked'};
  });}catch{return {status:'unconfirmed'};}
 }
 return {status:body=>act(body,false),revoke:body=>act(body,true)};
}
/** Private inbox: enumerate only plans addressed to this verified person.
 * The client never supplies a user ID or guesses request/household identifiers.
 * All targets are rechecked and locked in the same bounded transaction.
 */
export function createHandoffConsentInbox({key,verifyIdentity,store}) {
 if(!(key instanceof Uint8Array)||key.length<32||typeof verifyIdentity!=='function'||!store||['transaction','listTargets','describe','existing'].some(k=>typeof store[k]!=='function'))throw Error('Missing consent inbox');
 const secret=Buffer.from(key);
 return async({accessToken})=>{
  try{return await store.transaction(async tx=>{
   const identity=await verifyIdentity(accessToken,tx);
   if(!freshIdentity(identity,Date.now()))return {status:'unconfirmed'};
   const targets=await store.listTargets(tx,identity.userID);
   if(!Array.isArray(targets)||targets.length>20)throw Error('Unbounded inbox');
   const plans=[];
   for(const {scope,plan} of targets){
    handoffPlanDigest(scope,plan);
    if(identity.userID!==scope.userID&&identity.userID!==plan.successorID)throw Error('Foreign inbox plan');
    const description=await store.describe(tx,scope,plan);
    if(['householdName','ownerName','successorName'].some(k=>typeof description?.[k]!=='string'||!description[k].trim()||description[k].length>100))throw Error('Unconfirmed description');
    const state=storedStatus(await store.existing(tx,scope,plan,identity.userID),secret,identity.userID,scope,plan,Date.now());
    if(state.status==='unconfirmed')throw Error('Unconfirmed stored consent');
    plans.push({requestID:scope.requestID,householdID:plan.householdID,...Object.fromEntries(['householdName','ownerName','successorName'].map(k=>[k,description[k]])),role:identity.userID===scope.userID?'owner':'successor',memberCount:plan.memberIDs.length,retainedRecordCount:plan.familyRecordIDs.length,consent:state});
   }
   if(!freshIdentity(identity,Date.now()))return {status:'unconfirmed'};
   return {status:'ready',plans};
  });}catch{return {status:'unconfirmed'};}
 };
}
