import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ouchiAuthRecreationKey,OUCHI_AUTH_INSERT_GUARD_BODY,OUCHI_AUTH_INSERT_GUARD_SHA256} from '../lib/ouchi-auth-recreation-key.mjs';
import {createOuchiAuthRecreationExclusion} from '../lib/ouchi-auth-recreation-exclusion.mjs';

test('domain-separated signed 64-bit key vectors agree with independent fixed values',()=>{
 assert.equal(ouchiAuthRecreationKey('11111111-1111-4111-8111-111111111111'),8914760143420209524n);
 assert.equal(ouchiAuthRecreationKey('ffffffff-ffff-ffff-ffff-ffffffffffff'),-6470661261530475848n);
 assert.equal(ouchiAuthRecreationKey('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),-4735007091595336082n);
 for(const id of ['','not-a-uuid','00000000-0000-0000-0000-000000000000'])assert.throws(()=>ouchiAuthRecreationKey(id));
});
test('reviewed SQL body and fixed metadata hash cannot drift independently',()=>{
 const sql=readFileSync('tests/fixtures/auth-recreation-session-guard.sql','utf8');
 assert.equal(sql.split('$ouchi_auth_guard$')[1],OUCHI_AUTH_INSERT_GUARD_BODY);
 assert.equal(OUCHI_AUTH_INSERT_GUARD_SHA256,'89c929a2630f298f4d9cc30c2060ec5e622242ace7d658333e85c929faabecf5');
});
const direct={kind:'supabase-direct',projectRef:'hphifiqyypwyxkzfanod',password:'synthetic-unused-password',ca:'-----BEGIN CERTIFICATE-----\nsynthetic-unused\n-----END CERTIFICATE-----'};
test('pool endpoints, ambient targets, unsafe overrides and missing remaining-path coverage are refused before connect',()=>{
 for(const target of [undefined,{kind:'pool',host:'pooler.supabase.com'}, {...direct,port:6543},{...direct,ssl:false},{...direct,host:'pooler.supabase.com'}, {...direct,password:''}])assert.throws(()=>createOuchiAuthRecreationExclusion({target,verifyRemainingPaths:async()=>true}),/direct-session/);
 assert.throws(()=>createOuchiAuthRecreationExclusion({target:direct}),/coverage/);
 assert.throws(()=>createOuchiAuthRecreationExclusion({target:direct,verifyRemainingPaths:async()=>false,maxHoldMs:120001}),/bounded/);
 const provider=createOuchiAuthRecreationExclusion({target:direct,verifyRemainingPaths:async()=>false});assert.deepEqual(Object.keys(provider),['withScope']);
});
