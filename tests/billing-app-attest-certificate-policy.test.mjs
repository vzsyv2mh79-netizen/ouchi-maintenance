import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {X509Certificate} from 'node:crypto';import ts from 'typescript';
function loadModule(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(loadModule(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const {assertAppAttestCertificatePolicy:check}=await import(loadModule('billing-app-attest-certificate-policy'));
const {decodeAttestCBOR:decode}=await import(loadModule('billing-app-attest-cbor'));
const {decodeReceiptBER:ber}=await import(loadModule('billing-app-attest-ber'));
const official=JSON.parse(readFileSync('tests/fixtures/app-attest/apple-public-example.json','utf8')),old=JSON.parse(readFileSync('tests/fixtures/app-attest/independent-public-example.json','utf8')),current=decode(Buffer.from(official.attestationBase64,'base64')),historical=decode(Buffer.from(old.attestationBase64,'base64'));
const root=new X509Certificate(official.rootPEM),credential=new X509Certificate(current.get('attStmt').get('x5c')[0]),issuer=new X509Certificate(current.get('attStmt').get('x5c')[1]);
const receipt=current.get('attStmt').get('receipt'),signed=ber(receipt).children[1].children[0].children,receiptCertificates=signed[3].children.map(value=>new X509Certificate(value.raw)),receiptSigner=receiptCertificates.find(cert=>!cert.ca),receiptIssuer=receiptCertificates.find(cert=>cert.ca&&cert.subject.includes('Integration'));
test('observed Apple credential, issuer, signer and pinned-root profiles meet critical constraints and correct purpose',()=>{
 for(const [cert,role] of [[root,'root'],[credential,'credential'],[issuer,'attestationIssuer'],[receiptSigner,'receiptSigner'],[receiptIssuer,'receiptIssuer'],[new X509Certificate(readFileSync('tests/fixtures/app-attest/apple-root-g3.pem')),'root'],[new X509Certificate(historical.get('attStmt').get('x5c')[0]),'credential']])assert.doesNotThrow(()=>check(cert,role));
 for(const [cert,role] of [[credential,'root'],[root,'credential'],[credential,'receiptSigner'],[receiptSigner,'credential'],[issuer,'receiptIssuer'],[receiptIssuer,'attestationIssuer']])assert.throws(()=>check(cert,role));
});
function change(cert,find,replace){const bytes=Buffer.from(cert.raw),needle=Buffer.from(find,'hex'),position=bytes.indexOf(needle);assert.ok(position>=0,'public fixture contains selected extension');assert.equal(needle.length,Buffer.from(replace,'hex').length);Buffer.from(replace,'hex').copy(bytes,position);return new X509Certificate(bytes);}
test('unsigned policy-stage mutations cannot introduce unknown critical constraints or substitute receipt/credential purposes',()=>{
 // These copied public certificates have INVALID signatures after mutation;
 // they only exercise policy failure and never claim Apple authentication.
 assert.throws(()=>check(change(credential,'0603551d0f0101ff','0603551d100101ff'),'credential'),/Unsupported critical/);
 assert.throws(()=>check(change(credential,'0603551d0f0101ff','0603551d0f010100'),'credential'),/critical flag/);
 assert.throws(()=>check(change(credential,'2a864886f763640418','2a864886f763640419'),'credential'),/purpose/);
 assert.throws(()=>check(change(credential,'2a864886f763640802','2a864886f763640803'),'credential'),/purpose/);
 assert.throws(()=>check(change(receiptSigner,'2a864886f763640c0f','2a864886f763640c10'),'receiptSigner'),/purpose/);
 assert.throws(()=>check(change(receiptSigner,'03020780','03020700'),'receiptSigner'),/key usage/);
 assert.throws(()=>check(change(issuer,'30060101ff020100','30060101ff020180'),'attestationIssuer'),/path limit/);
});
