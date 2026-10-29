import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {StorageApiError} from '@supabase/supabase-js';
import {normalizeFamilyAttachmentPlan} from '../lib/family-attachment-handoff.mjs';
import {createFamilyAttachmentStoragePorts} from '../lib/family-attachment-storage.mjs';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const bytes=new Uint8Array([1,2,3,4]),sha256=createHash('sha256').update(bytes).digest('hex');
const plan=normalizeFamilyAttachmentPlan({requestID:id(1),homeID:id(2),ownerID:id(3),ownerEpoch:id(4),recipientID:id(5),recipientEpoch:id(6),snapshotDigest:'a'.repeat(64),files:[{id:id(7),mime:'image/png',size:4,sha256,source:{userID:id(3),epoch:id(4),path:`${id(3)}/${id(4)}/${id(7)}.png`}}]});
test('only canonical SDK NoSuchKey is absence; generic 404 and plain objects are unknown',async()=>{
 for(const [error,absent] of [[new StorageApiError('missing',404,'404','storage','NoSuchKey'),true],...[ [400,'404',true],[500,'404',false],[503,'404',false],[403,'404',false],[404,'500',false],[400,undefined,false] ].map(([status,semantic,accepted])=>[new StorageApiError('synthetic',status,semantic,'storage','NoSuchKey'),accepted]),[new StorageApiError('bucket denied',404,'404','storage','NoSuchBucket'),false],[{code:'NoSuchKey'},false]]){
  const ports=createFamilyAttachmentStoragePorts({guard:async()=>true,clientForSignal:()=>({storage:{from:()=>({download:async()=>({data:null,error})})}})});
  const read=ports.inspectDestination({},plan,plan.files[0],new AbortController().signal);
  if(absent)assert.equal(await read,null);else await assert.rejects(read,/unconfirmed/);
 }
});
test('source hash mismatch stops before upload; destination spoofing stops before creating a client',async()=>{
 let clients=0,uploads=0;
 const ports=createFamilyAttachmentStoragePorts({guard:async()=>true,clientForSignal:()=>{clients++;return {storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([4,3,2,1])],{type:'image/png'}),error:null}),upload:async()=>{uploads++;}})}};}});
 await assert.rejects(ports.writeDestination({},plan,plan.files[0],new AbortController().signal),/hash mismatch/);assert.equal(uploads,0);
 const prior=clients;await assert.rejects(ports.writeDestination({},plan,{...plan.files[0],destination:{...plan.files[0].destination,path:'another/object'}},new AbortController().signal),/Foreign family file/);assert.equal(clients,prior);
});
test('client proof flags cannot remove an original and cancellation after guard cannot reach Storage',async()=>{
 let clients=0;const controller=new AbortController();
 const ports=createFamilyAttachmentStoragePorts({guard:async()=>{controller.abort();return true;},clientForSignal:()=>{clients++;}});
 await assert.rejects(ports.removeSource({},plan,plan.files[0],{},new AbortController().signal),/measured family copies/);
 await assert.rejects(ports.inspectDestination({},plan,plan.files[0],controller.signal),{name:'AbortError'});assert.equal(clients,0);
});
