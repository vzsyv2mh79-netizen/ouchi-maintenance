import {createHash,timingSafeEqual} from 'node:crypto';
import {decodeAttestCBOR,decodeAttestCOSEPrefix} from './billing-app-attest-cbor';
import type {AttestBuildPolicy} from './billing-app-attest-assertion';

export type AttestationAuthenticatorScope={appID:string;keyID:string;attestEnvironment:'development'|'production';publicKeyX962:Buffer};
/** Authenticator prerequisite only. The public key must come from the verified
 * certificate, and data must be the SAME bytes verified by its nonce. This
 * function does not verify certificates/receipts, authenticate an enrollment,
 * consume a registration challenge or register/authorize a device.
 */
export function verifyAppAttestAuthenticator(data:Buffer,scope:AttestationAuthenticatorScope,policy:AttestBuildPolicy){
 if(!Buffer.isBuffer(data)||data.length<164||data.length>4096||!scope||typeof scope.appID!=='string'||!/^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(scope.appID)||!['development','production'].includes(scope.attestEnvironment)||!Buffer.isBuffer(scope.publicKeyX962)||scope.publicKeyX962.length!==65||scope.publicKeyX962[0]!==4)throw Error('Invalid App Attest authenticator scope');
 const point=scope.publicKeyX962,keyHash=createHash('sha256').update(point).digest();
 if(keyHash.toString('base64')!==scope.keyID)throw Error('App Attest credential hash mismatch');
 if(!timingSafeEqual(data.subarray(0,32),createHash('sha256').update(scope.appID).digest()))throw Error('App Attest authenticator RP mismatch');
 const flags=data[32];if(!(flags&0x40)||(flags&0x22)||((flags&0x10)&&!(flags&0x08)))throw Error('Invalid App Attest attestation flags');
 if(data.readUInt32BE(33)!==0)throw Error('Invalid App Attest initial counter');
 const expectedAAGUID=scope.attestEnvironment==='development'?Buffer.from('appattestdevelop'):Buffer.concat([Buffer.from('appattest'),Buffer.alloc(7)]);
 if(!timingSafeEqual(data.subarray(37,53),expectedAAGUID))throw Error('App Attest aaguid mismatch');
 const credentialLength=data.readUInt16BE(53);if(credentialLength!==32||!timingSafeEqual(data.subarray(55,87),keyHash))throw Error('App Attest credential mismatch');
 const cose=decodeAttestCOSEPrefix(data.subarray(87)),key=cose.value;
 if(key.size!==5||key.get(1)!==2||key.get(3)!==-7||key.get(-1)!==1)throw Error('Invalid App Attest COSE algorithm');
 const x=key.get(-2),y=key.get(-3);if(!Buffer.isBuffer(x)||!Buffer.isBuffer(y)||x.length!==32||y.length!==32||!timingSafeEqual(Buffer.concat([Buffer.from([4]),x,y]),point))throw Error('App Attest COSE key mismatch');
 const extensions=decodeAttestCBOR(data.subarray(87+cose.bytesRead));if(!(extensions instanceof Map))throw Error('Missing App Attest attestation extensions');
 const categoryBytes=extensions.get('apple_validation_category_01'),version=extensions.get('apple_bundle_version_01');
 // Apple guide's actual CBOR fixture stores UInt32 as a four-byte little-endian
 // byte string. Do not accept arbitrary lengths, strings or scalar coercion.
 if(!Buffer.isBuffer(categoryBytes)||categoryBytes.length!==4)throw Error('Invalid App Attest category encoding');
 const category=categoryBytes.readUInt32LE();
 if(!policy||!Array.isArray(policy.validationCategories)||!policy.validationCategories.length||policy.validationCategories.some(value=>!Number.isInteger(value)||![2,3,4].includes(value)||(scope.attestEnvironment==='development'?value!==3:value===3))||!Array.isArray(policy.bundleVersions)||!policy.bundleVersions.length||policy.bundleVersions.length>64||policy.bundleVersions.some(value=>typeof value!=='string'||!/^[0-9]+(?:\.[0-9]+){0,2}$/.test(value)||value.length>64)||!policy.validationCategories.includes(category)||typeof version!=='string'||!policy.bundleVersions.includes(version))throw Error('Unapproved App Attest attestation build');
 return Object.freeze({appID:scope.appID,keyID:scope.keyID,attestEnvironment:scope.attestEnvironment,initialCounter:0,validationCategory:category,bundleVersion:version});
}
