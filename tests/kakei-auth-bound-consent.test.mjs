// Reviewed sibling contract copied with only fixture import paths adapted.
// These identities are synthetic; actual Auth verification belongs to CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createAuthBoundHandoffConsentIssuer,createAuthBoundHandoffConsentVerifier,createAuthBoundConsentEvidenceVerifier} from './fixtures/kakei-completion/lib/handoff-consent-auth-state.mjs';
import {createHandoffConsentIssuer} from './fixtures/kakei-completion/lib/handoff-consent.mjs';
async function fixture(){
 const s={protocolVersion:2,kind:'shared-account',requestID:randomUUID(),userID:randomUUID(),leaseToken:randomUUID(),inventoryDigest:'a'.repeat(64),apps:[{app:'kakei',requestID:randomUUID(),scopeID:randomUUID()}]};
 const successor=randomUUID(),p={protocolVersion:2,requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,appRequestID:s.apps[0].requestID,appScopeID:s.apps[0].scopeID,householdID:randomUUID(),successorID:successor,memberIDs:[s.userID,successor],familyRecordIDs:[]};
 const key=randomBytes(32),records=[],at=Date.now()-1000,states=new Map([[s.userID,{userID:s.userID,authVerifiedAt:at,authStateDigest:'b'.repeat(64)}],[successor,{userID:successor,authVerifiedAt:at,authStateDigest:'c'.repeat(64)}]]);
 const store={transaction:fn=>fn({}),target:async(_,request,house,actor)=>request===s.requestID&&house===p.householdID&&states.has(actor)?{scope:s,plan:p}:null,existing:async(_,s,p,actor)=>records.find(r=>r.actorID===actor)??null,record:async(_,s,p,actor,token)=>records.push({actorID:actor,token,revokedAt:null})};
 const identity=async actor=>structuredClone(states.get(actor)),loadRecords=async()=>structuredClone([...records].sort((a,b)=>a.actorID.localeCompare(b.actorID)));
 const issue=createAuthBoundHandoffConsentIssuer({key,verifyIdentity:identity,store});
 const body=actor=>({requestID:s.requestID,householdID:p.householdID,accessToken:actor,confirmation:'家族データの引き継ぎに同意する'});
 for(const actor of states.keys())assert.equal((await issue(body(actor))).status,'accepted');
 const verify=createAuthBoundHandoffConsentVerifier({key,loadRecords,verifyAuthState:async(_,p,actor)=>identity(actor)});
 return {s,p,key,states,records,store,identity,loadRecords,issue,body,verify};
}
test('both current Auth digests and exact re-auth times are required; replay never renews or rebinds',async()=>{
 const f=await fixture();assert.equal(await f.verify(f.s,f.p,{}),true);
 const old=structuredClone(f.records),c=JSON.parse(Buffer.from(old[0].token.split('.')[0],'base64url'));
 assert.equal(c.purpose,'Kakei/shared-family-handoff-auth-state/v2');assert.ok(c.expiresAt<=c.authVerifiedAt+600000);
 assert.equal((await f.issue(f.body(old[0].actorID))).expiresAt,c.expiresAt);assert.deepEqual(f.records,old);
 const state=f.states.get(old[0].actorID);state.authStateDigest='d'.repeat(64);
 assert.equal(await f.verify(f.s,f.p,{}),false);assert.equal((await f.issue(f.body(old[0].actorID))).status,'unconfirmed');assert.deepEqual(f.records,old);
 state.authStateDigest=c.authStateDigest;state.authVerifiedAt++;
 assert.equal(await f.verify(f.s,f.p,{}),false);
});
test('historical v2 evidence verifies original commit facts after later Auth drift without authorizing mutation',async()=>{
 const f=await fixture(),original=await f.loadRecords(),at=Date.now();
 const historical=createAuthBoundConsentEvidenceVerifier({key:f.key});assert.equal(historical(f.s,f.p,original,at),true);
 for(const state of f.states.values())state.authStateDigest='e'.repeat(64);
 f.records[0].revokedAt=new Date().toISOString();assert.equal(await f.verify(f.s,f.p,{}),false);
 assert.equal(historical(f.s,f.p,original,at),true);assert.equal(historical(f.s,f.p,f.records,at),false);
 assert.equal(historical(f.s,f.p,original,at+900000),false);assert.equal(historical({...f.s,inventoryDigest:'f'.repeat(64)},f.p,original,at),false);
});
test('v1 proofs, fake keys, absent state providers and invalid state fields cannot be upgraded into v2 consent',async()=>{
 const f=await fixture(),old=createHandoffConsentIssuer({key:f.key,verifyIdentity:f.identity,store:f.store});f.records.length=0;
 for(const actor of f.states.keys())assert.equal((await old(f.body(actor))).status,'accepted');
 const before=structuredClone(f.records);assert.equal(await f.verify(f.s,f.p,{}),false);assert.equal((await f.issue(f.body(f.s.userID))).status,'unconfirmed');assert.deepEqual(f.records,before);
 assert.throws(()=>createAuthBoundHandoffConsentVerifier({key:f.key,loadRecords:f.loadRecords}),/state ports/);
 assert.equal(createAuthBoundConsentEvidenceVerifier({key:randomBytes(32)})(f.s,f.p,f.records,Date.now()),false);
 f.records.length=0;f.states.get(f.s.userID).authStateDigest='client-metadata';assert.equal((await f.issue(f.body(f.s.userID))).status,'unconfirmed');assert.equal(f.records.length,0);
});
