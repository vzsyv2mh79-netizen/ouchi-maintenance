import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOuchiControlledFamilyPreparation,CONTROLLED_PREPARATION_PROVENANCE_SQL,CONTROLLED_PREPARATION_ROOT_SQL,CONTROLLED_PREPARATION_RESERVE_SQL,CONTROLLED_PREPARATION_STATE_SQL} from '../lib/ouchi-controlled-family-preparation.mjs';
import {STATE_SQL,PROTOCOL,REVISION} from '../lib/controlled-operating-state.mjs';
import {ACQUIRE_SQL,HELD_SQL,OPERATION_LOCK_SQL} from '../lib/controlled-owning-maintenance-lock.mjs';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
function fixture(){
 const operation={protocol:PROTOCOL,revision:REVISION,epoch:'1',manifest:'a'.repeat(64),boot:'1793000000000000'};
 const scope={protocolVersion:2,kind:'shared-account',requestID:uuid('1'),userID:uuid('2'),leaseToken:uuid('3'),inventoryDigest:'b'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:uuid('4'),scopeID:uuid('5')}]};
 const body={domain:'Kakei/shared-retirement/controlled-generation/v1',generationID:uuid('6'),scope,operation};
 const provenance={...body,digest:createHash('sha256').update(body.domain+'\n'+stable(body)).digest('hex')};
 const fixed={...scope};delete fixed.leaseToken;
 const f={checks:[],queries:[],reserved:0,covered:true,source:{provenance,producer_pid:9,producer_xid:'10'},root:{scope:fixed,user_id:scope.userID,status:'requested',lease_token:null,lease_until:null,receipts:{},pid:20,xid:'30'},phase:'reserved',missingSQL:false};
 f.options={provenance,nativeLease:uuid('7'),homes:[{homeID:uuid('8'),successorID:uuid('9')}],expectedOperation:operation,verifyNoDispatch:async()=>f.covered};
 f.tx={signal:new AbortController().signal,beforeCommit:(name,verify)=>f.checks.push({name,verify}),query:async(sql)=>{
  f.queries.push(sql);
  if(sql===ACQUIRE_SQL)return {rows:[{acquired:true}]};
  if(sql===HELD_SQL)return {rows:[{held:true}]};
  if(sql===OPERATION_LOCK_SQL)return {rows:[{locked:true}]};
  if(sql===STATE_SQL)return {rows:[{protocol:PROTOCOL,revision:REVISION,epoch:'1',verified_manifest:operation.manifest,boot:operation.boot,status:'ready',live:true,primary:true,replication_mode:'origin',isolation:'read committed',pid:20,xid:'30'}]};
  if(sql===CONTROLLED_PREPARATION_PROVENANCE_SQL)return {rows:[f.source]};
  if(sql===CONTROLLED_PREPARATION_ROOT_SQL)return {rows:[f.root]};
  if(sql===CONTROLLED_PREPARATION_RESERVE_SQL){if(f.missingSQL)throw Error('missing controlled SQL');f.reserved++;return {rows:[{ok:true}]};}
  if(sql===CONTROLLED_PREPARATION_STATE_SQL)return {rows:[{ok:true,pid:20,xid:'30',provenance_digest:provenance.digest,phase:f.phase}]};
  throw Error('Unexpected SQL');
 }};return f;
}
test('stage zero reads prior committed provenance before reserving and rechecks final facts',async()=>{
 const f=fixture(),adapter=createOuchiControlledFamilyPreparation(f.options),result=await adapter.reserve(f.tx);
 assert.equal(f.reserved,1);assert.equal(result.kind,'controlled-family-preparation');assert.equal(result.durable,undefined);assert.equal(result.verify,undefined);
 assert.ok(f.queries.indexOf(OPERATION_LOCK_SQL)<f.queries.indexOf(CONTROLLED_PREPARATION_PROVENANCE_SQL));
 assert.ok(f.queries.indexOf(CONTROLLED_PREPARATION_PROVENANCE_SQL)<f.queries.indexOf(CONTROLLED_PREPARATION_ROOT_SQL));
 assert.ok(f.queries.indexOf(CONTROLLED_PREPARATION_ROOT_SQL)<f.queries.indexOf(CONTROLLED_PREPARATION_RESERVE_SQL));
 for(const c of f.checks)assert.equal(await c.verify(),true,c.name);
 await assert.rejects(adapter.reserve(f.tx),/already attempted/);assert.equal(f.reserved,1);
});
test('old domain, mismatched external operation and modified provenance are refused',()=>{
 for(const mutate of [f=>{f.options.provenance.domain='old';},f=>{f.options.expectedOperation={...f.options.expectedOperation,epoch:'2'};},f=>{f.options.provenance.digest='f'.repeat(64);}]){
  const f=fixture();mutate(f);assert.throws(()=>createOuchiControlledFamilyPreparation(f.options));
 }
});
test('same transaction birth, wrong protected record, active root or dispatch refuses before reservation',async()=>{
 for(const mutate of [f=>{f.source.producer_xid='30';},f=>{f.source={...f.source,provenance:{...f.source.provenance,digest:'f'.repeat(64)}};},f=>{f.root.status='processing';},f=>{f.root.lease_token=uuid('3');},f=>{f.root.receipts={old:true};},f=>{f.covered=false;}]){
  const f=fixture(),adapter=createOuchiControlledFamilyPreparation(f.options);mutate(f);
  await assert.rejects(adapter.reserve(f.tx));assert.equal(f.reserved,0);assert.equal(await f.checks[0].verify(),false);
 }
});
test('late dispatch, root changes and missing controlled SQL never grant completion',async()=>{
 for(const mutate of [f=>{f.covered=false;},f=>{f.root.xid='31';},f=>{f.phase='cancelled';},f=>{f.root.lease_until='later';},f=>{f.source.producer_pid=11;},f=>{f.source.producer_xid='11';}]){
  const f=fixture(),adapter=createOuchiControlledFamilyPreparation(f.options);await adapter.reserve(f.tx);mutate(f);assert.equal(await f.checks[0].verify(),false);
 }
 const f=fixture();f.missingSQL=true;await assert.rejects(createOuchiControlledFamilyPreparation(f.options).reserve(f.tx),/missing controlled SQL/);assert.equal(await f.checks[0].verify(),false);
 assert.equal(f.queries.some(sql=>sql.includes('maintenance_private.reserve_family_preparation_generation(')),false);
});
