import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountClosureReviewReauthentication,CLOSURE_REAUTHENTICATION_STATE_SQL} from '../lib/account-closure-review-reauthentication.mjs';
const userID='11111111-1111-4111-8111-111111111111',sessionID='22222222-2222-4222-8222-222222222222',epochID='33333333-3333-4333-8333-333333333333',submissionID='44444444-4444-4444-8444-444444444444';
function fixture({authenticate,readAuthState}={}){
 let now=1000,state={userID,email:'synthetic@example.invalid',password:'synthetic-password-hash',bannedUntil:null,deletedAt:null,factors:[]},authCalls=0;
 const identity={userID,sessionID,epochID,email:state.email},scope={userID,sessionID,epochID,submissionID};
 const source=new AbortController(),signal=new AbortController().signal;
 const witness=createAccountClosureReviewReauthentication({identity,clock:()=>now,readAuthState:readAuthState??(async id=>{assert.equal(id,userID);return structuredClone(state);}),authenticate:async(...args)=>{authCalls++;return authenticate?authenticate(...args):userID;}});
 const tx={signal,query:async(sql,args)=>{assert.equal(sql,CLOSURE_REAUTHENTICATION_STATE_SQL);assert.deepEqual(args,[userID]);return {rows:[{reauthentication_state:structuredClone(state)}]};}};
 return {witness,scope,tx,source,issue:()=>witness.reauthenticate(identity.email,'synthetic-password',source.signal),change:patch=>{state={...state,...patch};},time:value=>{now=value;},authCalls:()=>authCalls};
}
test('private current witness binds one identity and submission; only user ID leaves reauthentication',async()=>{
 const f=fixture();assert.equal(await f.witness.verify(f.scope,f.tx),false);assert.equal(await f.issue(),userID);
 assert.equal(await f.witness.verify(f.scope,f.tx),true);assert.equal(await f.witness.verify(f.scope,f.tx),true);
 assert.equal(await f.witness.verify({...f.scope,submissionID:epochID},f.tx),false);
 assert.equal(await f.witness.reauthenticate('synthetic@example.invalid','again',f.source.signal),null);assert.equal(f.authCalls(),1);
 assert.deepEqual(Object.keys(f.witness).sort(),['reauthenticate','verify']);
});
test('credential, email, factor, ban or deletion changes after authentication invalidate pinned proof',async()=>{
 for(const patch of [{password:'new-hash'},{email:'changed@example.invalid'},{factors:[{id:submissionID,status:'verified'}]},{bannedUntil:'2099-01-01'},{deletedAt:'2026-10-14'}]){
  const f=fixture();await f.issue();f.change(patch);let accepted=false;
  try{accepted=await f.witness.verify(f.scope,f.tx);}catch{accepted=false;}
  assert.equal(accepted,false);
 }
});
test('changes across password authentication never issue a witness',async()=>{
 let reads=0;const f=fixture({readAuthState:async()=>({userID,email:'synthetic@example.invalid',password:++reads===1?'old':'new',bannedUntil:null,deletedAt:null,factors:[]})});
 assert.equal(await f.issue(),null);assert.equal(await f.witness.verify(f.scope,f.tx),false);
});
test('wrong user or cleanup failure cannot authorize intake',async()=>{
 const wrong=fixture({authenticate:async()=>epochID});assert.equal(await wrong.issue(),null);assert.equal(await wrong.witness.verify(wrong.scope,wrong.tx),false);
 const failed=fixture({authenticate:async()=>{throw Error('temporary session cleanup failed');}});await assert.rejects(failed.issue(),/cleanup/);assert.equal(await failed.witness.verify(failed.scope,failed.tx),false);
});
test('deadline, backwards clock and original request cancellation invalidate even another transaction signal',async()=>{
 for(const time of [999,16000,NaN]){const f=fixture();await f.issue();f.time(time);assert.equal(await f.witness.verify(f.scope,f.tx),false);}
 const f=fixture();await f.issue();f.source.abort();assert.equal(await f.witness.verify(f.scope,f.tx),false);
});
test('foreign scope and request inputs never borrow the original witness',async()=>{
 const f=fixture();assert.equal(await f.witness.reauthenticate('foreign@example.invalid','pw',f.source.signal),null);assert.equal(f.authCalls(),0);await f.issue();
 for(const key of ['userID','sessionID','epochID'])assert.equal(await f.witness.verify({...f.scope,[key]:submissionID},f.tx),false);
});
test('abort during stalled password authentication prevents a late response from issuing proof',async()=>{
 let resolve;const f=fixture({authenticate:()=>new Promise(done=>{resolve=done;})});
 const pending=f.issue();while(!resolve)await new Promise(done=>setImmediate(done));f.source.abort();await assert.rejects(pending);resolve(userID);
 assert.equal(await f.witness.verify(f.scope,f.tx),false);
});
