import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import ts from 'typescript';
const load=name=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {createRegistrationChallenge:create,registrationClientData:bytes,registrationClientDataHash:hash}=await load('billing-app-attest-registration-challenge');
const {createRestoreChallenge:createRestore,restoreAssertionClientData:restoreBytes}=await load('billing-restore-client-data');
const now=1791727200000,scope={userID:'11111111-1111-4111-8111-111111111111',sessionID:'22222222-2222-4222-8222-222222222222',epochID:'33333333-3333-4333-8333-333333333333',requestID:'44444444-4444-4444-8444-444444444444',keyID:Buffer.alloc(32,1).toString('base64'),appID:'SYNTHETIC1.dev.synthetic.ouchi',attestEnvironment:'production'};
test('registration challenge signs exact stored identities, app, key and environment with stable order and SHA256',()=>{
 const c=create(scope,now),data=bytes(c,now),digest=hash(c,now);assert.ok(Object.isFrozen(c));assert.ok(data.length<2048);assert.equal(c.expiresAt,now+300000);assert.equal(Buffer.from(c.nonce,'base64url').length,32);assert.equal(digest.length,32);assert.deepEqual(digest,createHash('sha256').update(data).digest());
 assert.deepEqual(JSON.parse(data),{version:1,purpose:'register_ouchi_attested_key',nonce:c.nonce,issuedAt:now,expiresAt:now+300000,...scope});assert.deepEqual(bytes(Object.fromEntries(Object.entries(c).reverse()),now),data);assert.notEqual(create(scope,now).nonce,c.nonce);
 const changes={userID:scope.requestID,sessionID:scope.requestID,epochID:scope.requestID,requestID:scope.sessionID,keyID:Buffer.alloc(32,2).toString('base64'),appID:'SYNTHETIC2.dev.synthetic.other',attestEnvironment:'development',nonce:Buffer.alloc(32,3).toString('base64url'),issuedAt:now-1,expiresAt:now+299999};
 for(const [key,value] of Object.entries(changes)){const changed={...c,[key]:value};if(key==='issuedAt')changed.expiresAt-=1;if(key==='expiresAt')changed.issuedAt-=1;assert.notDeepEqual(hash(changed,now),digest,key+' must be bound');}
 assert.ok(!Object.hasOwn(c,'authorized'));assert.ok(!Object.hasOwn(c,'purchaseEnvironment'));
});
test('registration rejects restore challenges, malformed identities, added fields, invalid nonce and time boundaries',()=>{
 const c=create(scope,now),restore=createRestore({...scope,purchaseEnvironment:'Sandbox',proofSHA256:'a'.repeat(64)},now);
 assert.throws(()=>bytes(restore,now));assert.throws(()=>restoreBytes(c,now));assert.throws(()=>bytes({...restore,purpose:c.purpose},now));
 for(const changed of [{userID:'invalid'},{epochID:scope.userID},{requestID:'00000000-0000-0000-0000-000000000000'},{keyID:'B'.repeat(43)+'='},{appID:'dev.synthetic.ouchi'},{attestEnvironment:'Sandbox'},{purchaseEnvironment:'Sandbox'},{proofSHA256:'a'.repeat(64)},{authorized:true}])assert.throws(()=>create({...scope,...changed},now));
 for(const changed of [{version:2},{purpose:'restore_ouchi_subscription'},{nonce:'x'},{nonce:c.nonce+'='},{nonce:c.nonce.slice(0,-1)+'B'},{expiresAt:c.expiresAt+1},{issuedAt:now+1},{unexpected:true}])assert.throws(()=>bytes({...c,...changed},now));
 for(const time of [0,NaN,Infinity,now-1,c.expiresAt,c.expiresAt+1])assert.throws(()=>hash(c,time));assert.doesNotThrow(()=>hash(c,c.expiresAt-1));for(const time of [0,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>create(scope,time));
});
