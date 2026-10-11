import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash,X509Certificate} from 'node:crypto';import ts from 'typescript';
function loadModule(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(loadModule(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const {decodeAttestCBOR:decode}=await import(loadModule('billing-app-attest-cbor'));
const {decodeReceiptBER:ber}=await import(loadModule('billing-app-attest-ber'));
const {verifyAppAttestReceiptSignature:signature,unverifiedAppAttestReceiptPayload:unverified}=await import(loadModule('billing-app-attest-receipt-signature'));
const {verifyInitialAppAttestReceipt:check}=await import(loadModule('billing-app-attest-receipt'));
const root=new X509Certificate(readFileSync('tests/fixtures/app-attest/apple-root-g3.pem')).raw;
const f=JSON.parse(readFileSync('tests/fixtures/app-attest/independent-public-example.json')),attestation=decode(Buffer.from(f.attestationBase64,'base64')),receipt=attestation.get('attStmt').get('receipt'),certificate=attestation.get('attStmt').get('x5c')[0],jwk=new X509Certificate(certificate).publicKey.export({format:'jwk'}),point=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
const scope={appID:'V8H6LQ9448.io.uebelacker.AppAttestExample',attestedCertificateSHA256:createHash('sha256').update(certificate).digest('hex'),publicKeyX962:point,clientDataHash:createHash('sha256').update(Buffer.from(f.challengeBase64,'base64')).digest()},created=Date.parse('2024-02-04T20:27:06.193Z');
test('independent historical receipt authenticates its CMS signature and exact app/key/challenge/freshness binding',()=>{
 const verified=check(receipt,scope,root,created+1000);assert.ok(Object.isFrozen(verified));assert.equal(verified.createdAt,created);assert.equal(verified.expiresAt,Date.parse('2024-05-04T20:27:06.193Z'));assert.equal(verified.keyID,f.keyID);assert.equal(verified.receiptSHA256,createHash('sha256').update(receipt).digest('hex'));assert.ok(!Object.hasOwn(verified,'authorized'));
 assert.doesNotThrow(()=>check(receipt,scope,root,created+300000));
 for(const time of [created-1,created+300001,Date.parse('2026-10-12T00:00:00Z')])assert.throws(()=>check(receipt,scope,root,time),/Stale/);
 const proof=signature(receipt,root,created);assert.deepEqual(proof.authenticatedPayload,unverified(receipt));
 assert.throws(()=>signature(receipt,root,Date.parse('2040-01-01T00:00:00Z')),/Expired/);
});
test('tampered CMS, alternative roots and changed server app/key/hash scope never authenticate a receipt',()=>{
 for(const changed of [{appID:'V8H6LQ9448.io.other.app'},{attestedCertificateSHA256:'a'.repeat(64)},{clientDataHash:Buffer.alloc(32)},{publicKeyX962:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)])},{clientDataHash:Buffer.alloc(31)}])assert.throws(()=>check(receipt,{...scope,...changed},root,created));
 const tampered=Buffer.from(receipt),index=tampered.indexOf(Buffer.from(scope.appID));assert.ok(index>0);tampered[index+1]^=1;assert.throws(()=>check(tampered,scope,root,created),/signature/);
 const broken=Buffer.from(receipt);broken[broken.length-10]^=1;assert.throws(()=>signature(broken,root,created));
 assert.throws(()=>signature(receipt,new X509Certificate(certificate).raw,created),/Untrusted/);
 assert.throws(()=>signature(Buffer.concat([receipt,Buffer.from([0])]),root,created),/Trailing/);
 const oid=Buffer.from('2a8648ce3d040302','hex'),position=receipt.lastIndexOf(oid);assert.ok(position>0);const algorithmChanged=Buffer.from(receipt);algorithmChanged[position+oid.length-1]=3;assert.throws(()=>signature(algorithmChanged,root,created),/algorithm/);
});
test('official CMS signature is valid historically but its 24-byte raw challenge cannot satisfy documented hash binding',()=>{
 const official=JSON.parse(readFileSync('tests/fixtures/app-attest/apple-public-example.json')),object=decode(Buffer.from(official.attestationBase64,'base64')),stmt=object.get('attStmt'),raw=stmt.get('x5c')[0],key=new X509Certificate(raw).publicKey.export({format:'jwk'}),expected={appID:official.exampleAppID,attestedCertificateSHA256:createHash('sha256').update(raw).digest('hex'),publicKeyX962:Buffer.concat([Buffer.from([4]),Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]),clientDataHash:createHash('sha256').update(official.exampleChallenge).digest()},time=Date.parse(official.historicalVerificationTime);
 assert.ok(signature(stmt.get('receipt'),root,time).authenticatedPayload.length>0);
 assert.throws(()=>check(stmt.get('receipt'),expected,root,time),/client hash mismatch/);
});
test('bounded BER accepts constructed indefinite containers and rejects malformed lengths, EOC, depth and trailing bytes',()=>{
 assert.equal(ber(Buffer.from([0x30,0x80,4,1,7,0,0])).children[0].value[0],7);
 for(const value of [Buffer.alloc(65537),Buffer.from([4,0x80,0,0]),Buffer.from([0x30,0x80,4,1,7]),Buffer.from([0x30,0x81,1,0]),Buffer.from([0x30,0x82,0,128]),Buffer.from([0x30,3,4,2,1]),Buffer.from([0x30,2,0,0]),Buffer.from([0x1f,1,1]),Buffer.concat([Buffer.from([4,1,7]),Buffer.from([0])])])assert.throws(()=>ber(value));
 const deep=Buffer.concat([Buffer.from(Array.from({length:22},()=>[0x30,0x80]).flat()),Buffer.from([4,0]),Buffer.alloc(44)]);assert.throws(()=>ber(deep),/limit/);
});
