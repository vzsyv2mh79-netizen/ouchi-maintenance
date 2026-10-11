import {createHash,timingSafeEqual,X509Certificate} from 'node:crypto';
import {decodeReceiptBER} from './billing-app-attest-ber';
import {unverifiedAppAttestReceiptPayload,verifyAppAttestReceiptSignature} from './billing-app-attest-receipt-signature';
type Scope={appID:string;attestedCertificateSHA256:string;publicKeyX962:Buffer;clientDataHash:Buffer};
function fields(payload:Buffer){
 const root=decodeReceiptBER(payload);if(root.tag!==0x31||!root.children||root.children.length>64)throw Error('Invalid receipt attributes');
 const result=new Map<number,Buffer>();
 for(const item of root.children){const values=item.children;
  if(item.tag!==0x30||!values||values.length!==3||values[0].tag!==2||values[0].value.length<1||values[0].value.length>4||(values[0].value[0]&128)||(values[0].value.length>1&&values[0].value[0]===0&&!(values[0].value[1]&128))||values[1].tag!==2||!values[1].value.equals(Buffer.from([1]))||values[2].tag!==4)throw Error('Invalid receipt attribute');
  const id=values[0].value.readUIntBE(0,values[0].value.length);if(id<1||result.has(id))throw Error('Duplicate or invalid receipt attribute');result.set(id,Buffer.from(values[2].value));
 }
 return result;
}
function date(value:Buffer|undefined){
 const text=value?.toString('ascii');if(!text||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)||value!.some(byte=>byte>127))throw Error('Invalid receipt time');
 const time=Date.parse(text);if(!Number.isSafeInteger(time)||time<=0||new Date(time).toISOString()!==text)throw Error('Invalid receipt time');return time;
}
/** Independently authenticate an INITIAL ATTEST receipt and bind its key,
 * app and challenge hash. Scope must come from the same verified attestation
 * certificate and stored challenge. This does not replace certificate purpose
 * policy, live Auth/enrollment or atomic registration-challenge consumption.
 * Refreshed RECEIPT types are deliberately a separate future protocol.
 */
export function verifyInitialAppAttestReceipt(receipt:Buffer,scope:Scope,publicRootDER:Buffer,now=Date.now()){
 if(!scope||typeof scope.appID!=='string'||!/^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]{1,200}$/.test(scope.appID)||typeof scope.attestedCertificateSHA256!=='string'||!/^[0-9a-f]{64}$/.test(scope.attestedCertificateSHA256)||!Buffer.isBuffer(scope.publicKeyX962)||scope.publicKeyX962.length!==65||scope.publicKeyX962[0]!==4||!Buffer.isBuffer(scope.clientDataHash)||scope.clientDataHash.length!==32||!Number.isSafeInteger(now)||now<=0)throw Error('Invalid receipt scope');
 // Untrusted creation time only selects certificate-time validation. Freshness
 // alone never authenticates it; the exact payload must still verify below.
 const initial=fields(unverifiedAppAttestReceiptPayload(receipt)),createdAt=date(initial.get(12));
 if(createdAt>now||now-createdAt>300000)throw Error('Stale App Attest receipt');
 const proof=verifyAppAttestReceiptSignature(receipt,publicRootDER,createdAt),verified=fields(proof.authenticatedPayload);
 if(date(verified.get(12))!==createdAt)throw Error('Receipt content mismatch');
 const expiresAt=date(verified.get(21));if(expiresAt<=createdAt||expiresAt<=now)throw Error('Expired App Attest receipt');
 if(!verified.get(2)?.equals(Buffer.from(scope.appID))||!verified.get(6)?.equals(Buffer.from('ATTEST')))throw Error('App Attest receipt app/type mismatch');
 const clientHash=verified.get(4);if(!clientHash||clientHash.length!==32||!timingSafeEqual(clientHash,scope.clientDataHash))throw Error('App Attest receipt client hash mismatch');
 const certificateBytes=verified.get(3);if(!certificateBytes||certificateBytes.length>8192||createHash('sha256').update(certificateBytes).digest('hex')!==scope.attestedCertificateSHA256)throw Error('App Attest receipt credential mismatch');
 const certificate=new X509Certificate(certificateBytes);if(!certificate.raw.equals(certificateBytes)||certificate.publicKey.asymmetricKeyType!=='ec'||certificate.publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Invalid receipt credential');
 const key=certificate.publicKey.export({format:'jwk'});if(typeof key.x!=='string'||typeof key.y!=='string')throw Error('Invalid receipt key');
 const point=Buffer.concat([Buffer.from([4]),Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]);if(point.length!==65||!timingSafeEqual(point,scope.publicKeyX962))throw Error('Receipt public key mismatch');
 return Object.freeze({receiptSHA256:proof.receiptSHA256,createdAt,expiresAt,keyID:createHash('sha256').update(point).digest('base64')});
}
