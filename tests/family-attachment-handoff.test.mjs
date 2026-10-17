import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handoffFamilyAttachments,normalizeFamilyAttachmentPlan,requireFamilyAttachmentProof} from '../lib/family-attachment-handoff.mjs';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const bytes=new Uint8Array([1,2,3,4]),sha=createHash('sha256').update(bytes).digest('hex');
const file=(n,user=1,epoch=2)=>({id:id(n),mime:'image/png',size:4,sha256:sha,source:{userID:id(user),epoch:id(epoch),path:`${id(user)}/${id(epoch)}/${id(n)}.png`}});
test('a shared home can include over 100 files when each original uploader remains within their own quota',()=>{
 const input={requestID:id(10),homeID:id(11),ownerID:id(1),ownerEpoch:id(2),recipientID:id(3),recipientEpoch:id(4),snapshotDigest:'a'.repeat(64),files:[...Array.from({length:100},(_,n)=>file(n+100)),file(201,5,6)]};
 assert.equal(normalizeFamilyAttachmentPlan(input).files.length,101);
 input.files.push(file(202));assert.throws(()=>normalizeFamilyAttachmentPlan(input),/Source attachment quota exceeded/);
 const large={...input,files:Array.from({length:21},(_,n)=>({...file(n+300),size:5242880}))};
 assert.throws(()=>normalizeFamilyAttachmentPlan(large),/Source attachment quota exceeded/);
});
function fixture({files=[file(8),file(9,5,6)],lostActivation=false,lostCopy=false}={}) {
 const input={requestID:id(10),homeID:id(11),ownerID:id(1),ownerEpoch:id(2),recipientID:id(3),recipientEpoch:id(4),snapshotDigest:'a'.repeat(64),files};
 const plan=normalizeFamilyAttachmentPlan(input),scope={requestID:id(10),homeID:id(11),userID:id(1),ownerEpoch:id(2),nativeLease:id(12)},signal=new AbortController().signal;
 const objects=new Map(plan.files.map(f=>[f.source.path,new Blob([bytes],{type:f.mime})]));
 let current='absent',owner=plan.ownerID,valid=true;const calls=[];
 const ports={
  guard:async()=>valid,
  plan:async()=>input,
  prepare:async(s,p,d)=>{calls.push('prepare');assert.equal(owner,p.ownerID,'preparation does not wait for owner switch');if(current==='absent')current='prepared';return d;},
  status:async(s,p)=>({state:current,planDigest:createHash('sha256').update(JSON.stringify(p)).digest('hex')}),
  inspectDestination:async(s,p,f)=>{calls.push('inspect:'+f.id);return objects.get(f.destination.path)??null;},
  writeDestination:async(s,p,f)=>{calls.push('copy:'+f.id);assert.equal(owner,p.ownerID);assert.equal(current,'prepared');assert.equal(objects.has(f.destination.path),false);const source=objects.get(f.source.path);assert.ok(source);objects.set(f.destination.path,source);if(lostCopy)throw Error('Copy acknowledgement lost');},
  activate:async(s,p,d,proof)=>{calls.push('activate');requireFamilyAttachmentProof(proof,s,p);assert.equal(current,'prepared');owner=p.recipientID;current='activated';if(lostActivation)throw Error('Commit acknowledgement lost');},
  removeSource:async(s,p,f,proof)=>{calls.push('remove:'+f.id);assert.equal(current,'activated');assert.equal(owner,p.recipientID);requireFamilyAttachmentProof(proof,s,p);assert.ok(objects.has(f.destination.path));objects.delete(f.source.path);},
  sourceAbsent:async(s,p,f)=>!objects.has(f.source.path),
  finish:async()=>{calls.push('finish');current='complete';}
 };
 return {scope,signal,plan,ports,calls,objects,get state(){return current;},get owner(){return owner;},invalidate:()=>{valid=false;}};
}
test('prepare/copy/measure precede activation; member bytes stay in place and owner originals clean up only afterward',async()=>{
 const f=fixture();assert.deepEqual(await handoffFamilyAttachments(f.scope,f.ports,f.signal),{state:'complete',homeID:f.plan.homeID});
 assert.equal(f.owner,f.plan.recipientID);
 assert.ok(f.calls.indexOf('copy:'+id(8))<f.calls.indexOf('activate'));
 assert.ok(f.calls.indexOf('activate')<f.calls.indexOf('remove:'+id(8)));
 assert.equal(f.calls.includes('copy:'+id(9)),false);assert.equal(f.calls.includes('remove:'+id(9)),false);
 assert.ok(f.objects.has(f.plan.files[1].source.path));assert.ok(f.objects.has(f.plan.files[0].destination.path));
 const before=[...f.calls];await handoffFamilyAttachments(f.scope,f.ports,f.signal);assert.deepEqual(f.calls,before,'complete receipt causes no duplicate writes');
});
test('lost copy and activation acknowledgements reconcile durable state without repeating the mutation',async()=>{
 const f=fixture({lostCopy:true,lostActivation:true});assert.equal((await handoffFamilyAttachments(f.scope,f.ports,f.signal)).state,'complete');
 assert.equal(f.calls.filter(x=>x==='activate').length,1);assert.equal(f.calls.filter(x=>x.startsWith('copy:')).length,1);
});
test('quota/preparation refusal cannot switch owner, write a copy or release an uncertain reservation',async()=>{
 const f=fixture();f.ports.prepare=async()=>{throw Error('Receiver quota exceeded');};
 assert.deepEqual(await handoffFamilyAttachments(f.scope,f.ports,f.signal),{state:'pending'});
 assert.equal(f.owner,f.plan.ownerID);assert.equal(f.state,'absent');assert.equal(f.calls.some(x=>/^(copy|activate|remove|finish)/.test(x)),false);
});
test('one corrupted copied file prevents all ownership changes and source removal',async()=>{
 const f=fixture();const write=f.ports.writeDestination;
 f.ports.writeDestination=async(...args)=>{await write(...args);f.objects.set(args[2].destination.path,new Blob([new Uint8Array([4,3,2,1])],{type:'image/png'}));};
 assert.deepEqual(await handoffFamilyAttachments(f.scope,f.ports,f.signal),{state:'pending'});
 assert.equal(f.owner,f.plan.ownerID);assert.ok(f.objects.has(f.plan.files[0].source.path));assert.equal(f.calls.includes('activate'),false);
});
test('revoked authority after copy preserves original bytes and leaves prepared reservation pending',async()=>{
 const f=fixture();const write=f.ports.writeDestination;f.ports.writeDestination=async(...args)=>{await write(...args);f.invalidate();};
 assert.equal((await handoffFamilyAttachments(f.scope,f.ports,f.signal)).state,'pending');assert.equal(f.state,'prepared');assert.equal(f.owner,f.plan.ownerID);assert.ok(f.objects.has(f.plan.files[0].source.path));
});
test('destination loss after activation never permits removal of the surviving original',async()=>{
 const f=fixture();const activate=f.ports.activate;
 f.ports.activate=async(...args)=>{await activate(...args);f.objects.delete(f.plan.files[0].destination.path);};
 assert.equal((await handoffFamilyAttachments(f.scope,f.ports,f.signal)).state,'pending');assert.equal(f.state,'activated');assert.ok(f.objects.has(f.plan.files[0].source.path));assert.equal(f.calls.some(x=>x.startsWith('remove:')),false);
});
test('opaque proof refuses client flags, foreign scope, changed plan and original cancellation',async()=>{
 const f=fixture();let proof;
 f.ports.activate=async(s,p,d,value)=>{proof=value;requireFamilyAttachmentProof(value,s,p);throw Error('No commit');};
 assert.equal((await handoffFamilyAttachments(f.scope,f.ports,f.signal)).state,'pending');assert.ok(proof);
 assert.throws(()=>requireFamilyAttachmentProof({},f.scope,f.plan));
 assert.throws(()=>requireFamilyAttachmentProof(proof,{...f.scope,nativeLease:id(13)},f.plan));
 assert.throws(()=>requireFamilyAttachmentProof(proof,f.scope,{...f.plan,snapshotDigest:'b'.repeat(64)}));
 const controller=new AbortController(),cancel=fixture();cancel.ports.activate=async(s,p,d,value)=>{controller.abort();assert.throws(()=>requireFamilyAttachmentProof(value,s,p));};
 assert.equal((await handoffFamilyAttachments(cancel.scope,cancel.ports,controller.signal)).state,'pending');
});
test('cancellation bounds a stalled provider and never enters a later mutation',async()=>{
 const f=fixture(),controller=new AbortController();let entered;
 const ready=new Promise(resolve=>{entered=resolve;});
 f.ports.prepare=async()=>{entered();return new Promise(()=>{});};
 const result=handoffFamilyAttachments(f.scope,f.ports,controller.signal);await ready;controller.abort();assert.deepEqual(await result,{state:'pending'});assert.equal(f.calls.includes('activate'),false);
});
test('plan rejects duplicate files and unbound paths, while retained prior owner epochs remain movable',()=>{
 const f=fixture();
 assert.throws(()=>normalizeFamilyAttachmentPlan({...f.plan,files:[file(8),file(8)]}));
 assert.throws(()=>normalizeFamilyAttachmentPlan({...f.plan,files:[{...file(8),source:{...file(8).source,path:'other/path'}}]}));
 assert.equal(fixture({files:[file(8,1,15)]}).plan.files[0].destination.epoch,id(4));
});
test('foreign request/home/owner/epoch plan never starts preparation',async()=>{
 for(const key of ['requestID','homeID','userID','ownerEpoch']){
  const f=fixture();assert.equal((await handoffFamilyAttachments({...f.scope,[key]:id(20)},f.ports,f.signal)).state,'pending');assert.deepEqual(f.calls,[]);
 }
});
test('repeated cleanup interruption advances across five files without deleting the cleaned prefix again',async()=>{
 const f=fixture({files:[20,21,22,23,24].map(n=>file(n))});let removals=0;
 f.ports.guard=async()=>removals<2;
 const remove=f.ports.removeSource;f.ports.removeSource=async(...args)=>{await remove(...args);removals++;};
 const counts=[];
 for(let attempt=0;attempt<3;attempt++){
  removals=0;const result=await handoffFamilyAttachments(f.scope,f.ports,f.signal);
  counts.push(f.plan.files.filter(file=>f.objects.has(file.source.path)).length);
  assert.equal(result.state,attempt===2?'complete':'pending');
 }
 assert.deepEqual(counts,[3,1,0]);assert.equal(f.calls.filter(x=>x.startsWith('remove:')).length,5);assert.equal(f.calls.filter(x=>x==='activate').length,1);
 const unknown=fixture();unknown.ports.sourceAbsent=async()=>null;
 assert.equal((await handoffFamilyAttachments(unknown.scope,unknown.ports,unknown.signal)).state,'pending');assert.equal(unknown.calls.some(x=>x.startsWith('remove:')),false);
});
