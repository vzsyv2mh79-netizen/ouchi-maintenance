import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {X509Certificate,createHash} from 'node:crypto';import ts from 'typescript';
function loadModule(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(loadModule(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const {verifyAppAttestAuthenticator:check}=await import(loadModule('billing-app-attest-authenticator'));
const {decodeAttestCBOR:decode,decodeAttestCOSEPrefix:prefix}=await import(loadModule('billing-app-attest-cbor'));
const {verifyAppAttestPrerequisites:prerequisites}=await import(loadModule('billing-app-attest-prerequisites'));
const fixture=JSON.parse(readFileSync('tests/fixtures/app-attest/apple-public-example.json','utf8')),object=decode(Buffer.from(fixture.attestationBase64,'base64')),data=object.get('authData'),cert=new X509Certificate(object.get('attStmt').get('x5c')[0]),jwk=cert.publicKey.export({format:'jwk'}),point=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
const scope={appID:fixture.exampleAppID,keyID:createHash('sha256').update(point).digest('base64'),attestEnvironment:'production',publicKeyX962:point},policy={validationCategories:[4],bundleVersions:['1']};
// Authenticator stage fixtures only. Mutating bytes here invalidates the real
// certificate nonce, and must NEVER constitute a fully verified attestation.
const synthetic=()=>{const value=Buffer.from(data);value.writeUInt32LE(4,value.length-4);return value;};
test('authenticator prerequisite binds RP, key, COSE, environment, initial counter and explicit build policy',()=>{
 const value=synthetic(),result=check(value,scope,policy);assert.ok(Object.isFrozen(result));assert.equal(result.keyID,scope.keyID);assert.equal(result.initialCounter,0);assert.equal(result.validationCategory,4);assert.equal(result.bundleVersion,'1');assert.ok(!Object.hasOwn(result,'authorized'));
 const cose=prefix(value.subarray(87));assert.equal(cose.bytesRead,77);assert.equal(cose.value.get(3),-7);assert.deepEqual(cose.value.get(-2),point.subarray(1,33));
 assert.throws(()=>check(data,scope,policy),/Unapproved/,'official sample is OS category1, not an approved customer app');
 const dev=synthetic();Buffer.from('appattestdevelop').copy(dev,37);dev.writeUInt32LE(3,dev.length-4);assert.equal(check(dev,{...scope,attestEnvironment:'development'},{validationCategories:[3],bundleVersions:['1']}).validationCategory,3);
});
test('modified identity, key/COSE, environment, flags, counter and credential lengths are refused',()=>{
 for(const changed of [{appID:'1234567890.com.other'},{keyID:Buffer.alloc(32,1).toString('base64')},{attestEnvironment:'development'},{attestEnvironment:'Sandbox'},{publicKeyX962:Buffer.alloc(65)},{appID:'invalid'}])assert.throws(()=>check(synthetic(),{...scope,...changed},policy));
 for(const offset of [0,37,55,120,160]){const changed=synthetic();changed[offset]^=1;assert.throws(()=>check(changed,scope,policy));}
 for(const flags of [0,0x42,0x60,0x50]){const changed=synthetic();changed[32]=flags;assert.throws(()=>check(changed,scope,policy));}
 const counter=synthetic();counter.writeUInt32BE(1,33);assert.throws(()=>check(counter,scope,policy),/counter/);
 for(const length of [0,31,33,65535]){const changed=synthetic();changed.writeUInt16BE(length,53);assert.throws(()=>check(changed,scope,policy),/credential/);}
 assert.throws(()=>check(Buffer.concat([synthetic(),Buffer.from([0])]),scope,policy),/Trailing/);
 for(const bytes of [Buffer.alloc(163),Buffer.alloc(4097)])assert.throws(()=>check(bytes,scope,policy));
});
test('exact UInt32 encoding and explicit category/version allowlists fail closed',()=>{
 for(const p of [{validationCategories:[1],bundleVersions:['1']},{validationCategories:[3],bundleVersions:['1']},{validationCategories:[4],bundleVersions:['2']},{validationCategories:[],bundleVersions:['1']},{validationCategories:[4],bundleVersions:['*']}])assert.throws(()=>check(synthetic(),scope,p));
 const bad=synthetic();bad.writeUInt32BE(4,bad.length-4);assert.throws(()=>check(bad,scope,policy),/Unapproved/);
 const short=synthetic().subarray(0,synthetic().length-1);assert.throws(()=>check(short,scope,policy));
 assert.throws(()=>prefix(Buffer.from([0xa2,1,2,1,3])),/map/);
 assert.throws(()=>prefix(Buffer.from([0xa1,0x61,0x61,0])),/COSE/);
 assert.throws(()=>decode(Buffer.from([0xa1,1,2])),/map/,'integer keys must not leak into string-key assertion decoder');
 assert.throws(()=>decode(Buffer.from([0x20])),/Unsupported/);
});
test('composed prerequisites do not accept authenticator-only mutation or the inconsistent official nonce fixture',()=>{
 const challengeHash=createHash('sha256').update(fixture.exampleChallenge).digest(),now=Date.parse(fixture.historicalVerificationTime);
 assert.throws(()=>prerequisites(Buffer.from(fixture.attestationBase64,'base64'),scope,challengeHash,policy,fixture.rootPEM,now),/nonce mismatch/);
 const bytes=Buffer.from(fixture.attestationBase64,'base64'),position=bytes.indexOf(data);assert.ok(position>0);synthetic().copy(bytes,position);
 // Independent authenticator-stage success does not carry through the nonce
 // validation: this changed category was not authenticated by Apple.
 assert.throws(()=>prerequisites(bytes,scope,challengeHash,policy,fixture.rootPEM,now),/nonce mismatch/);
 assert.throws(()=>prerequisites(Buffer.from([0xa0]),scope,challengeHash,policy,fixture.rootPEM,now),/object/);
});
