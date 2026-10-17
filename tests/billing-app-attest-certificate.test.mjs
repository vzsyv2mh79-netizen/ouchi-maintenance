import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash,X509Certificate} from 'node:crypto';import ts from 'typescript';
function moduleURL(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['\"]\.\/([^'\"]+)['\"]/g,(_,p)=>'from '+JSON.stringify(moduleURL(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const loadModule=name=>import(moduleURL(name));
const {decodeAttestCBOR:decode}=await loadModule('billing-app-attest-cbor');
const {verifyAppAttestCertificateProof:check,appAttestCertificateNonce:extract}=await loadModule('billing-app-attest-certificate');
const fixture=JSON.parse(readFileSync('tests/fixtures/app-attest/apple-public-example.json','utf8')),object=decode(Buffer.from(fixture.attestationBase64,'base64')),statement=object.get('attStmt'),certs=statement.get('x5c'),data=object.get('authData'),now=Date.parse(fixture.historicalVerificationTime),hash=createHash('sha256').update(fixture.exampleChallenge).digest();
test('Apple documentation fixture inconsistently uses raw challenge instead of documented hash; reject rather than weaken verification',()=>{
 const stored=extract(certs[0]);
 assert.notDeepEqual(stored,createHash('sha256').update(data).update(hash).digest());
 assert.deepEqual(stored,createHash('sha256').update(data).update(fixture.exampleChallenge).digest());
 assert.throws(()=>check(certs,data,hash,fixture.rootPEM,now),/nonce mismatch/);
 // It also expired in April; never pretend this is a current device proof.
 assert.throws(()=>check(certs,data,hash,fixture.rootPEM,Date.parse('2026-10-11T00:00:00Z')),/Expired/);
});
test('independent historical public fixture verifies Apple chain and nonce using the documented challenge hash',()=>{
 const f=JSON.parse(readFileSync('tests/fixtures/app-attest/independent-public-example.json','utf8')),o=decode(Buffer.from(f.attestationBase64,'base64')),chain=o.get('attStmt').get('x5c'),authData=o.get('authData'),clientHash=createHash('sha256').update(Buffer.from(f.challengeBase64,'base64')).digest();
 const result=check(chain,authData,clientHash,fixture.rootPEM,Date.parse(f.historicalVerificationTime));
 assert.equal(result.keyID,f.keyID);assert.equal(result.publicKeyX962.length,65);assert.equal(result.publicKeyX962[0],4);assert.equal(createHash('sha256').update(result.publicKeyX962).digest('base64'),result.keyID);
 assert.deepEqual(extract(chain[0]),createHash('sha256').update(authData).update(clientHash).digest());
 assert.ok(Object.isFrozen(result));assert.ok(!Object.hasOwn(result,'authorized'));assert.ok(!Object.hasOwn(result,'receiptVerified'));
 assert.throws(()=>check(chain,authData,clientHash,fixture.rootPEM,Date.parse('2026-10-11T00:00:00Z')),/Expired/);
});
test('untrusted roots, wrong chains, nonce tampering, expiry and trailing certificate bytes are refused',()=>{
 for(const time of [0,NaN,now-10*86400000,now+10*86400000])assert.throws(()=>check(certs,data,hash,fixture.rootPEM,time));
 assert.throws(()=>check(certs,data,Buffer.alloc(32),fixture.rootPEM,now),/nonce mismatch/);
 const changed=Buffer.from(data);changed[0]^=1;assert.throws(()=>check(certs,changed,hash,fixture.rootPEM,now),/nonce mismatch/);
 assert.throws(()=>check(certs,data,hash,new X509Certificate(certs[1]).toString(),now),/Untrusted/);
 assert.throws(()=>check([certs[1],certs[0]],data,hash,fixture.rootPEM,now));
 assert.throws(()=>check([certs[0],new X509Certificate(fixture.rootPEM).raw],data,hash,fixture.rootPEM,now));
 assert.throws(()=>check([Buffer.concat([certs[0],Buffer.from([0])]),certs[1]],data,hash,fixture.rootPEM,now));
 for(const args of [[[],data,hash],[certs,Buffer.alloc(54),hash],[certs,data,Buffer.alloc(31)],[[Buffer.alloc(8193),certs[1]],data,hash]])assert.throws(()=>check(...args,fixture.rootPEM,now));
 const bad=Buffer.from(certs[0]);bad[bad.length-1]^=1;assert.throws(()=>check([bad,certs[1]],data,hash,fixture.rootPEM,now),/chain/);
});
function tlv(tag,value){const length=value.length;if(length>=128)throw Error('test fixture limit');return Buffer.concat([Buffer.from([tag,length]),value]);}
const nonce=Buffer.alloc(32,7),oid=tlv(6,Buffer.from('2a864886f763640802','hex'));
const extension=inner=>tlv(0x30,Buffer.concat([oid,tlv(4,inner)]));
const value=tlv(0x30,tlv(0xa1,tlv(4,nonce)));
const certificate=extensions=>tlv(0x30,Buffer.concat([tlv(0x30,tlv(0xa3,tlv(0x30,extensions))),tlv(0x30,Buffer.alloc(0)),tlv(3,Buffer.from([0]))]));
test('nonce extraction rejects malformed nested DER, duplicate OIDs and noncanonical/truncated sizes',()=>{
 // Structural synthetic DER only; these fixtures are not X509 certificates.
 assert.deepEqual(extract(certificate(extension(value))),nonce);
 for(const input of [certificate(Buffer.alloc(0)),certificate(Buffer.concat([extension(value),extension(value)])),certificate(extension(tlv(0x30,tlv(0xa1,tlv(4,Buffer.alloc(31)))))),certificate(extension(tlv(0x30,tlv(4,nonce)))),Buffer.concat([certificate(extension(value)),Buffer.from([0])]),Buffer.from([0x30,0x80,0,0]),Buffer.from([0x30,0x81,1,0]),Buffer.from([0x30,0x82,0,128]),Buffer.from([0x30,0x10,1]),Buffer.alloc(8193)])assert.throws(()=>extract(input));
});
