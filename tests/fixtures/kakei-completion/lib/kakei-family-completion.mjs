import {randomUUID} from 'node:crypto';
import {normalizeSharedDeletionScope} from './shared-deletion.mjs';
import {requireDeletionPrerequisites} from './shared-deletion-journal.mjs';
import {handoffPlanDigest,createHandoffConsentEvidenceVerifier} from './handoff-consent.mjs';
import {captureKakeiFamilySnapshot,kakeiFamilySnapshotDigest,retainedKakeiFamilySnapshot} from './kakei-family-snapshot.mjs';
const fixed=value=>{const s={...normalizeSharedDeletionScope(value)};delete s.leaseToken;return s;};
const same=(a,b)=>kakeiFamilySnapshotDigest(a)===kakeiFamilySnapshotDigest(b);
/** Undeployed private DB composition. Every call uses a pinned transaction.
 * transfer is the existing protected Kakei transfer, not an external operation.
 * beforeCommit must execute callbacks inside that transaction before COMMIT.
 * Historical verification requires current read authority but never authorizes
 * another transfer. It keeps original signed evidence after later revocation. */
export function createKakeiFamilyCompletion({key,transfer,loadRecords,verifyReadAuthority,writeFences,verifyEvidenceAt,verifyConsentsAtCommit=async()=>true}){
 if([transfer,loadRecords,verifyReadAuthority,writeFences].some(f=>typeof f!=='function'))throw Error('Complete protected family completion ports required');
 if((verifyEvidenceAt!==undefined&&typeof verifyEvidenceAt!=='function')||typeof verifyConsentsAtCommit!=='function')throw Error('Trusted completion consent verifiers required');
 const signed=verifyEvidenceAt??createHandoffConsentEvidenceVerifier({key});
 async function pinnedPlan(tx,s,p){
  const row=(await tx.query('select plan from private.kb_shared_handoff_plans where request_id=$1 and household_id=$2 for update',[s.requestID,p.householdID])).rows[0];
  if(!row||handoffPlanDigest(s,row.plan)!==handoffPlanDigest(s,p))throw Error('Exact immutable family plan required');
  return row.plan;
 }
 async function read(value,plan,tx){
  const s=normalizeSharedDeletionScope(value);
  if(await verifyReadAuthority(s,tx)!==true)throw Error('Current family read authority required');
  const p=await pinnedPlan(tx,s,plan);
  const r=(await tx.query('select * from private.kb_shared_family_completions where request_id=$1 and household_id=$2',[s.requestID,p.householdID])).rows[0];
  if(!r)return null;
  const c=(await tx.query('select * from private.kb_shared_family_completion_contexts where token=$1',[r.token])).rows[0];
  if(!c||!same(r,c)||!same(r.scope,fixed(s))||!same(r.plan,p)||r.plan_digest!==handoffPlanDigest(s,p)||!signed(s,p,r.proofs,Number(r.committed_at_ms)))throw Error('Exact committed signed family evidence required');
  const kept=retainedKakeiFamilySnapshot(await captureKakeiFamilySnapshot(s,p.householdID,tx),s);
  if(!same(kept,r.retained_snapshot)||kakeiFamilySnapshotDigest(kept)!==p.retainedFamilySnapshotDigest)return null;
  return Object.freeze({durable:true,requestID:s.requestID,householdID:p.householdID,planDigest:r.plan_digest,retainedFamilySnapshotDigest:p.retainedFamilySnapshotDigest});
 }
 async function complete(value,plan,tx){
  if(typeof tx?.beforeCommit!=='function')throw Error('Pinned family completion commit checks required');
  const s=await requireDeletionPrerequisites(tx,value,'handoff-family'),p=await pinnedPlan(tx,s,plan);
  const prior=await read(s,p,tx);if(prior)return prior;
  // A receipt with changed retained data is a refusal, never a new transfer.
  if((await tx.query('select token from private.kb_shared_family_completions where request_id=$1 and household_id=$2',[s.requestID,p.householdID])).rows.length)throw Error('Committed family content changed');
  const proofs=structuredClone(await loadRecords(s,p,tx));
  if(await writeFences(s,tx)!==true||await transfer(s,p,tx)!==true)throw Error('Protected family transfer required');
  const retained=retainedKakeiFamilySnapshot(await captureKakeiFamilySnapshot(s,p.householdID,tx),s);
  if(kakeiFamilySnapshotDigest(retained)!==p.retainedFamilySnapshotDigest)throw Error('Retained family content changed');
  const at=Number((await tx.query('select floor(extract(epoch from clock_timestamp())*1000)::bigint as at')).rows[0].at);
  if(!signed(s,p,proofs,at))throw Error('Signed consent invalid at completion');
  // Claims are decoded only after signature/shape verification. SQL uses the
  // earliest consent/re-auth deadline to refuse expiry between hook and COMMIT.
  const deadline=Math.min(...proofs.map(r=>{const c=JSON.parse(Buffer.from(r.token.split('.')[0],'base64url').toString('utf8'));return Math.min(c.expiresAt,c.authVerifiedAt+600000);}));
  const token=randomUUID();
  await tx.query(`insert into private.kb_shared_family_completion_contexts(token,request_id,household_id,scope,plan,plan_digest,proofs,retained_snapshot,committed_at_ms,lease_token,backend_pid,transaction_id,expires_at)
   values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10,pg_backend_pid(),txid_current(),least(clock_timestamp()+interval '5 seconds',$11::timestamptz))`,[token,s.requestID,p.householdID,JSON.stringify(fixed(s)),JSON.stringify(p),handoffPlanDigest(s,p),JSON.stringify(proofs),JSON.stringify(retained),at,s.leaseToken,new Date(deadline).toISOString()]);
  await tx.query("select set_config('kakei.family_completion_context',$1,true)",[token]);
  await tx.query('insert into private.kb_shared_family_completions select * from private.kb_shared_family_completion_contexts where token=$1',[token]);
  tx.beforeCommit('kakei-family-completion:'+token,async()=>{
   await requireDeletionPrerequisites(tx,s,'handoff-family');
   return await writeFences(s,tx)===true&&await verifyConsentsAtCommit(s,p,tx)===true&&same(await loadRecords(s,p,tx),proofs)&&signed(s,p,proofs,Date.now())&&(await read(s,p,tx))!==null;
  });
  return read(s,p,tx);
 }
 return Object.freeze({complete,read});
}
