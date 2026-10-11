import {verify,X509Certificate,createHash} from 'node:crypto';
import {decodeReceiptBER,type ReceiptASN} from './billing-app-attest-ber';
import {assertAppAttestCertificatePolicy} from './billing-app-attest-certificate-policy';
const rootFingerprint='63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
const oid=(node:ReceiptASN|undefined,hex:string)=>node?.tag===6&&node.value.toString('hex')===hex;
const children=(node:ReceiptASN|undefined,tag:number)=>{if(!node||node.tag!==tag||!node.children)throw Error('Invalid receipt CMS structure');return node.children;};
const integerOne=(node:ReceiptASN|undefined)=>node?.tag===2&&node.value.equals(Buffer.from([1]));
const algorithm=(node:ReceiptASN|undefined,hex:string,allowNull:boolean)=>{const list=children(node,0x30);if(!oid(list[0],hex)||(list.length!==1&&!(allowNull&&list.length===2&&list[1].tag===5&&list[1].value.length===0)))throw Error('Unsupported receipt signature algorithm');};
function octets(node:ReceiptASN):Buffer{
 if(node.tag===4&&!node.children)return Buffer.from(node.value);
 if(node.tag!==0x24||!node.children)throw Error('Invalid receipt CMS content');return Buffer.concat(node.children.map(octets));
}
/** Untrusted content solely for selecting the certificate verification time.
 * Never use these fields for device registration until signature verification.
 */
export function unverifiedAppAttestReceiptPayload(receipt:Buffer){
 const outer=children(decodeReceiptBER(receipt),0x30);if(outer.length!==2||!oid(outer[0],'2a864886f70d010702'))throw Error('Invalid receipt CMS type');
 const wrapper=children(outer[1],0xa0);if(wrapper.length!==1)throw Error('Invalid receipt CMS wrapper');
 const signed=children(wrapper[0],0x30),content=children(signed[2],0x30);
 if(content.length!==2||!oid(content[0],'2a864886f70d010701'))throw Error('Invalid receipt content type');
 const contents=children(content[1],0xa0);if(contents.length!==1)throw Error('Invalid receipt content wrapper');return octets(contents[0]);
}
/** Signature-chain prerequisite for current ECDSA/SHA256, no-signed-attributes
 * App Attest receipts. Other formats fail closed; do not strip attributes or
 * retry a weaker signature mode. This returns authenticated PAYLOAD, not a
 * valid receipt/device: app/key/client-hash/type/freshness/expiry binding and
 * complete certificate-purpose policy remain mandatory before registration.
 * rootDER is server configuration pinned to Apple's public G3, independently
 * of the private App Attestation root used for the attested-key certificate.
 */
export function verifyAppAttestReceiptSignature(receipt:Buffer,rootDER:Buffer,now=Date.now()){
 if(!Buffer.isBuffer(rootDER)||rootDER.length<1||rootDER.length>8192||!Number.isSafeInteger(now)||now<=0)throw Error('Invalid receipt root/time');
 const outer=children(decodeReceiptBER(receipt),0x30);if(outer.length!==2||!oid(outer[0],'2a864886f70d010702'))throw Error('Invalid receipt CMS type');
 const wrapper=children(outer[1],0xa0);if(wrapper.length!==1)throw Error('Invalid receipt CMS wrapper');
 const signed=children(wrapper[0],0x30);if(signed.length!==5||!integerOne(signed[0]))throw Error('Unsupported receipt SignedData');
 const digests=children(signed[1],0x31);if(digests.length!==1)throw Error('Invalid receipt CMS digests');algorithm(digests[0],'608648016503040201',true);
 const content=children(signed[2],0x30);if(content.length!==2||!oid(content[0],'2a864886f70d010701'))throw Error('Invalid receipt content type');
 const contents=children(content[1],0xa0);if(contents.length!==1)throw Error('Invalid receipt content wrapper');const payload=octets(contents[0]);if(!payload.length||payload.length>65536)throw Error('Invalid receipt content size');
 const certificates=children(signed[3],0xa0);if(certificates.length<2||certificates.length>3||certificates.some(c=>c.tag!==0x30||c.raw.length>8192||c.indefinite))throw Error('Invalid receipt certificates');
 const certs=certificates.map(c=>new X509Certificate(c.raw)),root=new X509Certificate(rootDER);
 if(root.fingerprint256!==rootFingerprint||!root.raw.equals(rootDER)||!root.ca||!root.checkIssued(root)||!root.verify(root.publicKey))throw Error('Untrusted receipt root');
 for(let i=0;i<certs.length;i++)if(!certs[i].raw.equals(certificates[i].raw))throw Error('Noncanonical receipt certificate bytes');
 const signers=children(signed[4],0x31);if(signers.length!==1)throw Error('Unsupported receipt signer count');
 const signer=children(signers[0],0x30);if(signer.length!==5||!integerOne(signer[0]))throw Error('Unsupported receipt signer attributes');
 const sid=children(signer[1],0x30);if(sid.length!==2||sid[0].tag!==0x30||sid[1].tag!==2)throw Error('Invalid receipt signer identity');
 algorithm(signer[2],'608648016503040201',true);algorithm(signer[3],'2a8648ce3d040302',false);
 if(signer[4].tag!==4||signer[4].value.length<8||signer[4].value.length>72)throw Error('Invalid receipt signature');
 const candidates=certs.filter(cert=>{const certBody=children(decodeReceiptBER(cert.raw),0x30),tbs=children(certBody[0],0x30),shift=tbs[0].tag===0xa0?1:0;return tbs[shift]?.tag===2&&tbs[shift].value.equals(sid[1].value)&&tbs[shift+2]?.raw.equals(sid[0].raw);});
 if(candidates.length!==1||candidates[0].ca)throw Error('Missing receipt signer certificate');const leaf=candidates[0];
 const intermediateCandidates=certs.filter(cert=>cert!==leaf&&cert.fingerprint256!==rootFingerprint&&cert.ca&&leaf.checkIssued(cert)&&leaf.verify(cert.publicKey));
 if(intermediateCandidates.length!==1)throw Error('Invalid receipt issuer');const intermediate=intermediateCandidates[0];
 if(!intermediate.checkIssued(root)||!intermediate.verify(root.publicKey)||certs.some(cert=>cert!==leaf&&cert!==intermediate&&!cert.raw.equals(root.raw)))throw Error('Invalid receipt certificate chain');
 assertAppAttestCertificatePolicy(root,'root');assertAppAttestCertificatePolicy(intermediate,'receiptIssuer');assertAppAttestCertificatePolicy(leaf,'receiptSigner');
 for(const cert of [leaf,intermediate,root]){const start=Date.parse(cert.validFrom),end=Date.parse(cert.validTo);if(!Number.isFinite(start)||!Number.isFinite(end)||now<start||now>end)throw Error('Expired receipt certificate');}
 if(leaf.publicKey.asymmetricKeyType!=='ec'||leaf.publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1'||!verify('sha256',payload,leaf.publicKey,signer[4].value))throw Error('Invalid receipt CMS signature');
 return Object.freeze({authenticatedPayload:payload,signerCertificate:Buffer.from(leaf.raw),receiptSHA256:createHash('sha256').update(receipt).digest('hex')});
}
