import {createHash,randomBytes} from 'node:crypto';
import type {BillingEnvironment} from './billing';

export type RestoreProofScope={
 userID:string;sessionID:string;epochID:string;requestID:string;keyID:string;
 appID:string;attestEnvironment:'development'|'production';
 purchaseEnvironment:BillingEnvironment;proofSHA256:string;
};
export type RestoreChallenge=RestoreProofScope & {
 version:1;purpose:'restore_ouchi_subscription';nonce:string;issuedAt:number;expiresAt:number;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const scopeKeys=['userID','sessionID','epochID','requestID','keyID','appID','attestEnvironment','purchaseEnvironment','proofSHA256'];
const challengeKeys=[...scopeKeys,'version','purpose','nonce','issuedAt','expiresAt'];
const exactKeys=(value:object,keys:string[])=>Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function validateScope(value:RestoreProofScope){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid restore scope');
 for(const name of ['userID','sessionID','epochID','requestID'] as const){
  if(typeof value[name]!=='string'||!uuid.test(value[name])||value[name]==='00000000-0000-0000-0000-000000000000')throw Error('Invalid restore identity');
 }
 if(value.epochID===value.userID)throw Error('Invalid restore enrollment');
 if(typeof value.keyID!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(value.keyID)||Buffer.from(value.keyID,'base64').length!==32||Buffer.from(value.keyID,'base64').toString('base64')!==value.keyID)throw Error('Invalid attested key identifier');
 if(typeof value.appID!=='string'||!/^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(value.appID))throw Error('Invalid restore app identifier');
 if(!['development','production'].includes(value.attestEnvironment)||!['Sandbox','Production'].includes(value.purchaseEnvironment)||typeof value.proofSHA256!=='string'||!/^[0-9a-f]{64}$/.test(value.proofSHA256))throw Error('Invalid restore proof scope');
}
/** Digest only. Both JWS signatures and their account pair MUST be verified
 * separately. Length prefixes and a domain separator prevent ambiguous pairs.
 */
export function restorePairDigest(signedApp:string,signedTransaction:string){
 const bytes=[signedApp,signedTransaction].map(value=>{
  if(typeof value!=='string'||!value||Buffer.byteLength(value)>131072)throw Error('Invalid restore proof input');
  return Buffer.from(value,'utf8');
 });
 const hash=createHash('sha256').update('ouchi.restore.pair.v1\0');
 for(const value of bytes)hash.update(String(value.length)+':').update(value);
 return hash.digest('hex');
}
/** Server-only construction. Caller must already verify live Auth/enrollment,
 * the StoreKit pair and a server-stored Apple-attested key association. Persist
 * this exact challenge before returning it; generation does not authorize a
 * restore, validate App Attest, consume a nonce or change purchase ownership.
 */
export function createRestoreChallenge(scope:RestoreProofScope,now=Date.now()):Readonly<RestoreChallenge>{
 validateScope(scope);if(!exactKeys(scope,scopeKeys)||!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(now+300000))throw Error('Invalid restore challenge');
 return Object.freeze({...scope,version:1,purpose:'restore_ouchi_subscription',nonce:randomBytes(32).toString('base64url'),issuedAt:now,expiresAt:now+300000});
}
/** Exact bytes to hash and sign with App Attest. The server must rebuild these
 * bytes from its stored challenge, never from an untrusted client scope. Device
 * verification and atomic single-use/counter consumption remain separate gates.
 */
export function restoreAssertionClientData(challenge:RestoreChallenge,now=Date.now()):Buffer{
 validateScope(challenge);
 if(!exactKeys(challenge,challengeKeys)||challenge.version!==1||challenge.purpose!=='restore_ouchi_subscription'||typeof challenge.nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(challenge.nonce)||Buffer.from(challenge.nonce,'base64url').toString('base64url')!==challenge.nonce)throw Error('Invalid restore challenge');
 if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(challenge.issuedAt)||challenge.issuedAt<=0||!Number.isSafeInteger(challenge.expiresAt)||challenge.expiresAt-challenge.issuedAt!==300000||challenge.issuedAt>now||now>=challenge.expiresAt)throw Error('Restore challenge expired');
 return Buffer.from(JSON.stringify({
  version:challenge.version,purpose:challenge.purpose,nonce:challenge.nonce,
  issuedAt:challenge.issuedAt,expiresAt:challenge.expiresAt,
  userID:challenge.userID,sessionID:challenge.sessionID,epochID:challenge.epochID,
  requestID:challenge.requestID,keyID:challenge.keyID,appID:challenge.appID,
  attestEnvironment:challenge.attestEnvironment,purchaseEnvironment:challenge.purchaseEnvironment,
  proofSHA256:challenge.proofSHA256,
 }),'utf8');
}
