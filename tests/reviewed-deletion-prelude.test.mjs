import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedCleanupReadyFixture} from './fixtures/reviewed-file-cleanup.mjs';
import {createReviewedFileFinalization} from '../lib/reviewed-file-cleanup.mjs';
import {createReviewedDeletionPrelude} from '../lib/reviewed-deletion-prelude.mjs';
async function fixture(){const f=await reviewedCleanupReadyFixture();const finalization=createReviewedFileFinalization({connect:f.cleanupConnect}),prelude=createReviewedDeletionPrelude({connect:f.cleanupConnect,cleanup:f.cleanupPort,finalization}),scope={...f.cleanupInput};delete scope.kind;delete scope.fileID;return {...f,finalization,prelude,workerScope:scope};}
test('private reviewed prelude makes existing lease usable only after typed source cleanup and finalization, repeat skips Storage',async()=>{
 const f=await fixture();try{
  const args=Object.values(f.workerScope);await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) ok',args)).rows[0].ok,false);await f.db.exec('reset role');
  assert.equal(await f.prelude.prepare(f.workerScope,f.signal),true);assert.equal(f.cleanupCalls(),1);await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) ok',args)).rows[0].ok,true);await f.db.exec('reset role');
  assert.equal(await f.prelude.prepare(f.workerScope,f.signal),true);assert.equal(f.cleanupCalls(),1);assert.equal(f.objects.has(f.manifest.destination.objectPath),true);
 }finally{await f.db.close();}
});
test('lost finalization acknowledgement resumes from exact receipt without another source operation',async()=>{
 const f=await fixture();try{
  let lose=true;const prelude=createReviewedDeletionPrelude({connect:f.cleanupConnect,cleanup:f.cleanupPort,finalization:{status:f.finalization.status,finalize:async(...args)=>{const receipt=await f.finalization.finalize(...args);if(lose){lose=false;throw Error('Synthetic finalization response lost');}return receipt;}}});
  await assert.rejects(prelude.prepare(f.workerScope,f.signal),/response lost/);assert.equal(await prelude.prepare(f.workerScope,f.signal),true);assert.equal(f.cleanupCalls(),1);
 }finally{await f.db.close();}
});
test('after reviewed metadata cleanup prelude discovers ordinary resume from SQL rather than a caller flag',async()=>{
 const f=await fixture();try{
  await f.prelude.prepare(f.workerScope,f.signal);await f.db.exec('set role service_role');const args=Object.values(f.workerScope);assert.equal((await f.db.query('select public.erase_maintenance_deletion_records($1,$2,$3,$4) ok',args)).rows[0].ok,true);assert.equal((await f.db.query('select public.erase_reviewed_retirement_metadata($1,$2,$3,$4) ok',args)).rows[0].ok,true);await f.db.exec('reset role');
  assert.equal(await f.prelude.prepare(f.workerScope,f.signal),true);assert.equal(f.cleanupCalls(),1);await assert.rejects(f.prelude.prepare({...f.workerScope,mode:'ordinary'},f.signal),/Exact reviewed/);
 }finally{await f.db.close();}
});
test('missing port configuration, cancelled signal or disabled principal prevents all irreversible work',async()=>{
 const f=await fixture();try{
  assert.throws(()=>createReviewedDeletionPrelude({connect:f.cleanupConnect,cleanup:f.cleanupPort,finalization:{status:f.finalization.status}}),/Complete reviewed/);
  const controller=new AbortController();controller.abort(Error('Cancelled prelude'));await assert.rejects(f.prelude.prepare(f.workerScope,controller.signal),/Cancelled/);assert.equal(f.cleanupCalls(),0);
  await f.db.exec('update maintenance_private.retirement_file_principals set enabled=false');await assert.rejects(f.prelude.prepare(f.workerScope,f.signal),/Authorized/);assert.equal(f.cleanupCalls(),0);
 }finally{await f.db.close();}
});
test('bounded multi-page adapter passes exact advancing cursor, resumes finalized entries without Storage, and refuses malformed pages',async()=>{
 const {randomUUID}=await import('node:crypto');const s={requestID:randomUUID(),userID:randomUUID(),epochID:randomUUID(),leaseToken:randomUUID()},signal=new AbortController().signal;
 const items=Array.from({length:53},()=>({kind:'personal_file',fileID:randomUUID(),state:'absence_confirmed'})).sort((a,b)=>a.fileID.localeCompare(b.fileID));let pages=0,statuses=0;
 const page=(rows,hasMore)=>({mode:'reviewed',requestID:s.requestID,userID:s.userID,epochID:s.epochID,items:rows,hasMore,nextKey:hasMore?'personal_file:'+rows.at(-1).fileID:null,accountErasureConfirmed:false});
 const result=item=>({kind:'reviewed-file-finalization/v1',requestID:s.requestID,userID:s.userID,epochID:s.epochID,fileKind:item.kind,fileID:item.fileID,sourceMetadataErased:true,retiredIDProtected:true,capacityBytesHeld:true,capacityReleased:false,accountErasureConfirmed:false});
 const connect=async()=>({abort(){},async close(){},async query(sql,args){if(sql.includes('page_reviewed_cleanup')){assert.equal(args[4],pages===0?null:'personal_file:'+items[49].fileID);return {rows:[{page:pages++===0?page(items.slice(0,50),true):page(items.slice(50),false)}]};}return {rows:[]};}});
 const ports={cleanup:{cleanup:async()=>assert.fail('Finalized entry needs no Storage')},finalization:{status:async input=>{statuses++;return result({kind:input.kind,fileID:input.fileID});},finalize:async()=>assert.fail('Finalized entry needs no mutation')}};
 assert.equal(await createReviewedDeletionPrelude({connect,...ports}).prepare(s,signal),true);assert.equal(pages,2);assert.equal(statuses,53);
 for(const bad of [{...page(items.slice(0,50),true),nextKey:'personal_file:'+items[0].fileID},{...page([items[1],items[0]],false)},{...page([],false),requestID:randomUUID()},{...page(items.slice(0,51),false)}]){
  const broken=async()=>({abort(){},async close(){},async query(sql){return {rows:sql.includes('page_reviewed_cleanup')?[{page:bad}]:[]};}});await assert.rejects(createReviewedDeletionPrelude({connect:broken,...ports}).prepare(s,signal),/unconfirmed|did not advance/);
 }
});
