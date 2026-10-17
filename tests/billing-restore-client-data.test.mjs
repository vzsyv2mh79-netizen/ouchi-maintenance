import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/billing-restore-client-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createRestoreChallenge:create,restoreAssertionClientData:bytes,restorePairDigest:digest}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const now=1791727200000;
const scope={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',requestID:'44444444-4444-4444-8444-444444444444',keyID:Buffer.alloc(32,1).toString('base64'),appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'production',purchaseEnvironment:'Sandbox',proofSHA256:digest('synthetic-app-jws','synthetic-purchase-jws')};

test('server challenges produce stable bounded client data and bind every restore scope',()=>{
 const challenge=create(scope,now);assert.ok(Object.isFrozen(challenge));assert.equal(challenge.expiresAt-now,300000);
 assert.equal(Buffer.from(challenge.nonce,'base64url').length,32);
 assert.ok(!Object.hasOwn(challenge,'authorized'));assert.ok(!Object.hasOwn(challenge,'newAccountToken'));
 const data=bytes(challenge,now);assert.ok(data.length<2048);
 assert.deepEqual(JSON.parse(data),{version:1,purpose:'restore_ouchi_subscription',nonce:challenge.nonce,issuedAt:now,expiresAt:now+300000,...scope});
 // Object key ordering at the transport boundary must not change signed bytes.
 assert.deepEqual(bytes(Object.fromEntries(Object.entries(challenge).reverse()),now),data);
 const initial=createHash('sha256').update(data).digest('hex');
 const changes={userID:scope.requestID,sessionID:scope.requestID,epochID:scope.requestID,requestID:scope.sessionID,keyID:Buffer.alloc(32,2).toString('base64'),appID:'SYNTHETIC2.dev.synthetic.other',attestEnvironment:'development',purchaseEnvironment:'Production',proofSHA256:digest('different-app','different-purchase'),nonce:Buffer.alloc(32,3).toString('base64url')};
 for(const [key,value] of Object.entries(changes))assert.notEqual(createHash('sha256').update(bytes({...challenge,[key]:value},now)).digest('hex'),initial,key+' must be signed');
 assert.notEqual(create(scope,now).nonce,challenge.nonce);
});

test('invalid scope, malformed nonce, expiry extension and unknown fields are refused',()=>{
 const challenge=create(scope,now);
 for(const changed of [{userID:'invalid'},{epochID:scope.userID},{requestID:'00000000-0000-0000-0000-000000000000'},{keyID:'unverified-client-label'},{keyID:'B'.repeat(43)+'='},{appID:'dev.synthetic.ouchi'},{attestEnvironment:'Sandbox'},{purchaseEnvironment:'development'},{proofSHA256:'a'.repeat(63)},{unexpected:true}])assert.throws(()=>create({...scope,...changed},now));
 for(const changed of [{nonce:'x'},{nonce:challenge.nonce+'='},{expiresAt:challenge.expiresAt+1},{issuedAt:now+1},{version:2},{purpose:'purchase'},{unexpected:true}])assert.throws(()=>bytes({...challenge,...changed},now));
 for(const time of [0,NaN,now-1,challenge.expiresAt,challenge.expiresAt+1])assert.throws(()=>bytes(challenge,time));
 assert.doesNotThrow(()=>bytes(challenge,challenge.expiresAt-1));
 for(const time of [0,NaN,Number.MAX_SAFE_INTEGER])assert.throws(()=>create(scope,time));
});

test('pair digest separates app/purchase boundaries and changes on either signed input',()=>{
 assert.match(digest('ab','c'),/^[0-9a-f]{64}$/);
 assert.notEqual(digest('ab','c'),digest('a','bc'));
 assert.notEqual(digest('app','tx'),digest('app2','tx'));
 assert.notEqual(digest('app','tx'),digest('app','tx2'));
 for(const value of ['',null,'x'.repeat(131073)])assert.throws(()=>digest(value,'tx'));
 assert.throws(()=>digest('app','x'.repeat(131073)));
});
