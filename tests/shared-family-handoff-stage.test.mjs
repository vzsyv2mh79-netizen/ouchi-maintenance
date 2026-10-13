import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSharedFamilyHandoffStage} from '../lib/shared-family-handoff-stage.mjs';
import {normalizeFamilyAttachmentPlan} from '../lib/family-attachment-handoff.mjs';
import {runSharedDeletion} from '../lib/shared-deletion-protocol.mjs';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const root={protocolVersion:2,kind:'shared-account',requestID:id(1),userID:id(2),leaseToken:id(3),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:id(4),scopeID:id(5)},{app:'kakei',requestID:id(6),scopeID:id(7)}]};
const target=n=>({scope:{requestID:root.requestID,homeID:id(n),userID:root.userID,ownerEpoch:id(5),nativeRequestID:id(4),nativeLease:id(8),controllerScope:root},plan:{requestID:root.requestID,homeID:id(n),ownerID:root.userID,ownerEpoch:id(5),recipientID:id(9),recipientEpoch:id(10),snapshotDigest:'b'.repeat(64),files:[]}});
function fixture(){
 let list=[target(11),target(12)],stored=null,current=true,covered=true,otherApps=true,completed=true,finished=new Set(),late=null;
 const calls=[];
 const transaction=async cb=>{
  const original=structuredClone(stored),checks=[];
  const tx={query:async()=>{throw Error('No SQL model in this synthetic contract test');},beforeCommit:(key,check)=>checks.push(check)};
  try{const value=await cb(tx);if(late&&checks.length)await late();for(const check of checks)if(await check()!==true)throw Error('COMMIT verification required');return value;}catch(e){stored=original;throw e;}
 };
 const options={transaction,verifyCurrentController:async(tx,s)=>current&&JSON.stringify(s)===JSON.stringify(root),loadFrozenTargets:async()=>structuredClone(list),verifyFrozenCoverage:async()=>covered,verifyOtherApps:async()=>otherApps,
  verifyCompletions:async(tx,s,targets)=>completed&&targets.every(t=>finished.has(t.plan.homeID)),portsForTarget:async(s,t)=>{
   calls.push(t.plan.homeID);const plan=normalizeFamilyAttachmentPlan(t.plan),planDigest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
   return {guard:async()=>current,plan:async()=>t.plan,prepare:async()=>{},status:async()=>({state:finished.has(t.plan.homeID)?'complete':'activated',planDigest}),inspectDestination:async()=>{},writeDestination:async()=>{},activate:async()=>{},removeSource:async()=>{},sourceAbsent:async()=>true,finish:async()=>{if(completed)finished.add(t.plan.homeID);}};
  },store:{record:async(tx,s,familyCoverageDigest)=>{stored={durable:true,protocolVersion:2,stage:'handoff-family',requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,apps:s.apps,familyCoverageDigest};},read:async()=>structuredClone(stored)}};
 return {options,calls,run:()=>createSharedFamilyHandoffStage(options)(root,new AbortController().signal),get stored(){return stored;},get finished(){return finished;},set list(v){list=v;},set current(v){current=v;},set covered(v){covered=v;},set otherApps(v){otherApps=v;},set completed(v){completed=v;},set late(v){late=v;}};
}
test('all frozen homes and other app family obligations precede a reconciled global handoff stage receipt',async()=>{
 const f=fixture();const first=await f.run();assert.equal(first.stage,'handoff-family');assert.equal(first.durable,true);assert.equal(f.finished.size,2);
 assert.deepEqual(await f.run(),first);assert.equal(f.finished.size,2);
});
for(const fault of ['current','covered','otherApps','completed'])test(`unconfirmed ${fault} prevents shared family checkpoint`,async()=>{
 const f=fixture();f[fault]=false;assert.equal(await f.run(),null);assert.equal(f.stored,null);
});
test('changed coverage, duplicate home and wrong application epoch are refused',async()=>{
 for(const change of [[target(11),target(11)],[{...target(11),scope:{...target(11).scope,ownerEpoch:id(7)}}]]){const f=fixture();f.list=change;assert.equal(await f.run(),null);assert.equal(f.stored,null);}
 const f=fixture();f.late=()=>{f.list=[target(11)];};assert.equal(await f.run(),null);assert.equal(f.stored,null);
});
test('COMMIT controller loss rolls the stage receipt back and retry retains individual completed homes',async()=>{
 const f=fixture();f.late=()=>{f.current=false;};assert.equal(await f.run(),null);assert.equal(f.stored,null);assert.equal(f.finished.size,2);
 f.late=null;f.current=true;assert.equal((await f.run()).durable,true);
});
test('shared controller stops before app/Auth erasure when family or later verification is unresolved',async()=>{
 const f=fixture(),stages=[];
 const adapters={readReceipt:async(s,stage)=>stage==='handoff-family'?f.stored:null,verifyCoverage:async()=>true,leaseCurrent:async()=>true,perform:async(s,stage)=>{
  stages.push(stage);if(stage==='handoff-family')return f.run();
  if(stage==='prepare')return {durable:true,protocolVersion:2,stage,requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,apps:s.apps};return null;
 }};
 f.completed=false;assert.deepEqual(await runSharedDeletion(root,adapters,new AbortController().signal),{state:'pending',stage:'handoff-family'});
 assert.ok(!stages.some(s=>s.startsWith('erase:')||s==='erase-auth'));
 f.completed=true;stages.length=0;assert.deepEqual(await runSharedDeletion(root,adapters,new AbortController().signal),{state:'pending',stage:'verify-family-before'});
 assert.ok(!stages.some(s=>s.startsWith('erase:')||s==='erase-auth'));
});
test('unverified empty roster and incomplete provider cannot imply global family completion',async()=>{
 const f=fixture();f.list=[];f.covered=false;assert.equal(await f.run(),null);
 assert.throws(()=>createSharedFamilyHandoffStage({...f.options,verifyOtherApps:null}),/Complete shared/);
 f.covered=true;f.otherApps=false;assert.equal(await f.run(),null);
 const c=new AbortController();c.abort();assert.equal(await createSharedFamilyHandoffStage(f.options)(root,c.signal),null);
});
