import {createHash,createPublicKey,timingSafeEqual,verify} from 'node:crypto';
import {decodeAttestCBOR} from './billing-app-attest-cbor';
import {restoreAssertionClientData,type RestoreChallenge} from './billing-restore-client-data';

export type StoredAttestedKey={
 userID:string;epochID:string;keyID:string;appID:string;
 attestEnvironment:'development'|'production';publicKeyX962:Buffer;counter:number;
};
export type AttestBuildPolicy={validationCategories:readonly number[];bundleVersions:readonly string[]};
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest();
/** Server-only cryptographic check against an ALREADY Apple-attested key.
 * This does not verify/register its certificate or receipt, validate live Auth,
 * consume a challenge/counter or authorize a purchase transfer. The caller must
 * load both inputs from its trusted registry, then atomically consume against
 * the returned previousCounter; accepting this result alone is insufficient.
 */
export function verifyRestoreAppAttestAssertion(assertion:Buffer,stored:StoredAttestedKey,challenge:RestoreChallenge,policy:AttestBuildPolicy,now=Date.now()){
 const clientData=restoreAssertionClientData(challenge,now);
 if(!stored||stored.userID!==challenge.userID||stored.epochID!==challenge.epochID||stored.keyID!==challenge.keyID||stored.appID!==challenge.appID||stored.attestEnvironment!==challenge.attestEnvironment)throw Error('App Attest key scope mismatch');
 if(!Number.isInteger(stored.counter)||stored.counter<0||stored.counter>0xffffffff||!Buffer.isBuffer(stored.publicKeyX962)||stored.publicKeyX962.length!==65||stored.publicKeyX962[0]!==4||sha(stored.publicKeyX962).toString('base64')!==stored.keyID)throw Error('Invalid stored App Attest key');
 if(!policy||!Array.isArray(policy.validationCategories)||!policy.validationCategories.length||policy.validationCategories.some(value=>!Number.isInteger(value)||![2,3,4].includes(value)||(stored.attestEnvironment==='development'?value!==3:value===3))||!Array.isArray(policy.bundleVersions)||!policy.bundleVersions.length||policy.bundleVersions.length>64||policy.bundleVersions.some(value=>typeof value!=='string'||!/^[0-9]+(?:\.[0-9]+){0,2}$/.test(value)||value.length>64))throw Error('Invalid App Attest build policy');
 const decoded=decodeAttestCBOR(assertion);
 if(!(decoded instanceof Map)||decoded.size!==2||!decoded.has('signature')||!decoded.has('authenticatorData'))throw Error('Invalid App Attest assertion');
 const signature=decoded.get('signature'),data=decoded.get('authenticatorData');
 if(!Buffer.isBuffer(signature)||signature.length<8||signature.length>72||!Buffer.isBuffer(data)||data.length<38||data.length>4096)throw Error('Invalid App Attest assertion bytes');
 if(!timingSafeEqual(data.subarray(0,32),sha(stored.appID)))throw Error('App Attest RP mismatch');
 const flags=data[32];
 // Require extensions, reject attested-credential/reserved flags and invalid
 // backup-state flags. User-presence/verification flags are not authorization.
 if(!(flags&0x80)||(flags&0x62)||((flags&0x10)&&!(flags&0x08)))throw Error('Invalid App Attest assertion flags');
 const counter=data.readUInt32BE(33);if(counter<=stored.counter)throw Error('App Attest counter replay');
 const extensions=decodeAttestCBOR(data.subarray(37));
 if(!(extensions instanceof Map))throw Error('Missing App Attest assertion extensions');
 const category=extensions.get('validationCategory'),version=extensions.get('bundleVersion');
 if(typeof category!=='number'||!policy.validationCategories.includes(category)||typeof version!=='string'||!policy.bundleVersions.includes(version))throw Error('Unapproved App Attest build');
 const point=stored.publicKeyX962;
 const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:point.subarray(1,33).toString('base64url'),y:point.subarray(33).toString('base64url')}});
 // App Attest signs the derived nonce. Node's ECDSA/SHA256 API takes that
 // nonce as its message; do not substitute the preimage or accept both modes.
 const nonce=sha(Buffer.concat([data,sha(clientData)]));
 if(!verify('sha256',nonce,key,signature))throw Error('Invalid App Attest assertion signature');
 return Object.freeze({requestID:challenge.requestID,keyID:stored.keyID,previousCounter:stored.counter,counter,clientDataSHA256:sha(clientData).toString('hex'),assertionSHA256:sha(assertion).toString('hex')});
}
