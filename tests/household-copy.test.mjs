import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {householdCopyFixture} from './fixtures/household-copy.mjs';
import {owner,oe,recipient,rs,re} from './fixtures/home-handoff-identifiers.mjs';

test('copy reservation commits exact staged destination and capacity before any Storage I/O; missing original accounting refuses',async()=>{
 for(const accountOriginal of [false,true]){
  const f=await householdCopyFixture({accountOriginal});try{
   if(!accountOriginal){await assert.rejects(f.port.prepare(f.input,f.signal),/Original physical capacity/);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_attachments')).rows[0].n,0);}
   else {const prepared=await f.port.prepare(f.input,f.signal);assert.equal(prepared.state,'reserved');assert.equal(prepared.capacityClaimID,f.input.intentID);assert.equal((await f.db.query('select sum(size_bytes)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2*f.bytes.length);assert.equal((await f.db.query('select state from maintenance_private.household_attachments')).rows[0].state,'staged');}
   assert.equal(f.calls.length,0);
  }finally{await f.db.close();}
 }
});
test('verified copy preserves original and remains hidden/staged, with no activation or source removal capability',async()=>{
 const f=await householdCopyFixture();try{
  const prepared=await f.port.prepare(f.input,f.signal),result=await f.port.copy(f.operation,f.signal);assert.equal(result.state,'copy_verified');assert.equal(result.activationConfirmed,false);assert.equal(result.sourceEraseConfirmed,false);assert.equal(result.accountErasureConfirmed,false);
  assert.deepEqual(f.calls,['inspect','source','write','inspect']);assert.deepEqual(Buffer.from(await f.objects.get(prepared.destination.objectPath).arrayBuffer()),f.bytes);assert.equal(f.objects.has(f.sourcePath),true);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments')).rows[0].state,'staged');await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.read_maintenance_household_attachment($1,$2,$3,$4) item',[recipient,rs,re,f.input.destinationID])).rows[0].item,null);
 }finally{await f.db.close();}
});
test('lost prepare or copy commit acknowledgement recovers exact IDs; no new destination or extra charge is created',async()=>{
 const f=await householdCopyFixture();try{
  f.loseNextCommit();await assert.rejects(f.port.prepare(f.input,f.signal),/acknowledgement lost/);assert.equal((await f.port.status(f.operation,f.signal)).state,'reserved');await f.port.prepare(f.input,f.signal);
  await assert.rejects(f.port.prepare({...f.input,intentID:randomUUID(),destinationID:randomUUID()},f.signal),/Existing source copy/);
  f.loseNextCommit('copy_confirm');await assert.rejects(f.port.copy(f.operation,f.signal),/acknowledgement lost/);assert.equal((await f.port.status(f.operation,f.signal)).state,'copy_verified');await f.port.copy(f.operation,f.signal);
  assert.equal(f.calls.filter(c=>c==='write').length,1);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);assert.equal((await f.db.query('select count(*)::int n from maintenance_private.household_copy_intents')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('unknown POST outcome stays pending without a second POST, even when matching destination bytes exist',async()=>{
 const f=await householdCopyFixture();try{
  await f.port.prepare(f.input,f.signal);f.loseNextWrite();await assert.rejects(f.port.copy(f.operation,f.signal),/remote write acknowledgement lost/);
  assert.equal((await f.port.status(f.operation,f.signal)).writerState,'issued');const next=await f.port.copy(f.operation,f.signal);assert.equal(next.state,'pending');assert.equal(next.writerState,'issued');assert.equal(f.calls.filter(c=>c==='write').length,1);assert.equal(f.objects.has(f.sourcePath),true);
 }finally{await f.db.close();}
});
test('wrong bytes after an acknowledged write refuse verification without another POST',async()=>{
 const f=await householdCopyFixture();try{
  const prepared=await f.port.prepare(f.input,f.signal);await f.port.copy(f.operation,f.signal);f.objects.set(prepared.destination.objectPath,new Blob(['wrong'],{type:'application/pdf'}));await assert.rejects(f.port.copy(f.operation,f.signal),/bytes mismatch/);assert.equal(f.calls.filter(c=>c==='write').length,1);assert.equal(f.objects.has(f.sourcePath),true);
 }finally{await f.db.close();}
});
test('pending copies fence source mutation and another participant deletion before physical erasure; status survives cancelled review',async()=>{
 const f=await householdCopyFixture();try{
  await f.port.prepare(f.input,f.signal);
  await assert.rejects(f.db.query('update maintenance_private.product_attachments set removal_pending=true where id=$1',[f.input.fileID]),/Pending household copy/);
  const job=randomUUID(),lease=randomUUID();await f.db.query("insert into maintenance_private.account_deletion_requests(id,user_id,app_epoch_id,state,lease_token,lease_until) values($1,$2,$3,'running',$4,clock_timestamp()+interval '10 minutes')",[job,owner,oe,lease]);
  await f.db.exec('set role service_role');assert.equal((await f.db.query('select public.maintenance_deletion_lease_is_current($1,$2,$3,$4) current',[job,owner,oe,lease])).rows[0].current,false);assert.equal((await f.db.query('select public.capture_maintenance_deletion_objects($1,$2,$3,$4) result',[job,owner,oe,lease])).rows[0].result,false);
  await f.db.query('select public.cancel_maintenance_closure_review($1,$2,$3,$4)',[recipient,rs,re,f.submission]);await f.db.exec('reset role');await assert.rejects(f.port.copy(f.operation,f.signal),/matching review/);assert.equal(f.calls.length,0);assert.equal((await f.port.status(f.operation,f.signal)).state,'reserved');
  await assert.rejects(f.db.query('delete from maintenance_private.account_closure_reviews where review_request_id=$1',[f.input.reviewRequestID]),/foreign key constraint/);
 }finally{await f.db.close();}
});

test('insufficient or withdrawn capacity and ordinary roles refuse preparation/execution without writing bytes',async()=>{
 const limited=await householdCopyFixture({budget:50});try{await assert.rejects(limited.port.prepare(limited.input,limited.signal),/budget exceeded/);assert.equal(limited.calls.length,0);assert.equal((await limited.db.query('select count(*)::int n from maintenance_private.household_copy_intents')).rows[0].n,0);}finally{await limited.db.close();}
 const f=await householdCopyFixture();try{
  await f.port.prepare(f.input,f.signal);await f.db.exec('update maintenance_private.attachment_app_budget_policy set enabled=false');await assert.rejects(f.port.copy(f.operation,f.signal),/Held copy capacity/);assert.equal(f.calls.length,0);assert.equal((await f.port.status(f.operation,f.signal)).state,'reserved');
  for(const role of ['anon','authenticated','service_role']){await f.db.exec('set role '+role);await assert.rejects(f.db.query('select maintenance_private.prepare_household_copy($1,$2,$3,$4,$5,$6,$7)',[f.input.intentID,f.input.decisionID,f.input.reviewRequestID,f.input.userID,f.input.epochID,f.input.fileID,f.input.destinationID]),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});

test('lost writer issuance COMMIT sends no POST; only its undispatched attempt closes before a fresh attempt',async()=>{
 const f=await householdCopyFixture();try{
  await f.port.prepare(f.input,f.signal);f.loseNextCommit('writer_issue');
  await assert.rejects(f.port.copy(f.operation,f.signal),/commit acknowledgement lost/);
  assert.equal(f.calls.includes('write'),false);assert.equal((await f.port.status(f.operation,f.signal)).writerState,'unissued');
  assert.deepEqual((await f.db.query('select phase from maintenance_private.household_copy_writes')).rows,[{phase:'not_dispatched'}]);
  await f.port.copy(f.operation,f.signal);assert.equal(f.calls.filter(c=>c==='write').length,1);
  assert.deepEqual((await f.db.query('select phase from maintenance_private.household_copy_writes order by issued_at')).rows,[{phase:'not_dispatched'},{phase:'acknowledged'}]);
 }finally{await f.db.close();}
});
test('an actually observed provider response survives ACK transaction failure and lost ACK COMMIT without another POST',async()=>{
 for(const phase of ['query','commit']){
  const f=await householdCopyFixture();try{
   await f.port.prepare(f.input,f.signal);if(phase==='query')f.failNextAckQuery();else f.loseNextCommit('writer_ack');
   await assert.rejects(f.port.copy(f.operation,f.signal),/ACK transaction interrupted|commit acknowledgement lost/);
   assert.equal((await f.port.status(f.operation,f.signal)).writerState,'acknowledged');
   assert.equal((await f.port.copy(f.operation,f.signal)).state,'copy_verified');assert.equal(f.calls.filter(c=>c==='write').length,1);
  }finally{await f.db.close();}
 }
});
test('caller abort cannot expire a dispatched writer; delayed provider arrival stays hidden and is never reposted',async()=>{
 let release,started,arrived;const waiting=new Promise(r=>{release=r;}),entered=new Promise(r=>{started=r;}),arrival=new Promise(r=>{arrived=r;});
 const f=await householdCopyFixture({storageHooks:{writeDestination:async()=>{started();await waiting;}}});
 try{
  const manifest=await f.port.prepare(f.input,f.signal),cancel=new AbortController();
  const running=f.port.copy(f.operation,cancel.signal);await entered;cancel.abort(Error('caller left'));await assert.rejects(running,/caller left/);
  assert.equal((await f.port.status(f.operation,f.signal)).writerState,'issued');
  assert.equal((await f.port.copy(f.operation,f.signal)).state,'pending');assert.equal(f.objects.has(manifest.destination.objectPath),false);
  release();setImmediate(arrived);await arrival;
  assert.equal(f.objects.has(manifest.destination.objectPath),true);assert.equal((await f.port.copy(f.operation,f.signal)).state,'pending');
  assert.equal(f.calls.filter(c=>c==='write').length,1);assert.equal(f.objects.has(f.sourcePath),true);
  assert.equal((await f.db.query('select state from maintenance_private.household_attachments')).rows[0].state,'staged');
  assert.equal((await f.db.query('select count(*)::int n from maintenance_private.attachment_capacity_claims')).rows[0].n,2);
  await assert.rejects(f.db.query('delete from maintenance_private.household_copy_intents where intent_id=$1',[f.input.intentID]),/foreign key constraint/);
 }finally{release();await f.db.close();}
});
test('known source failure before POST closes only the unused attempt, permitting one later write',async()=>{
 let fail=true;const f=await householdCopyFixture({storageHooks:{readSource:async()=>{if(fail){fail=false;throw Error('source unavailable');}}}});
 try{
  await f.port.prepare(f.input,f.signal);await assert.rejects(f.port.copy(f.operation,f.signal),/source unavailable/);
  assert.equal((await f.port.status(f.operation,f.signal)).writerState,'unissued');assert.equal(f.calls.includes('write'),false);
  assert.equal((await f.port.copy(f.operation,f.signal)).state,'copy_verified');assert.equal(f.calls.filter(c=>c==='write').length,1);
 }finally{await f.db.close();}
});
test('writer issuance cannot be reminted or claimed by a guessed nonce, and ordinary roles cannot call writer callbacks',async()=>{
 const f=await householdCopyFixture();try{
  const prepared=await f.port.prepare(f.input,f.signal),attempt=randomUUID(),nonce=randomUUID(),args=[f.input.intentID,f.input.reviewRequestID,f.input.userID,f.input.epochID];
  await f.db.exec('set role ouchi_closure_operator');
  const issue=async(a,n)=>(await f.db.query('select maintenance_private.issue_household_copy_write($1,$2,$3,$4,$5,$6) receipt',[...args,a,n])).rows[0].receipt;
  assert.equal((await issue(attempt,nonce)).issued,true);assert.equal((await issue(attempt,nonce)).issued,false);assert.equal((await issue(randomUUID(),randomUUID())).issued,false);
  assert.equal((await f.db.query('select maintenance_private.record_household_copy_write_fact($1,$2,$3,$4,$5,$6,$7) recorded',[...args,attempt,randomUUID(),'not_dispatched'])).rows[0].recorded,false);
  await assert.rejects(f.db.query('select maintenance_private.lock_household_copy_write($1,$2,$3,$4,$5,$6)',[...args,attempt,randomUUID()]),/Own unused copy writer/);
  await assert.rejects(f.db.query('select maintenance_private.confirm_household_copy_bytes($1,$2,$3,$4,$5,$6)',[...args,prepared.destination.sha256,prepared.destination.size]),/Acknowledged copy writer/);
  await f.db.exec('reset role');const status=await f.port.status(f.operation,f.signal);assert.equal(Object.hasOwn(status,'writer_nonce'),false);assert.equal(JSON.stringify(status).includes(nonce),false);
  assert.equal((await f.port.copy(f.operation,f.signal)).state,'pending');assert.equal(f.calls.length,0);
  for(const role of ['anon','authenticated','service_role']){
   await f.db.exec('set role '+role);await assert.rejects(issue(randomUUID(),randomUUID()),/permission denied/);
   await assert.rejects(f.db.query('select maintenance_private.record_household_copy_write_fact($1,$2,$3,$4,$5,$6,$7)',[...args,attempt,nonce,'acknowledged']),/permission denied/);await f.db.exec('reset role');
  }
 }finally{await f.db.close();}
});

test('upgrade quarantines earlier byte observations as legacy unknown instead of inventing a finished writer',async()=>{
 const f=await householdCopyFixture({journal:false});try{
  const s=f.input,args=[s.intentID,s.reviewRequestID,s.userID,s.epochID];await f.db.exec('set role ouchi_closure_operator');
  const m=(await f.db.query('select maintenance_private.prepare_household_copy($1,$2,$3,$4,$5,$6,$7) manifest',[s.intentID,s.decisionID,s.reviewRequestID,s.userID,s.epochID,s.fileID,s.destinationID])).rows[0].manifest;
  await f.db.query('select maintenance_private.confirm_household_copy_bytes($1,$2,$3,$4,$5,$6)',[...args,m.destination.sha256,m.destination.size]);
  await f.db.exec('reset role');await f.db.exec(readFileSync('supabase/migrations/20261016160108_ouchi_household_copy_write_journal.sql','utf8'));
  assert.equal((await f.port.status(f.operation,f.signal)).writerState,'legacy_unknown');assert.equal((await f.port.copy(f.operation,f.signal)).state,'pending');assert.equal(f.calls.length,0);
 }finally{await f.db.close();}
});
