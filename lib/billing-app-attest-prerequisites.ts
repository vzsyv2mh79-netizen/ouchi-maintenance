import {decodeAttestCBOR} from './billing-app-attest-cbor';
import {verifyAppAttestCertificateProof} from './billing-app-attest-certificate';
import {verifyAppAttestAuthenticator} from './billing-app-attest-authenticator';
import {verifyInitialAppAttestReceipt} from './billing-app-attest-receipt';
import type {AttestBuildPolicy} from './billing-app-attest-assertion';
import {registrationClientDataHash,type RegistrationChallenge} from './billing-app-attest-registration-challenge';
type Scope={appID:string;keyID:string;attestEnvironment:'development'|'production'};
/** Compose both prerequisites with the SAME authenticated bytes/key. Still
 * not registration: caller must independently verify the receipt and complete
 * live enrollment and one-use challenge checks.
 * No endpoint or key write is enabled by this helper.
 */
export function verifyAppAttestPrerequisites(attestation:Buffer,storedScope:Scope,storedClientDataHash:Buffer,policy:AttestBuildPolicy,rootPEM:string,now=Date.now()){
 const decoded=decodeAttestCBOR(attestation);
 if(!(decoded instanceof Map)||decoded.size!==3||decoded.get('fmt')!=='apple-appattest')throw Error('Invalid App Attest object');
 const statement=decoded.get('attStmt'),data=decoded.get('authData');
 if(!(statement instanceof Map)||statement.size!==2||!statement.has('x5c')||!statement.has('receipt')||!Buffer.isBuffer(data))throw Error('Invalid App Attest statement');
 const certificates=statement.get('x5c'),receipt=statement.get('receipt');
 if(!Array.isArray(certificates)||certificates.some(value=>!Buffer.isBuffer(value))||!Buffer.isBuffer(receipt)||receipt.length<1||receipt.length>65536)throw Error('Invalid App Attest certificates or receipt');
 const certificate=verifyAppAttestCertificateProof(certificates as Buffer[],data,storedClientDataHash,rootPEM,now);
 if(!storedScope||certificate.keyID!==storedScope.keyID)throw Error('App Attest registered key mismatch');
 const authenticator=verifyAppAttestAuthenticator(data,{...storedScope,publicKeyX962:certificate.publicKeyX962},policy);
 return Object.freeze({certificate,authenticator,receiptToVerify:Buffer.from(receipt)});
}
/** Bind the independently verified receipt to these SAME certificate/challenge
 * prerequisites. Live/atomic registration
 * gates remain mandatory; this function does not persist or authorize a key.
 */
export function verifyAppAttestRegistrationProofs(attestation:Buffer,storedScope:Scope,storedClientDataHash:Buffer,policy:AttestBuildPolicy,privateRootPEM:string,publicRootDER:Buffer,now=Date.now()){
 const prerequisites=verifyAppAttestPrerequisites(attestation,storedScope,storedClientDataHash,policy,privateRootPEM,now);
 const receipt=verifyInitialAppAttestReceipt(prerequisites.receiptToVerify,{appID:storedScope.appID,attestedCertificateSHA256:prerequisites.certificate.attestationCertificateSHA256,publicKeyX962:prerequisites.certificate.publicKeyX962,clientDataHash:storedClientDataHash},publicRootDER,now);
 return Object.freeze({prerequisites,receipt});
}
/** Server-stored registration challenge only. The hash and proof scope are
 * derived together rather than accepted independently from the device. Caller
 * must still recheck live Auth/enrollment and atomically consume/persist once.
 * No rights grant, registration endpoint or database write is enabled here.
 */
export function verifyStoredRegistrationChallengeProofs(attestation:Buffer,storedChallenge:RegistrationChallenge,policy:AttestBuildPolicy,privateRootPEM:string,publicRootDER:Buffer,now=Date.now()){
 const hash=registrationClientDataHash(storedChallenge,now);
 const scope={appID:storedChallenge.appID,keyID:storedChallenge.keyID,attestEnvironment:storedChallenge.attestEnvironment};
 return verifyAppAttestRegistrationProofs(attestation,scope,hash,policy,privateRootPEM,publicRootDER,now);
}
