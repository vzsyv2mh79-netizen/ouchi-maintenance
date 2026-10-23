import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createDeletionReceiptHTTP} from '../lib/deletion-receipt-handler.mjs';
const id=randomUUID(),token=randomBytes(32).toString('base64url');
const url=`https://ouchi-maintenance.vercel.app/api/account/deletion/${id}/receipt`;
test('receipt GET uses the request/deadline signal and explicit read-only transaction',async()=>{
 let calls=0;
 const handler=createDeletionReceiptHTTP({credentials:{register:async()=>{throw Error('unexpected write');},authorize:async()=>false},
  resolveScope:async()=>null,allowOrigin:()=>false,
  transaction:async(fn,options)=>{calls++;assert.equal(options.readOnly,true);assert.ok(options.signal instanceof AbortSignal);return fn({signal:options.signal});},
 });
 assert.equal((await handler(new Request(url,{headers:{'x-deletion-receipt':token}}),id)).status,404);assert.equal(calls,1);
});
test('noncanonical receipt and URL query secret stop before transaction',async()=>{
 let called=false;
 const handler=createDeletionReceiptHTTP({credentials:{register:async()=>{},authorize:async()=>false},resolveScope:async()=>null,allowOrigin:()=>false,
  transaction:async()=>{called=true;throw Error('unexpected database access');}});
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 const bad=token.slice(0,-1)+alphabet[alphabet.indexOf(token.at(-1))+1];
 assert.equal((await handler(new Request(url,{headers:{'x-deletion-receipt':bad}}),id)).status,401);
 assert.equal((await handler(new Request(url+'?secret=synthetic',{headers:{'x-deletion-receipt':token}}),id)).status,400);
 assert.equal(called,false);
});
test('registration passes original deadline, bearer and receipt only inside write transaction',async()=>{
 const expiry=new Date(Date.now()+60000).toISOString();let calls=0;
 const handler=createDeletionReceiptHTTP({credentials:{authorize:async()=>false,register:async(scope,bearer,credential,deadline,tx)=>{
  calls++;assert.equal(scope.requestID,id);assert.equal(bearer,'synthetic-bearer');assert.equal(credential,token);assert.equal(deadline,expiry);assert.ok(tx.signal instanceof AbortSignal);return {expiresAt:deadline};}},
  resolveScope:async()=>({requestID:id}),allowOrigin:()=>false,
  transaction:async(fn,options)=>{assert.equal(options.readOnly,false);return fn({signal:options.signal});},
 });
 const result=await handler(new Request(url,{method:'POST',headers:{'x-deletion-receipt':token,'content-type':'application/json',authorization:'Bearer synthetic-bearer'},body:JSON.stringify({expiresAt:expiry})}),id);
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{registered:true,expiresAt:expiry});assert.equal(calls,1);
});
test('cancelled request never starts a database transaction',async()=>{
 const controller=new AbortController();controller.abort();let called=false;
 const handler=createDeletionReceiptHTTP({credentials:{register:async()=>{},authorize:async()=>false},resolveScope:async()=>null,allowOrigin:()=>false,
  transaction:async()=>{called=true;throw Error('unexpected database');}});
 assert.equal((await handler(new Request(url,{signal:controller.signal,headers:{'x-deletion-receipt':token}}),id)).status,409);assert.equal(called,false);
});
