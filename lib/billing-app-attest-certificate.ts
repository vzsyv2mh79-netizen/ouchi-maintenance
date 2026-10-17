import {createHash,timingSafeEqual,X509Certificate} from 'node:crypto';
import {assertAppAttestCertificatePolicy} from './billing-app-attest-certificate-policy';

// Apple Private PKI: Apple_App_Attestation_Root_CA.pem, checked 2026-10-11.
// Never accept a root supplied by the device, a system trust-store fallback or
// an unpinned downloaded replacement. Rotation requires a reviewed code change.
const rootFingerprint='1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32';
type DERNode={tag:number;body:Buffer};
function der(input:Buffer):DERNode[]{
 const nodes:DERNode[]=[];let offset=0;
 while(offset<input.length){
  if(nodes.length>=128||offset+2>input.length)throw Error('Invalid attestation DER');
  const tag=input[offset++];if((tag&31)===31)throw Error('Unsupported attestation DER tag');
  let length=input[offset++];
  if(length&128){const count=length&127;if(count<1||count>3||offset+count>input.length||input[offset]===0)throw Error('Invalid attestation DER length');length=0;for(let i=0;i<count;i++)length=length*256+input[offset++];if(length<128)throw Error('Noncanonical attestation DER length');}
  if(offset+length>input.length)throw Error('Truncated attestation DER');
  nodes.push({tag,body:input.subarray(offset,offset+length)});offset+=length;
 }
 return nodes;
}
const single=(input:Buffer,tag:number)=>{const nodes=der(input);if(nodes.length!==1||nodes[0].tag!==tag)throw Error('Invalid attestation DER wrapper');return nodes[0].body;};
/** Extract only the nonce extension. Parsing does not verify a certificate. */
export function appAttestCertificateNonce(raw:Buffer):Buffer{
 if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>8192)throw Error('Invalid attestation certificate size');
 const certificate=der(single(raw,0x30));if(certificate.length!==3||certificate[0].tag!==0x30)throw Error('Invalid attestation certificate');
 const extensions=der(certificate[0].body).filter(value=>value.tag===0xa3);if(extensions.length!==1)throw Error('Missing attestation extensions');
 let found:Buffer|undefined;const seen=new Set<string>();
 for(const extension of der(single(extensions[0].body,0x30))){
  if(extension.tag!==0x30)throw Error('Invalid attestation extension');
  const fields=der(extension.body);
  if(fields.length<2||fields.length>3||fields[0].tag!==6||fields.at(-1)?.tag!==4)throw Error('Invalid attestation extension');
  if(fields.length===3&&(fields[1].tag!==1||!fields[1].body.equals(Buffer.from([255]))))throw Error('Invalid critical attestation extension');
  const oid=fields[0].body.toString('hex');if(seen.has(oid))throw Error('Duplicate attestation extension');seen.add(oid);
  // OID 1.2.840.113635.100.8.2: SEQUENCE -> [1] -> OCTET STRING.
  if(oid==='2a864886f763640802'){
   found=single(single(single(fields.at(-1)!.body,0x30),0xa1),4);
   if(found.length!==32)throw Error('Invalid attestation nonce size');
  }
 }
 if(!found)throw Error('Missing attestation nonce');return Buffer.from(found);
}
/** Certificate/nonce prerequisite only. Input x5c and authData must be bounded
 * decoded attestation bytes, and clientDataHash rebuilt from the stored one-time
 * registration challenge. This does NOT validate authenticator App ID/aaguid/
 * credential/COSE/build fields, verify the independent receipt, consume that
 * challenge, register a key or authorize purchase restoration.
 */
export function verifyAppAttestCertificateProof(x5c:readonly Buffer[],authData:Buffer,clientDataHash:Buffer,rootPEM:string,now=Date.now()){
 if(!Array.isArray(x5c)||x5c.length!==2||x5c.some(value=>!Buffer.isBuffer(value)||value.length<1||value.length>8192)||!Buffer.isBuffer(authData)||authData.length<55||authData.length>4096||!Buffer.isBuffer(clientDataHash)||clientDataHash.length!==32||typeof rootPEM!=='string'||rootPEM.length>8192||!Number.isSafeInteger(now)||now<=0)throw Error('Invalid attestation certificate proof');
 const leaf=new X509Certificate(x5c[0]),intermediate=new X509Certificate(x5c[1]),root=new X509Certificate(rootPEM);
 if(!leaf.raw.equals(x5c[0])||!intermediate.raw.equals(x5c[1]))throw Error('Noncanonical App Attest certificate bytes');
 if(root.fingerprint256!==rootFingerprint||!root.ca||!root.checkIssued(root)||!root.verify(root.publicKey))throw Error('Untrusted App Attest root');
 for(const cert of [leaf,intermediate,root]){const start=Date.parse(cert.validFrom),end=Date.parse(cert.validTo);if(!Number.isFinite(start)||!Number.isFinite(end)||now<start||now>end)throw Error('Expired App Attest certificate');}
 if(leaf.ca||!intermediate.ca||!intermediate.checkIssued(root)||!intermediate.verify(root.publicKey)||!leaf.checkIssued(intermediate)||!leaf.verify(intermediate.publicKey))throw Error('Invalid App Attest certificate chain');
 assertAppAttestCertificatePolicy(root,'root');assertAppAttestCertificatePolicy(intermediate,'attestationIssuer');assertAppAttestCertificatePolicy(leaf,'credential');
 if(leaf.publicKey.asymmetricKeyType!=='ec'||leaf.publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Invalid App Attest credential curve');
 const nonce=createHash('sha256').update(authData).update(clientDataHash).digest();
 if(!timingSafeEqual(appAttestCertificateNonce(leaf.raw),nonce))throw Error('App Attest certificate nonce mismatch');
 const key=leaf.publicKey.export({format:'jwk'});
 if(typeof key.x!=='string'||typeof key.y!=='string')throw Error('Invalid App Attest public key');
 const x=Buffer.from(key.x,'base64url'),y=Buffer.from(key.y,'base64url');if(x.length!==32||y.length!==32)throw Error('Invalid App Attest public key');
 const publicKeyX962=Buffer.concat([Buffer.from([4]),x,y]);
 return Object.freeze({publicKeyX962,keyID:createHash('sha256').update(publicKeyX962).digest('base64'),attestationCertificateSHA256:createHash('sha256').update(leaf.raw).digest('hex')});
}
