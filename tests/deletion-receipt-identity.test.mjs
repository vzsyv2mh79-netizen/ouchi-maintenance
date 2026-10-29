import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const helper=data(compile('lib/verified-app-session.ts'));
const {createDeletionReceiptIdentityVerifier}=await import(data(compile('lib/deletion-receipt-identity.ts').replace("'./verified-app-session'",JSON.stringify(helper))));
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const token=(claims={})=>'e30.'+Buffer.from(JSON.stringify({sub:user,session_id:session,exp:Math.floor(Date.now()/1000)+600,...claims})).toString('base64url')+'.c2ln';
const auth=id=>({data:{user:{id}},error:null});
test('fresh exact-bearer Auth verification precedes pinned live-session read',async()=>{
 const signal=new AbortController().signal,bearer=token(),calls=[];
 const verify=createDeletionReceiptIdentityVerifier({getUser:async(value,s)=>{assert.equal(value,bearer);assert.equal(s,signal);calls.push('auth');return auth(user);}});
 const tx={signal,query:async(sql,args)=>{if(calls.length===1)assert.match(sql,/for share/);else assert.doesNotMatch(sql,/for share/);assert.deepEqual(args,[session,user]);calls.push('session');return {rows:[{verified_at:Date.now()}]};}};
 const result=await verify(bearer,tx);assert.equal(result.userID,user);assert.ok(Number.isFinite(result.authVerifiedAt));assert.deepEqual(calls,['auth','session','session']);
});
test('wrong subject, metadata-only session and expired JWT stop before database',async()=>{
 const verify=createDeletionReceiptIdentityVerifier({getUser:async()=>auth(user)});
 const tx={signal:new AbortController().signal,query:async()=>{throw Error('unexpected database access');}};
 for(const claims of [{sub:session},{session_id:null,user_metadata:{session_id:session}},{exp:1}])assert.equal(await verify(token(claims),tx),null);
});
test('revoked session or token expiring during live read never authenticates',async()=>{
 const verify=createDeletionReceiptIdentityVerifier({getUser:async()=>auth(user)}),signal=new AbortController().signal;
 assert.equal(await verify(token(),{signal,query:async()=>({rows:[]})}),null);
 assert.equal(await verify(token(),{signal,query:async()=>({rows:[{verified_at:Date.now()+3600000}]})}),null);
});
test('session expiry across row-lock wait is checked again after the lock',async()=>{
 const verify=createDeletionReceiptIdentityVerifier({getUser:async()=>auth(user)});let reads=0;
 const result=await verify(token(),{signal:new AbortController().signal,query:async()=>({rows:++reads===1?[{verified_at:Date.now()}]:[]})});
 assert.equal(result,null);assert.equal(reads,2);
});
test('fractional PostgreSQL clock is normalized to timestamptz millisecond precision',async()=>{
 const now=Date.now();const verify=createDeletionReceiptIdentityVerifier({getUser:async()=>auth(user)});
 const result=await verify(token(),{signal:new AbortController().signal,query:async()=>({rows:[{verified_at:String(now+0.875)}]})});
 assert.equal(result.authVerifiedAt,now);assert.equal(Number.isInteger(result.authVerifiedAt),true);
});
test('cancellation while Auth awaits discards reply and prevents SQL',async()=>{
 const controller=new AbortController();let finish,entered;
 const ready=new Promise(resolve=>{entered=resolve;});
 const verify=createDeletionReceiptIdentityVerifier({getUser:async()=>{entered();return new Promise(resolve=>{finish=resolve;});}});
 const checking=verify(token(),{signal:controller.signal,query:async()=>{throw Error('unexpected SQL');}});
 await ready;controller.abort();finish(auth(user));await assert.rejects(checking,/abort/i);
});
test('transaction signal mismatch and unavailable Auth refuse verification',async()=>{
 let calls=0;const verify=createDeletionReceiptIdentityVerifier({getUser:async()=>{calls++;return {data:{user:null},error:Error('unavailable')};}});
 const tx={signal:new AbortController().signal,query:async()=>{throw Error('unexpected SQL');}};
 await assert.rejects(verify(token(),tx,new AbortController().signal),/mismatch/);assert.equal(calls,0);
 assert.equal(await verify(token(),tx),null);
});
