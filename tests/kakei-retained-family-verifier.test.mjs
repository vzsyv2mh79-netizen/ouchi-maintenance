import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {kakeiFamilyPlanDigest} from '../lib/kakei-family-plan-digest.mjs';
import {PGlite} from '@electric-sql/pglite';
import {createKakeiRetainedFamilyVerifier,bindKakeiCommittedFamilyVerifier} from '../lib/kakei-retained-family-verifier.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilySnapshotDigest,retainedKakeiFamilySnapshot} from '../lib/kakei-family-snapshot.mjs';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const scope={protocolVersion:2,kind:'shared-account',requestID:id(1),userID:id(2),leaseToken:id(3),inventoryDigest:'a'.repeat(64),apps:[{app:'ouchi-maintenance',requestID:id(4),scopeID:id(5)},{app:'kakei',requestID:id(6),scopeID:id(7)}]};
let suiteDB;
after(async()=>{if(suiteDB)await suiteDB.close();});
async function fixture(){
 const db=suiteDB??(suiteDB=new PGlite());
 await db.exec(`drop schema if exists private cascade;
 drop table if exists public.kb_transactions,public.kb_household_members,public.kb_households cascade;
 create schema private;
 create table private.kb_shared_deletion_journal(request_id uuid primary key,user_id uuid,scope jsonb,status text,lease_token uuid,lease_until timestamptz);
 create table private.kb_shared_handoff_plans(request_id uuid,household_id uuid,plan jsonb,primary key(request_id,household_id));
 create table public.kb_households(id uuid primary key,owner_id uuid,name text,updated_at timestamptz);
 create table public.kb_household_members(household_id uuid,user_id uuid,role text,display_name text,primary key(household_id,user_id));
 create table public.kb_transactions(id uuid primary key,household_id uuid,created_by uuid,amount int,currency text);
 alter table private.kb_shared_deletion_journal enable row level security;
 alter table private.kb_shared_handoff_plans enable row level security;
 alter table public.kb_households enable row level security;
 alter table public.kb_household_members enable row level security;
 alter table public.kb_transactions enable row level security;
 revoke all on private.kb_shared_deletion_journal,private.kb_shared_handoff_plans,public.kb_households,public.kb_household_members,public.kb_transactions from public;
 `);
 const fixed={...scope};delete fixed.leaseToken;
 await db.query("insert into private.kb_shared_deletion_journal values($1,$2,$3,'processing',$4,clock_timestamp()+interval '2 minutes')",[scope.requestID,scope.userID,fixed,scope.leaseToken]);
 await db.query('insert into public.kb_households values($1,$2,$3,clock_timestamp())',[id(11),id(8),'Synthetic family']);
 for(const [user,role] of [[scope.userID,'member'],[id(8),'owner'],[id(9),'member']])await db.query('insert into public.kb_household_members values($1,$2,$3,$4)',[id(11),user,role,'Synthetic '+role]);
 await db.query("insert into public.kb_transactions values($1,$2,$3,100,'JPY')",[id(12),id(11),id(9)]);
 const snapshot=await captureKakeiFamilySnapshot(scope,id(11),db);
 const plan={protocolVersion:2,requestID:scope.requestID,userID:scope.userID,inventoryDigest:scope.inventoryDigest,appRequestID:id(6),appScopeID:id(7),householdID:id(11),successorID:id(8),memberIDs:[scope.userID,id(8),id(9)],familyRecordIDs:[id(12)],familySnapshotDigest:'c'.repeat(64),retainedFamilySnapshotDigest:kakeiFamilySnapshotDigest(retainedKakeiFamilySnapshot(snapshot,scope))};
 await db.query('insert into private.kb_shared_handoff_plans values($1,$2,$3)',[scope.requestID,id(11),plan]);
 let proofs=true,fences=true,coverage=true,proofChecks=0;
 const options={verifyCommittedPlan:async()=>{proofChecks++;return proofs;},verifyWriteFences:async()=>fences,verifyFrozenCoverage:async(tx,s,plans)=>coverage&&plans.length===1&&plans[0].householdID===id(11)};
 const read=()=>db.transaction(tx=>createKakeiRetainedFamilyVerifier(options)(tx,scope,new AbortController().signal));
 return {db,plan,options,read,set proofs(v){proofs=v;},set fences(v){fences=v;},set coverage(v){coverage=v;},get proofChecks(){return proofChecks;}};
}
test('retained Kakei data is read after transfer without repeating original-owner mutations',async()=>{
 const f=await fixture();try{assert.equal(await f.read(),true);assert.equal(f.proofChecks,2);await f.db.query('delete from public.kb_household_members where user_id=$1',[scope.userID]);assert.equal(await f.read(),true);}finally{/* The next case rebuilds all fixture tables; suite cleanup closes the engine. */}
});
for(const fault of ['proofs','fences','coverage'])test(`missing ${fault} cannot accept current transferred data as committed family evidence`,async()=>{
 const f=await fixture();try{f[fault]=false;assert.equal(await f.read(),false);}finally{/* The next case rebuilds all fixture tables; suite cleanup closes the engine. */}
});
for(const fault of ['wrongScope','missingPlan','ownerNotTransferred','wrongSuccessorRole','changedAmount','lostFamilyRecord','newFamilyRecord','newOwnedFamily'])test(`retained family verification rejects ${fault}`,async()=>{
 const f=await fixture();try{
  if(fault==='wrongScope')await f.db.query('update private.kb_shared_handoff_plans set plan=$1',[{...f.plan,appScopeID:id(5)}]);
  if(fault==='missingPlan')await f.db.exec('delete from private.kb_shared_handoff_plans');
  if(fault==='ownerNotTransferred')await f.db.query('update public.kb_households set owner_id=$1',[scope.userID]);
  if(fault==='wrongSuccessorRole')await f.db.query("update public.kb_household_members set role='member' where user_id=$1",[id(8)]);
  if(fault==='changedAmount')await f.db.exec('update public.kb_transactions set amount=101');
  if(fault==='lostFamilyRecord')await f.db.exec('delete from public.kb_transactions');
  if(fault==='newFamilyRecord')await f.db.query("insert into public.kb_transactions values($1,$2,$3,100,'JPY')",[id(13),id(11),id(9)]);
  if(fault==='newOwnedFamily'){await f.db.query('insert into public.kb_households values($1,$2,$3,clock_timestamp())',[id(14),scope.userID,'Unplanned']);await f.db.query("insert into public.kb_household_members values($1,$2,'member','Synthetic')",[id(14),id(9)]);}
  assert.equal(await f.read(),false);
 }finally{/* The next case rebuilds all fixture tables; suite cleanup closes the engine. */}
});
test('late proof loss, expired controller lease, cancellation and missing proof provider remain unconfirmed',async()=>{
 const f=await fixture();try{
  let calls=0;const late={...f.options,verifyCommittedPlan:async()=>++calls===1};
  assert.equal(await f.db.transaction(tx=>createKakeiRetainedFamilyVerifier(late)(tx,scope,new AbortController().signal)),false);
  await f.db.exec("update private.kb_shared_deletion_journal set lease_until=clock_timestamp()-interval '1 second'");assert.equal(await f.read(),false);
  assert.throws(()=>createKakeiRetainedFamilyVerifier({...f.options,verifyCommittedPlan:null}),/Trusted Kakei/);
  const stopped=new AbortController();stopped.abort();assert.equal(await createKakeiRetainedFamilyVerifier(f.options)(f.db,scope,stopped.signal),false);
 }finally{/* The next case rebuilds all fixture tables; suite cleanup closes the engine. */}
});


test('cancellation during fence check and mutation of immutable signed plan cannot return confirmation',async()=>{
 const f=await fixture();try{
  const controller=new AbortController();
  const cancelled={...f.options,verifyWriteFences:async()=>{controller.abort();return true;}};
  assert.equal(await f.db.transaction(tx=>createKakeiRetainedFamilyVerifier(cancelled)(tx,scope,controller.signal)),false);
  const changed={...f.options,verifyCommittedPlan:async(tx,s,plan)=>{plan.successorID=s.userID;return true;}};
  assert.equal(await f.db.transaction(tx=>createKakeiRetainedFamilyVerifier(changed)(tx,scope,new AbortController().signal)),false);
  assert.equal(await f.read(),true);
 }finally{/* The next case rebuilds all fixture tables; suite cleanup closes the engine. */}
});


test('completion reader bridge checks exact receipt identity and never repeats the transfer',async()=>{
 const f=await fixture();try{
  let mode='exact',reads=0,transfers=0;
  const completion={complete:async()=>{transfers++;throw Error('Must never repeat transfer');},read:async(s,p)=>{reads++;return mode==='missing'?null:{durable:true,requestID:mode==='foreign'?id(99):s.requestID,householdID:p.householdID,planDigest:mode==='otherPlan'?'d'.repeat(64):kakeiFamilyPlanDigest(s,p),retainedFamilySnapshotDigest:p.retainedFamilySnapshotDigest};}};
  const verify=bindKakeiCommittedFamilyVerifier({...f.options,completion});
  assert.equal(await f.db.transaction(tx=>verify(tx,scope,new AbortController().signal)),true);assert.equal(reads,2);assert.equal(transfers,0);
  for(const value of ['missing','foreign','otherPlan']){mode=value;assert.equal(await f.db.transaction(tx=>verify(tx,scope,new AbortController().signal)),false);}
  assert.equal(transfers,0);assert.throws(()=>bindKakeiCommittedFamilyVerifier({...f.options,completion:{durable:true}}),/Private Kakei completion/);
 }finally{/* The next case rebuilds all fixture tables; suite cleanup closes the engine. */}
});
