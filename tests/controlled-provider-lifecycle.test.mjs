import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
let active;
mock.module('../lib/postgres-driver.mjs',{namedExports:{createPostgresClient:config=>{active.config=config;return active.client;}}});
const {createOuchiControlledRetirement,OUCHI_CONTROLLED_EXCLUSION_HOLDER_SQL,OUCHI_CONTROLLED_EXCLUSION_ROOT_SQL,OUCHI_CONTROLLED_EXCLUSION_TERMINAL_ROOT_SQL,OUCHI_CONTROLLED_EXCLUSION_CALLER_SQL}=await import('../lib/ouchi-controlled-retirement.mjs');
const {STATE_SQL,PROTOCOL,REVISION}=await import('../lib/controlled-operating-state.mjs');
const {OPERATION_LOCK_SQL}=await import('../lib/controlled-owning-maintenance-lock.mjs');
const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const scope={protocolVersion:2,kind:'shared-account',requestID:uuid('1'),userID:uuid('2'),leaseToken:uuid('3'),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:uuid('4'),scopeID:uuid('5')}]};
function fixture({remaining=async()=>false,terminalRemaining=remaining,maxHoldMs=100}={}){
 const f={actor:false,global:false,closed:0,queries:[],row:{protocol:PROTOCOL,revision:REVISION,epoch:'7',verified_manifest:'a'.repeat(64),boot:'1793000000000000',status:'ready',live:true,primary:true,replication_mode:'origin',isolation:'read committed',pid:77,xid:'1'}};
 f.client=new EventEmitter();f.client.connect=async()=>{};f.client.end=async()=>{f.closed++;f.actor=false;f.global=false;};
 f.client.query=async(sql)=>{
  f.queries.push(sql);
  if(sql.startsWith('set '))return {rows:[]};
  if(sql===STATE_SQL)return {rows:[{...f.row}]};
  if(sql===OUCHI_CONTROLLED_EXCLUSION_HOLDER_SQL)return {rows:[{pid:77,database_oid:9,application_name:f.config.application_name,principal_safe:true,guard_safe:true,fresh_primary:true,no_other_locks:true,held_key:f.actor}]};
  if(sql.startsWith('select exists'))return {rows:[{held:f.global}]};
  if(sql.includes('pg_try_advisory_lock_shared(pg_catalog.hashtextextended')){f.global=true;return {rows:[{acquired:true}]};}
  if(sql.includes('pg_try_advisory_lock_shared($1')){f.actor=true;return {rows:[{acquired:true}]};}
  if(sql.includes('pg_try_advisory_lock($1'))return {rows:[{acquired:true}]};
  if(sql.includes('pg_advisory_unlock_shared')){f.actor=false;return {rows:[{released:true}]};}
  if(sql.includes('pg_advisory_unlock('))return {rows:[{released:true}]};
  throw Error('Unexpected SQL');
 };
 active=f;
 f.provider=createOuchiControlledRetirement({target:{kind:'supabase-direct',projectRef:'a'.repeat(20),password:'synthetic-unused-only',ca:'-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----'},epoch:'7',manifest:'a'.repeat(64),expectedBoot:f.row.boot,maxHoldMs,verifyRemainingPaths:remaining,verifyRemainingTerminalPaths:terminalRemaining});return f;
}
test('separate global and actor holds cover callback and close afterward',async()=>{
 const f=fixture();assert.equal(await f.provider.withScope(scope,new AbortController().signal,async()=>{assert.ok(f.actor&&f.global);return 42;}),42);assert.equal(f.closed,1);assert.equal(f.actor||f.global,false);
});
test('paused or restarted operation refuses before work and closes dedicated session',async()=>{
 for(const changed of [{status:'paused'},{boot:'1793000000000001'}]){const f=fixture();Object.assign(f.row,changed);let called=false;await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async()=>{called=true;}));assert.equal(called,false);assert.equal(f.closed,1);}
});
test('work failure and late operation change never return success',async()=>{
 for(const mode of ['throw','change']){const f=fixture();await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async()=>{if(mode==='throw')throw Error('failed work');f.row.epoch='8';return 'not success';}));assert.equal(f.closed,1);}
});
test('elapsed hold deadline refuses even when timer delivery is blocked',async()=>{
 const f=fixture();await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async()=>{const until=performance.now()+130;while(performance.now()<until){}return 'late';}));assert.equal(f.closed,1);
});
function owning(f){
 const t={checks:[],terminal:false,terminalProof:true,pid:88,xid:'55',callerSafe:true,operationLocked:true,queries:[]};
 t.tx={signal:new AbortController().signal,beforeCommit:(name,verify)=>t.checks.push({name,verify}),query:async(sql)=>{
  t.queries.push(sql);
  if(sql===OPERATION_LOCK_SQL)return {rows:[{locked:t.operationLocked}]};
  if(sql===OUCHI_CONTROLLED_EXCLUSION_ROOT_SQL)return {rows:[{scope,user_id:scope.userID,status:t.terminal?'complete':'processing',lease_token:t.terminal?null:scope.leaseToken,lease_live:true,pid:t.pid,xid:t.xid}]};
  if(sql===OUCHI_CONTROLLED_EXCLUSION_TERMINAL_ROOT_SQL)return {rows:[{verified:t.terminalProof,pid:t.pid,xid:t.xid}]};
  if(sql===OUCHI_CONTROLLED_EXCLUSION_CALLER_SQL)return {rows:[{pid:t.pid,xid:t.xid,principal_safe:t.callerSafe,same_held_session:true,caller_held_key:true}]};
  if(sql===STATE_SQL)return {rows:[{...f.row,pid:t.pid,xid:t.xid}]};
  if(sql.includes('pg_try_advisory_xact_lock_shared'))return {rows:[{acquired:true}]};
  if(sql.includes('select exists'))return {rows:[{held:true}]};
  throw Error('Unexpected owning query');
 }};return t;
}
test('owning callbacks preserve processing and verified terminal completion',async()=>{
 for(const terminal of [false,true]){
  const f=fixture({remaining:async()=>true,maxHoldMs:3000}),t=owning(f);
  await f.provider.withScope(scope,new AbortController().signal,async held=>{
   const processingBinding=await held.bind(t.tx,scope,t.tx.signal);assert.ok(processingBinding);assert.equal(processingBinding.operation,held.operation);
   if(terminal){t.terminal=true;const terminalBinding=await held.bindTerminal(t.tx,scope,t.tx.signal);assert.ok(terminalBinding);assert.equal(terminalBinding.operation,held.operation);}
   assert.equal(t.checks.length,3);for(const check of t.checks)assert.equal(await check.verify(),true,check.name);
  });assert.equal(f.closed,1);
 }
});
test('late owning identity, principal or terminal proof loss refuses final authority',async()=>{
 for(const mode of ['pid','principal','terminal']){
  const f=fixture({remaining:async()=>true,maxHoldMs:3000}),t=owning(f);
  await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async held=>{
   assert.ok(await held.bind(t.tx,scope,t.tx.signal));
   if(mode==='pid')t.pid++;if(mode==='principal')t.callerSafe=false;if(mode==='terminal'){t.terminal=true;t.terminalProof=false;}
   assert.equal(await t.checks.at(-1).verify(),false);
  }));assert.equal(f.closed,1);
 }
});
test('remaining writer coverage and independent holder loss refuse final commit',async()=>{
 for(const mode of ['coverage','holder']){
  let covered=true;const f=fixture({remaining:async()=>covered,maxHoldMs:3000}),t=owning(f);
  await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async held=>{
   assert.ok(await held.bind(t.tx,scope,t.tx.signal));
   if(mode==='coverage')covered=false;else f.client.emit('error',Error('connection lost'));
   assert.equal(await t.checks.at(-1).verify(),false);
  }));assert.equal(f.closed,1);
 }
});
test('terminal coverage is independent from successful processing coverage',async()=>{
 const f=fixture({remaining:async()=>true,terminalRemaining:async()=>false,maxHoldMs:3000}),t=owning(f);
 await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async held=>{
  assert.ok(await held.bind(t.tx,scope,t.tx.signal));t.terminal=true;
  assert.equal(await held.bindTerminal(t.tx,scope,t.tx.signal),null);
 }));assert.equal(f.closed,1);
});

test('held operating descriptor is exact immutable data, not a receipt',async()=>{
 const f=fixture({maxHoldMs:3000});
 await f.provider.withScope(scope,new AbortController().signal,async held=>{
  assert.deepEqual(held.operation,{protocol:PROTOCOL,revision:REVISION,epoch:'7',manifest:'a'.repeat(64),boot:'1793000000000000'});
  assert.ok(Object.isFrozen(held.operation));assert.throws(()=>{held.operation.epoch='8';},TypeError);
  assert.equal(held.operation.durable,undefined);assert.equal(held.operation.signature,undefined);
 });
});

test('every owning binding requires the operation row lock after its global lock',async()=>{
 for(const locked of [true,false,null]){
  const f=fixture({remaining:async()=>true,maxHoldMs:3000}),t=owning(f);t.operationLocked=locked;
  const run=f.provider.withScope(scope,new AbortController().signal,async held=>{
   assert.equal(Boolean(await held.bind(t.tx,scope,t.tx.signal)),locked===true);
   const row=t.queries.indexOf(OPERATION_LOCK_SQL);
   assert.ok(row>0);assert.match(t.queries[row-1],/pg_try_advisory_xact_lock_shared.*hashtextextended/);
  });
  if(locked===true)await run;else await assert.rejects(run);
 }
});

test('pre-cancelled scope never creates a database session or runs work',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();let called=false;
 await assert.rejects(f.provider.withScope(scope,controller.signal,async()=>{called=true;}));
 assert.equal(called,false);assert.equal(f.config,undefined);assert.equal(f.queries.length,0);
});

test('cleanup refusal preserves the original work or COMMIT error',async()=>{
 const f=fixture({maxHoldMs:3000}),original=Error('synthetic COMMIT rejection');
 await assert.rejects(f.provider.withScope(scope,new AbortController().signal,async()=>{
  f.row.status='paused';throw original;
 }),error=>{
  assert.ok(error instanceof AggregateError);assert.equal(error.cause,original);
  assert.equal(error.errors.length,2);assert.equal(error.errors[0],original);
  assert.match(error.errors[1].message,/release unconfirmed/);return true;
 });
 assert.equal(f.closed,1);assert.equal(f.actor||f.global,false);
});

test('cancellation during work closes holds and prevents retained binding reuse',async()=>{
 const f=fixture({remaining:async()=>true,maxHoldMs:3000}),t=owning(f),controller=new AbortController();let held,binding;
 await assert.rejects(f.provider.withScope(scope,controller.signal,async value=>{
  held=value;binding=await held.bind(t.tx,scope,t.tx.signal);assert.ok(binding);
  controller.abort();return 'cancelled work cannot succeed';
 }));
 assert.equal(f.closed,1);assert.equal(f.actor||f.global,false);assert.equal(held.signal.aborted,true);
 assert.equal(await binding.verify(t.tx,scope,t.tx.signal),false);
 assert.equal(await held.bind(t.tx,scope,t.tx.signal),null);
 for(const check of t.checks.filter(check=>check.name.startsWith('controlled-auth:')))assert.equal(await check.verify(),false);
});
