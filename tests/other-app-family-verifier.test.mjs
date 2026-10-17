import test from 'node:test';
import assert from 'node:assert/strict';
import {createOtherAppFamilyVerifier} from '../lib/other-app-family-verifier.mjs';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const scope={protocolVersion:2,kind:'shared-account',requestID:id(1),userID:id(2),leaseToken:id(3),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:id(4),scopeID:id(5)},{app:'kakei',requestID:id(6),scopeID:id(7)}]};
const signal=()=>new AbortController().signal;
test('every other app needs its own confirmed family verifier and current complete controller coverage',async()=>{
 const calls=[],verify=createOtherAppFamilyVerifier({verifyControllerCoverage:async()=>{calls.push('coverage');return true;},verifiers:{kakei:async()=>{calls.push('kakei');return true;}}});
 assert.equal(await verify({},scope,signal()),true);assert.deepEqual(calls,['coverage','kakei','coverage']);
 assert.equal(await createOtherAppFamilyVerifier({verifyControllerCoverage:async()=>true,verifiers:{}})({},scope,signal()),false);
 assert.equal(await createOtherAppFamilyVerifier({verifyControllerCoverage:async()=>true,verifiers:{kakei:async()=>false}})({},scope,signal()),false);
 const unknown={...scope,apps:[...scope.apps,{app:'sales-navi',requestID:id(8),scopeID:id(9)}]};assert.equal(await verify({},unknown,signal()),false);
});
test('maintenance-only roster still needs independent coverage and no late cancellation can confirm',async()=>{
 const single={...scope,apps:[scope.apps[0]]};
 assert.equal(await createOtherAppFamilyVerifier({verifyControllerCoverage:async()=>false,verifiers:{}})({},single,signal()),false);
 assert.equal(await createOtherAppFamilyVerifier({verifyControllerCoverage:async()=>true,verifiers:{}})({},single,signal()),true);
 const stopped=new AbortController();const verify=createOtherAppFamilyVerifier({verifyControllerCoverage:async()=>true,verifiers:{kakei:async()=>{stopped.abort();return true;}}});assert.equal(await verify({},scope,stopped.signal),false);
});
