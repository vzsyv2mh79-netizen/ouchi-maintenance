import {createHash,randomUUID} from 'node:crypto';
import {normalizeFamilyAttachmentPlan} from './family-attachment-handoff.mjs';
import {familyAttachmentInventoryDigest as digest} from './family-attachment-journal.mjs';
import {isFamilyAttachmentStoragePorts} from './family-attachment-storage.mjs';

const same=(a,b)=>digest(a)===digest(b);
const stable=s=>{const v={...s};delete v.nativeLease;return v;};
const normalized=raw=>normalizeFamilyAttachmentPlan({...raw,files:raw.files.map(({destination,...file})=>{void destination;return file;})});
const publicState=(plan,state)=>Object.freeze({state,planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex')});
/** Disabled private backend stage; never whole-account completion or Auth deletion.
 * Read authority must authenticate the exact controller/recovery scope independently
 * of the old user's session. Write authority must pin current controller/native
 * lease, cancellation, recipient enrollment and ALL namespace write capabilities.
 * SQL/Storage fences must remain held through COMMIT. No credentials or route.
 */
export function createFamilyAttachmentCompletion({transaction,verifyCommittedConsent,verifyReadAuthority,verifyWriteAuthority,storage}){
 if([transaction,verifyCommittedConsent,verifyReadAuthority,verifyWriteAuthority].some(f=>typeof f!=='function')||!isFamilyAttachmentStoragePorts(storage))throw Error('Trusted family completion providers required');
 async function consent(tx,scope,signal){signal.throwIfAborted();if(await verifyCommittedConsent(tx,scope,signal)!==true)throw Error('Committed family consents required');signal.throwIfAborted();}
 async function authority(verify,tx,scope,plan,signal){signal.throwIfAborted();if(await verify(tx,scope,plan,signal)!==true)throw Error('Current family completion authority required');signal.throwIfAborted();}
 async function journal(tx,scope,plan,signal){
  const row=(await tx.query('select * from maintenance_private.family_attachment_journals where request_id=$1 and home_id=$2',[plan.requestID,plan.homeID])).rows[0];
  signal.throwIfAborted();if(!row||row.state!=='planned'||!same(stable(row.scope),stable(scope))||!same(row.plan,plan)||row.plan_digest!==digest(plan)||row.inventory_digest!==digest(row.inventory))throw Error('Exact completion journal required');return row;
 }
 async function receipt(tx,scope,plan,j,signal){
  const row=(await tx.query('select * from maintenance_private.family_attachment_completion_receipts where request_id=$1 and home_id=$2',[plan.requestID,plan.homeID])).rows[0];signal.throwIfAborted();
  if(!row)return false;
  if(!same(stable(row.scope),stable(scope))||row.plan_digest!==j.plan_digest||row.inventory_digest!==j.inventory_digest)throw Error('Foreign family completion receipt');
  const proof=(await tx.query('select * from maintenance_private.family_attachment_completion_contexts where token=$1',[row.completion_token])).rows[0];signal.throwIfAborted();
  if(!proof||proof.request_id!==row.request_id||proof.home_id!==row.home_id||proof.activation_token!==row.activation_token||proof.plan_digest!==row.plan_digest||proof.inventory_digest!==row.inventory_digest||!same(proof.scope,row.scope)||!same(proof.proof,row.proof))throw Error('Exact durable completion context required');return true;
 }
 const status=async(input,raw,signal)=>{
  if(!(signal instanceof AbortSignal))throw Error('Cancellation required');signal.throwIfAborted();
  signal=AbortSignal.any([signal,AbortSignal.timeout(20000)]);
  const scope=structuredClone(input),plan=normalized(raw);
  return transaction(async tx=>{await authority(verifyReadAuthority,tx,scope,plan,signal);await consent(tx,scope,signal);const j=await journal(tx,scope,plan,signal);const done=await receipt(tx,scope,plan,j,signal);await authority(verifyReadAuthority,tx,scope,plan,signal);return publicState(plan,done?'complete':'activated');},signal);
 };
 const finish=async(input,raw,planDigest,signal)=>{
  if(!(signal instanceof AbortSignal))throw Error('Cancellation required');signal.throwIfAborted();
  signal=AbortSignal.any([signal,AbortSignal.timeout(35000)]);
  const scope=structuredClone(input),plan=normalized(raw);
  if(publicState(plan,'activated').planDigest!==planDigest)throw Error('Exact completion plan digest required');
  return transaction(async tx=>{
   if(typeof tx.beforeCommit!=='function')throw Error('Pinned completion commit checks required');
   for(const id of [...new Set([plan.ownerID,plan.recipientID,...plan.files.map(f=>f.source.userID)])].sort())await tx.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
   await tx.query('select id from public.homes where id=$1 for update',[plan.homeID]);
   await tx.query('select id from maintenance_private.account_deletion_requests where id=$1 for update',[scope.nativeRequestID]);
   await authority(verifyWriteAuthority,tx,scope,plan,signal);await consent(tx,scope,signal);
   const j=await journal(tx,scope,plan,signal);
   if(await receipt(tx,scope,plan,j,signal))return publicState(plan,'complete');
   const started=Date.now(),sources=[],destinations=[];
   for(const file of plan.files){
    await authority(verifyWriteAuthority,tx,scope,plan,signal);
    const blob=await storage.inspectDestination(scope,plan,file,signal);
    if(!(blob instanceof Blob)||blob.size!==file.size||blob.type!==file.mime)throw Error('Retained family destination required');
    const bytes=await blob.arrayBuffer();signal.throwIfAborted();
    if(bytes.byteLength!==file.size||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==file.sha256)throw Error('Exact retained family bytes required');
    destinations.push({id:file.id,path:file.destination.path,size:file.size,mime:file.mime,sha256:file.sha256});
    if(file.source.path!==file.destination.path){
     if(await storage.sourceAbsent(scope,plan,file,signal)!==true)throw Error('Definitive family source absence required');
     sources.push({id:file.id,path:file.source.path});
    }
    await authority(verifyWriteAuthority,tx,scope,plan,signal);
   }
   if(Date.now()-started>=30000)throw Error('Family completion inspection expired');
   await consent(tx,scope,signal);await authority(verifyWriteAuthority,tx,scope,plan,signal);
   const token=randomUUID(),proof={sources,destinations};
   await tx.query(`insert into maintenance_private.family_attachment_completion_contexts(token,request_id,home_id,scope,activation_token,plan_digest,inventory_digest,proof,backend_pid,transaction_id,expires_at)
    select $1,$2,$3,$4::jsonb,activation_token,$5,$6,$7::jsonb,pg_backend_pid(),txid_current(),least(clock_timestamp()+interval '5 seconds',$8::timestamptz)
    from maintenance_private.family_attachment_activation_receipts where request_id=$2 and home_id=$3`,[token,plan.requestID,plan.homeID,JSON.stringify(scope),j.plan_digest,j.inventory_digest,JSON.stringify(proof),new Date(started+30000)]);
   await tx.query("select set_config('maintenance.family_completion_context',$1,true)",[token]);
   await tx.query(`insert into maintenance_private.family_attachment_completion_receipts(request_id,home_id,scope,activation_token,completion_token,plan_digest,inventory_digest,proof)
    select request_id,home_id,scope,activation_token,token,plan_digest,inventory_digest,proof from maintenance_private.family_attachment_completion_contexts where token=$1`,[token]);
   tx.beforeCommit('family-completion:'+token,async()=>{
    if(Date.now()-started>=30000)throw Error('Family completion inspection expired');
    await consent(tx,scope,signal);await authority(verifyWriteAuthority,tx,scope,plan,signal);
    return await receipt(tx,scope,plan,j,signal);
   });
   if(!await receipt(tx,scope,plan,j,signal))throw Error('Family completion unconfirmed');return publicState(plan,'complete');
  },signal);
 };
 return Object.freeze({status,finish});
}
