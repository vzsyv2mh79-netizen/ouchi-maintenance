import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticTOTP} from './fixtures/home-handoff-mfa.mjs';
test('synthetic authenticator matches RFC 6238 SHA1 vectors modulo six digits',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 for(const [seconds,code] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']])assert.equal(syntheticTOTP(secret,seconds),code);
});
