import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion.mjs';
import {handoffPlanDigest} from './handoff-consent.mjs';
const domain='Kakei/shared-family-handoff-auth-state/v2';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fresh=(v,at)=>v&&typeof v.userID==='string'&&hash(v.authStateDigest)&&Number.isSafeInteger(v.authVerifiedAt)&&v.authVerifiedAt>0&&v.authVerifiedAt<=at&&v.authVerifiedAt>=at-600000;
function secret(key){if(!(key instanceof Uint8Array)||key.length<32)throw Error('Private Auth-bound consent key required');return Buffer.from(key);}
function claims(token,key){
 if(typeof token!=='string'||token.length>8192)throw Error('Bounded Auth consent required');
 const parts=token.split('.');if(parts.length!==2||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw Error('Canonical Auth consent required');
 const signature=Buffer.from(parts[1],'base64url'),body=Buffer.from(parts[0],'base64url');
 if(body.toString('base64url')!==parts[0]||signature.toString('base64url')!==parts[1])throw Error('Canonical Auth consent required');
 const expected=createHmac('sha256',key).update(domain+'\n'+parts[0]).digest();
 if(signature.length!==expected.length||!timingSafeEqual(signature,expected))throw Error('Auth consent signature invalid');
 const c=JSON.parse(body.toString('utf8'));
 if(!c||Array.isArray(c)||Object.keys(c).sort().join(',')!=='acceptedAt,actorID,authStateDigest,authVerifiedAt,expiresAt,planDigest,purpose,role')throw Error('Exact Auth consent claims required');
 return c;
}
function valid(c,r,s,p,at){
 return r&&r.revokedAt===null&&c.purpose===domain&&c.planDigest===handoffPlanDigest(s,p)&&hash(c.authStateDigest)&&['owner','successor'].includes(c.role)&&
 c.actorID===r.actorID&&c.actorID===(c.role==='owner'?s.userID:p.successorID)&&
 [c.acceptedAt,c.authVerifiedAt,c.expiresAt].every(v=>Number.isSafeInteger(v)&&v>0)&&
 c.acceptedAt<=at&&c.authVerifiedAt<=c.acceptedAt&&c.authVerifiedAt>=c.acceptedAt-600000&&c.authVerifiedAt>=at-600000&&
 c.expiresAt>at&&c.expiresAt>c.acceptedAt&&c.expiresAt<=c.acceptedAt+900000&&c.expiresAt<=c.authVerifiedAt+600000;
}
/** Only verifies original signed evidence at an immutable completion timestamp.
 * No current mutation permission, server connection or legacy-v1 promotion. */
export function createAuthBoundConsentEvidenceVerifier({key}){
 const k=secret(key);
 return (value,plan,records,at)=>{
  try{
   if(!Number.isSafeInteger(at)||at<=0||at>Date.now()+60000||!Array.isArray(records)||records.length!==2)return false;
   const s=normalizeSharedDeletionScope(value),roles=new Set();
   for(const r of records){const c=claims(r?.token,k);if(!valid(c,r,s,plan,at)||roles.has(c.role))return false;roles.add(c.role);}
   return roles.size===2;
  }catch{return false;}
 };
}
/** verifyAuthState must lock/revalidate CURRENT trusted user/session/factor
 * state on tx and return its digest and actual re-auth time. Never a client
 * metadata digest or a cached getUser boolean. No default reader/grants. */
export function createAuthBoundHandoffConsentVerifier({key,loadRecords,verifyAuthState}){
 const k=secret(key),evidence=createAuthBoundConsentEvidenceVerifier({key});
 if([loadRecords,verifyAuthState].some(f=>typeof f!=='function'))throw Error('Trusted current Auth state ports required');
 return async(value,plan,tx)=>{
  try{
   const s=normalizeSharedDeletionScope(value),records=await loadRecords(s,plan,tx);
   if(!evidence(s,plan,records,Date.now()))return false;
   // Stable actor order is shared with issuer/worker coordination locks.
   for(const r of [...records].sort((a,b)=>a.actorID.localeCompare(b.actorID))){
    const c=claims(r.token,k),state=await verifyAuthState(s,plan,r.actorID,tx);
    if(!fresh(state,Date.now())||state.userID!==r.actorID||state.authStateDigest!==c.authStateDigest||state.authVerifiedAt!==c.authVerifiedAt)return false;
   }
   const again=await loadRecords(s,plan,tx);
   return JSON.stringify(again)===JSON.stringify(records)&&evidence(s,plan,again,Date.now());
  }catch{return false;}
 };
}
/** Backend-only issuer. Identity must come from current pinned Auth verification.
 * Store uses immutable scoped plans and private records; no HTTP/key provisioning.
 * Existing proofs are never renewed, upgraded or rebound to a new Auth state. */
export function createAuthBoundHandoffConsentIssuer({key,verifyIdentity,store}){
 const k=secret(key);
 if(typeof verifyIdentity!=='function'||!store||['transaction','target','existing','record'].some(p=>typeof store[p]!=='function'))throw Error('Trusted Auth-bound issuer ports required');
 return async({requestID,householdID,accessToken,confirmation})=>{
  if(confirmation!=='家族データの引き継ぎに同意する')return {status:'unconfirmed'};
  try{return await store.transaction(async tx=>{
   const identity=await verifyIdentity(accessToken,tx);if(!fresh(identity,Date.now()))return {status:'unconfirmed'};
   const target=await store.target(tx,requestID,householdID,identity.userID);if(!target)return {status:'unconfirmed'};
   const {scope:s,plan:p}=target,digest=handoffPlanDigest(s,p),old=await store.existing(tx,s,p,identity.userID),at=Date.now();
   if(!fresh(identity,at))return {status:'unconfirmed'};
   if(old!==null){
    const c=claims(old.token,k);
    if(!valid(c,old,s,p,at)||c.authStateDigest!==identity.authStateDigest||c.authVerifiedAt!==identity.authVerifiedAt)return {status:'unconfirmed'};
    return {status:'accepted',expiresAt:c.expiresAt};
   }
   const c={purpose:domain,planDigest:digest,actorID:identity.userID,role:identity.userID===s.userID?'owner':'successor',acceptedAt:at,authVerifiedAt:identity.authVerifiedAt,authStateDigest:identity.authStateDigest,expiresAt:Math.min(at+900000,identity.authVerifiedAt+600000)};
   const body=Buffer.from(JSON.stringify(c)).toString('base64url'),token=body+'.'+createHmac('sha256',k).update(domain+'\n'+body).digest('base64url');
   await store.record(tx,s,p,identity.userID,token);return {status:'accepted',expiresAt:c.expiresAt};
  });}catch{return {status:'unconfirmed'};}
 };
}
