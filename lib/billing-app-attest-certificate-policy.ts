import {X509Certificate} from 'node:crypto';
import {decodeReceiptBER,type ReceiptASN} from './billing-app-attest-ber';
type Role='root'|'attestationIssuer'|'receiptIssuer'|'credential'|'receiptSigner';
const children=(node:ReceiptASN|undefined,tag:number)=>{if(!node||node.tag!==tag||!node.children)throw Error('Invalid certificate policy DER');return node.children;};
function integer(node:ReceiptASN){const v=node.value;if(node.tag!==2||v.length<1||v.length>4||(v[0]&128)||(v.length>1&&v[0]===0&&!(v[1]&128)))throw Error('Invalid certificate path limit');return v.readUIntBE(0,v.length);}
function requireDER(node:ReceiptASN){if(node.indefinite)throw Error('Indefinite certificate policy DER');for(const child of node.children||[])requireDER(child);}
/** Constrained supported certificate profiles, checked against Apple public
 * fixtures. This supplements, never replaces, pinned-root signature/time checks.
 * Unknown critical extensions or profile changes fail closed pending review.
 * No network revocation fetch or arbitrary purpose fallback is enabled.
 */
export function assertAppAttestCertificatePolicy(cert:X509Certificate,role:Role){
 if(!(cert instanceof X509Certificate)||cert.raw.length>8192||!['root','attestationIssuer','receiptIssuer','credential','receiptSigner'].includes(role))throw Error('Invalid certificate policy scope');
 const root=decodeReceiptBER(cert.raw);requireDER(root);const certificate=children(root,0x30);if(certificate.length!==3)throw Error('Invalid certificate policy structure');
 const tbs=children(certificate[0],0x30),wrappers=tbs.filter(n=>n.tag===0xa3);if(wrappers.length!==1)throw Error('Missing certificate policy extensions');
 const wrapped=children(wrappers[0],0xa3);if(wrapped.length!==1)throw Error('Invalid certificate extensions wrapper');
 const extensions=new Map<string,{critical:boolean;value:Buffer}>();
 for(const extension of children(wrapped[0],0x30)){
  const list=children(extension,0x30);if(list.length<2||list.length>3||list[0].tag!==6||list[0].value.length===0||list.at(-1)?.tag!==4)throw Error('Invalid certificate extension');
  const critical=list.length===3;if(critical&&(list[1].tag!==1||!list[1].value.equals(Buffer.from([255]))))throw Error('Invalid certificate critical flag');
  const oid=list[0].value.toString('hex');if(extensions.has(oid))throw Error('Duplicate certificate extension');
  if(critical&&!['551d13','551d0f','551d25'].includes(oid))throw Error('Unsupported critical certificate extension');
  extensions.set(oid,{critical,value:list.at(-1)!.value});
 }
 const constraints=extensions.get('551d13'),usage=extensions.get('551d0f');if(!constraints?.critical||!usage?.critical)throw Error('Missing critical certificate constraints');
 const basic=decodeReceiptBER(constraints.value);requireDER(basic);const limits=children(basic,0x30);let isCA=false,pathLimit:number|undefined;
 if(limits.length){if(limits[0].tag!==1||!limits[0].value.equals(Buffer.from([255]))||limits.length>2)throw Error('Invalid certificate CA constraint');isCA=true;if(limits.length===2)pathLimit=integer(limits[1]);}
 const caRole=['root','attestationIssuer','receiptIssuer'].includes(role);if(isCA!==caRole||cert.ca!==caRole||(!caRole&&pathLimit!==undefined)||(pathLimit!==undefined&&pathLimit<(role==='root'?1:0)))throw Error('Certificate CA/path policy mismatch');
 const bits=decodeReceiptBER(usage.value);requireDER(bits);if(bits.tag!==3||bits.value.length<2||bits.value.length>3||bits.value[0]>7||bits.value.at(-1)!&((1<<bits.value[0])-1))throw Error('Invalid certificate key usage');
 const last=bits.value.at(-1)!;let trailingZeroBits=0;while(trailingZeroBits<8&&!(last&(1<<trailingZeroBits)))trailingZeroBits++;
 if(trailingZeroBits===8||trailingZeroBits!==bits.value[0]||(bits.value.length===3&&bits.value[2]!==128)||((bits.value[1]&1||bits.value.length===3)&&!(bits.value[1]&8)))throw Error('Noncanonical or unsupported certificate key usage');
 const first=bits.value[1];if(caRole?!(first&4):(!(first&128)||!!(first&6)))throw Error('Certificate key usage policy mismatch');
 const eku=extensions.get('551d25');
 if(role==='credential'){
  // The independently verified older Apple fixture has no EKU. The signed
  // App Attest nonce marker remains mandatory in both observed profiles; when
  // EKU exists, its restriction must be exactly the current App Attest purpose.
  if(!extensions.has('2a864886f763640802'))throw Error('Missing App Attest credential purpose');
  if(eku){const purposes=children(decodeReceiptBER(eku.value),0x30);if(purposes.length!==1||purposes[0].tag!==6||purposes[0].value.toString('hex')!=='2a864886f763640418')throw Error('Invalid App Attest credential purpose');}
 }else if(eku)throw Error('Unsupported certificate EKU restriction');
 const names=cert.subject.split('\n').filter(line=>line.startsWith('CN='));
 if(role==='attestationIssuer'&&(names.length!==1||names[0]!=='CN=Apple App Attestation CA 1'))throw Error('Unexpected App Attest issuer profile');
 if(role==='receiptIssuer'&&(names.length!==1||names[0]!=='CN=Apple Application Integration CA 5 - G1'))throw Error('Unexpected receipt issuer profile');
 if(role==='receiptSigner'){
  const marker=extensions.get('2a864886f763640c0f');
  if(names.length!==1||names[0]!=='CN=Application Attestation Fraud Receipt Signing'||!marker)throw Error('Invalid App Attest receipt signer purpose');
  const value=decodeReceiptBER(marker.value);if(value.tag!==5||value.value.length!==0)throw Error('Invalid receipt purpose marker');
 }
}
