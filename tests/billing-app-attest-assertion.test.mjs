import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import ts from 'typescript';
function module(name){let code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;code=code.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,p)=>'from '+JSON.stringify(module(p)));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const {verifyRestoreAppAttestAssertion:check}=await import(module('billing-app-attest-assertion'));
const {createRestoreChallenge:create,restoreAssertionClientData:bytes}=await import(module('billing-restore-client-data'));
const {decodeAttestCBOR:decode}=await import(module('billing-app-attest-cbor'));
const sha=value=>createHash('sha256').update(value).digest();
function size(major,n){if(n<24)return Buffer.from([major*32+n]);if(n<256)return Buffer.from([major*32+24,n]);if(n<65536){const b=Buffer.alloc(3);b[0]=major*32+25;b.writeUInt16BE(n,1);return b;}const b=Buffer.alloc(5);b[0]=major*32+26;b.writeUInt32BE(n,1);return b;}
function cbor(v){if(typeof v==='number')return size(0,v);if(Buffer.isBuffer(v))return Buffer.concat([size(2,v.length),v]);if(typeof v==='string'){const b=Buffer.from(v);return Buffer.concat([size(3,b.length),b]);}if(Array.isArray(v))return Buffer.concat([size(4,v.length),...v.map(cbor)]);return Buffer.concat([size(5,Object.keys(v).length),...Object.entries(v).flatMap(([k,value])=>[cbor(k),cbor(value)])]);}
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
const point=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
const now=1791727200000,scope={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',requestID:'44444444-4444-4444-8444-444444444444',keyID:sha(point).toString('base64'),appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'production',purchaseEnvironment:'Sandbox',proofSHA256:'a'.repeat(64)};
const challenge=create(scope,now),stored={userID:scope.userID,epochID:scope.epochID,keyID:scope.keyID,appID:scope.appID,attestEnvironment:scope.attestEnvironment,publicKeyX962:point,counter:0},policy={validationCategories:[2],bundleVersions:['1.0']};
function assertion({counter=1,flags=0x80,extensions={validationCategory:2,bundleVersion:'1.0'},rp=sha(scope.appID),clientData=bytes(challenge,now),key=privateKey,preimage=false}={}){const prefix=Buffer.alloc(37);rp.copy(prefix);prefix[32]=flags;prefix.writeUInt32BE(counter,33);const data=Buffer.concat([prefix,Buffer.isBuffer(extensions)?extensions:cbor(extensions)]),combined=Buffer.concat([data,sha(clientData)]);return cbor({signature:sign('sha256',preimage?combined:sha(combined),key),authenticatorData:data});}

test('synthetic P-256 assertion binds stored key, exact clientData, app and approved build; does not consume or grant rights',()=>{
 const proof=assertion(),result=check(proof,stored,challenge,policy,now);
 assert.ok(Object.isFrozen(result));assert.equal(result.previousCounter,0);assert.equal(result.counter,1);assert.equal(result.assertionSHA256,sha(proof).toString('hex'));assert.equal(result.clientDataSHA256,sha(bytes(challenge,now)).toString('hex'));
 assert.equal(stored.counter,0);assert.ok(!Object.hasOwn(result,'authorized'));
 // Crypto verification is intentionally pure. Only an atomic persistent CAS
 // can consume this counter; a second check alone is not replay protection.
 assert.deepEqual(check(proof,stored,challenge,policy,now),result);
 assert.throws(()=>check(proof,{...stored,counter:1},challenge,policy,now),/counter replay/);
 assert.equal(check(assertion({counter:0xffffffff}),stored,challenge,policy,now).counter,0xffffffff);
});
test('wrong account/key/environment, modified scope and signatures fail before authorization',()=>{
 const proof=assertion();
 for(const changed of [{userID:scope.requestID},{epochID:scope.requestID},{keyID:Buffer.alloc(32,2).toString('base64')},{appID:'SYNTHETIC2.dev.other'},{attestEnvironment:'development'},{publicKeyX962:Buffer.alloc(65)},{counter:-1},{counter:1.5},{counter:0x100000000}])assert.throws(()=>check(proof,{...stored,...changed},challenge,policy,now));
 for(const changed of [{sessionID:scope.requestID},{requestID:scope.sessionID},{proofSHA256:'b'.repeat(64)},{purchaseEnvironment:'Production'},{nonce:Buffer.alloc(32,9).toString('base64url')}])assert.throws(()=>check(proof,stored,{...challenge,...changed},policy,now));
 assert.throws(()=>check(proof,stored,challenge,policy,challenge.expiresAt));
 assert.throws(()=>check(assertion({rp:Buffer.alloc(32)}),stored,challenge,policy,now),/RP mismatch/);
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 assert.throws(()=>check(assertion({key:other.privateKey}),stored,challenge,policy,now),/signature/);
 assert.throws(()=>check(assertion({preimage:true}),stored,challenge,policy,now),/signature/);
 const changed=Buffer.from(proof);changed[changed.length-1]^=1;assert.throws(()=>check(changed,stored,challenge,policy,now));
});
test('missing/unapproved extensions and malformed flags/counters are refused even with valid synthetic signatures',()=>{
 for(const extensions of [{},{validationCategory:4,bundleVersion:'1.0'},{validationCategory:2,bundleVersion:'2.0'},{validationCategory:'2',bundleVersion:'1.0'},{apple_validation_category_01:2,apple_bundle_version_01:'1.0'},[]])assert.throws(()=>check(assertion({extensions}),stored,challenge,policy,now));
 for(const flags of [0,0x40,0xc0,0x82,0xa0,0x90])assert.throws(()=>check(assertion({flags}),stored,challenge,policy,now));
 assert.throws(()=>check(assertion({counter:0}),stored,challenge,policy,now));
 for(const bad of [{validationCategories:[],bundleVersions:['1.0']},{validationCategories:[3],bundleVersions:['1.0']},{validationCategories:[1],bundleVersions:['1.0']},{validationCategories:[2],bundleVersions:[]},{validationCategories:[2],bundleVersions:['*']}])assert.throws(()=>check(assertion(),stored,challenge,bad,now));
 const devChallenge=create({...scope,attestEnvironment:'development'},now),devStored={...stored,attestEnvironment:'development'};
 const devProof=assertion({extensions:{validationCategory:3,bundleVersion:'1.0'},clientData:bytes(devChallenge,now)});
 assert.equal(check(devProof,devStored,devChallenge,{validationCategories:[3],bundleVersions:['1.0']},now).counter,1);
});
test('bounded CBOR rejects duplicate keys, indefinite lengths, invalid UTF8, trailing data and depth bombs',()=>{
 const duplicate=Buffer.concat([Buffer.from([0xa2]),cbor('signature'),cbor(Buffer.from([1])),cbor('signature'),cbor(Buffer.from([2]))]);
 for(const input of [duplicate,Buffer.from([0xbf,0xff]),Buffer.from([0x61,0xff]),Buffer.from([0x18,0x01]),Buffer.from([0x19,0x00,0x18]),Buffer.from([0x1a,0,0,0,24]),Buffer.from([0x5b,0,0,0,0,0,0,0,1,0]),Buffer.from([0xc0,0]),Buffer.from([0xf5]),Buffer.from([0x41]),Buffer.alloc(131073),Buffer.concat([cbor({a:1}),Buffer.from([0])]),Buffer.concat([Buffer.alloc(10,0x81),Buffer.from([0])])])assert.throws(()=>decode(input));
 const bom='\ufeffsignature';assert.equal(decode(cbor(bom)),bom);
 assert.deepEqual(decode(cbor({test:[Buffer.from('bounded'),0xffffffff,'text']})).get('test'),[Buffer.from('bounded'),0xffffffff,'text']);
 assert.throws(()=>check(cbor({signature:Buffer.alloc(8),authenticatorData:Buffer.alloc(37)}),stored,challenge,policy,now));
 assert.throws(()=>check(cbor({signature:Buffer.alloc(8),authenticatorData:Buffer.alloc(38),extra:0}),stored,challenge,policy,now));
});
