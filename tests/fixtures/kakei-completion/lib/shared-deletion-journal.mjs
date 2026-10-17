import {normalizeSharedDeletionScope,deletionStages} from './shared-deletion.mjs';
// Local development adapter. No connection constructor, URL or production grant.
// db must provide parameterized query and a pinned transactional connection.
const inventory=s=>({protocolVersion:s.protocolVersion,kind:s.kind,requestID:s.requestID,userID:s.userID,inventoryDigest:s.inventoryDigest,apps:s.apps});
const canonical=v=>JSON.stringify(inventory(normalizeSharedDeletionScope({...v,leaseToken:'00000000-0000-4000-8000-000000000001'})));
async function row(tx,s,lock=false) {
 const r=(await tx.query(`select *,lease_until>clock_timestamp() as lease_live from private.kb_shared_deletion_journal where request_id=$1 ${lock?'for update':''}`,[s.requestID])).rows[0];
 if(!r||canonical(r.scope)!==canonical(s))throw Error('Deletion journal scope mismatch');
 return r;
}
function leased(r,s) {
 if(r.status!=='processing'||r.lease_token!==s.leaseToken||r.lease_live!==true)throw Error('Deletion journal lease lost');
}
export async function requireDeletionLease(tx,value) {
 const scope=normalizeSharedDeletionScope(value);leased(await row(tx,scope,true),scope);return scope;
}
export async function requireDeletionPrerequisites(tx,value,stage) {
 const s=normalizeSharedDeletionScope(value),r=await row(tx,s,true);leased(r,s);
 const stages=deletionStages(s),index=stages.indexOf(stage);
 if(index<0)throw Error('Unknown deletion stage');
 for(const prior of stages.slice(0,index)) {
  const proof=r.receipts[prior];
  if(proof?.durable!==true||proof.stage!==prior||canonical(proof)!==canonical(s))throw Error('Deletion stage prerequisite mismatch');
 }
 return s;
}
const receipt=(s,stage)=>({durable:true,stage,...inventory(s)});
export function createDeletionJournal(db,handlers={}) {
 for(const hook of ['after-complete','after-cancel','reclaim-ready'])if(handlers[hook]!==undefined&&typeof handlers[hook]!=='function')throw Error('Invalid deletion transaction hook');
 return {
  async create(value) {
   const s=normalizeSharedDeletionScope(value);
   return db.transaction(async tx=>{
    await tx.query("insert into private.kb_shared_deletion_journal(request_id,user_id,scope,status) values($1,$2,$3,'requested') on conflict(request_id) do nothing",[s.requestID,s.userID,inventory(s)]);
    return (await row(tx,s,true)).status;
   });
  },
  async claim(value) {
   const s=normalizeSharedDeletionScope(value);
   return db.transaction(async tx=>{
    const r=await row(tx,s,true);
    if(r.status!=='requested'&&(r.status!=='processing'||(r.lease_live&&r.lease_token!==s.leaseToken)))return false;
    await tx.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '2 minutes' where request_id=$1",[s.requestID,s.leaseToken]);return true;
   });
  },
  // New processing starts only after ALL app bindings, current consents,
  // notification preparation and inventory are verified in this same tx.
  // No default predicate: callers must supply the reviewed production preflight.
  // This is intake transition only; expired-lease recovery remains separate.
  async claimPrepared(value) {
   const s=normalizeSharedDeletionScope(value);
   if(typeof handlers['claim-ready']!=='function')return false;
   const unconfirmed=new Error('Deletion preflight unconfirmed');
   try{return await db.transaction(async tx=>{
    const r=await row(tx,s,true);
    if(r.status!=='requested')return false;
    // A preparation handler may stage local records before a later gate fails.
    // Roll those changes back too; a false result must not commit partial setup.
    if(await handlers['claim-ready'](s,tx)!==true)throw unconfirmed;
    const current=await row(tx,s);
    if(current.status!=='requested')throw Error('Deletion intake changed during preflight');
    await tx.query("update private.kb_shared_deletion_journal set status='processing',lease_token=$2,lease_until=clock_timestamp()+interval '2 minutes' where request_id=$1",[s.requestID,s.leaseToken]);return true;
   });}catch(error){if(error===unconfirmed)return false;throw error;}
  },
  // Reviewed recovery path. The server hook must atomically rebind ALL app
  // leases, verify current fences/coverage and preserve immutable plans. No
  // remote side effects belong in this transaction. Legacy claim is a fixture
  // primitive; production composition must use this guarded path for takeover.
  async reclaimPrepared(value,previousLeaseToken) {
   const s=normalizeSharedDeletionScope(value);
   const previous=normalizeSharedDeletionScope({...s,leaseToken:previousLeaseToken});
   if(previous.leaseToken===s.leaseToken||typeof handlers['reclaim-ready']!=='function')return false;
   const unconfirmed=new Error('Deletion recovery preflight unconfirmed');
   try{return await db.transaction(async tx=>{
    const r=await row(tx,s,true),old=r.receipts._leaseRecovery;
    const retry=r.status==='processing'&&r.lease_live===true&&r.lease_token===s.leaseToken&&
     old?.durable===true&&old.previousLeaseToken===previous.leaseToken&&old.newLeaseToken===s.leaseToken&&canonical(old)===canonical(s);
    if(!retry&&(r.status!=='processing'||r.lease_live!==false||r.lease_token!==previous.leaseToken))return false;
    if(!retry)await tx.query("update private.kb_shared_deletion_journal set lease_token=$2,lease_until=clock_timestamp()+interval '2 minutes' where request_id=$1",[s.requestID,s.leaseToken]);
    if(await handlers['reclaim-ready'](s,previous,tx)!==true)throw unconfirmed;
    const after=await row(tx,s);leased(after,s);
    if(JSON.stringify(after.receipts)!==JSON.stringify(r.receipts))throw Error('Recovery mutated stage receipts');
    if(!retry)await tx.query('update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb where request_id=$1',[s.requestID,{_leaseRecovery:{durable:true,...inventory(s),previousLeaseToken:previous.leaseToken,newLeaseToken:s.leaseToken}}]);
    return true;
   });}catch(error){if(error===unconfirmed)return false;throw error;}
  },
  async cancel(value) {
   const s=normalizeSharedDeletionScope(value);
   return db.transaction(async tx=>{
    const r=await row(tx,s,true);if(r.status!=='requested')return false;
    await tx.query("update private.kb_shared_deletion_journal set status='cancelled' where request_id=$1",[s.requestID]);
    if(handlers['after-cancel']&&await handlers['after-cancel'](s,tx)!==true)throw Error('Deletion cancellation persistence unconfirmed');
    if((await row(tx,s)).status!=='cancelled')throw Error('Deletion cancellation changed');
    return true;
   });
  },
  async readReceipt(value,stage) {
   const s=normalizeSharedDeletionScope(value);if(!deletionStages(s).includes(stage))throw Error('Unknown deletion stage');
   return (await row(db,s)).receipts[stage]??null;
  },
  async leaseCurrent(value) {
   const s=normalizeSharedDeletionScope(value),r=await row(db,s);
   return r.status==='processing'&&r.lease_token===s.leaseToken&&r.lease_live===true;
  },
  async verifyCoverage(value) {
   const s=normalizeSharedDeletionScope(value);await row(db,s);
   return typeof handlers['verify-coverage']==='function'&&await handlers['verify-coverage'](s,db)===true;
  },
  async perform(value,stage) {
   const s=normalizeSharedDeletionScope(value),stages=deletionStages(s),index=stages.indexOf(stage);
   if(index<0||stages.some(k=>typeof handlers[k]!=='function'))throw Error('Missing stage adapter');
   return db.transaction(async tx=>{
    const r=await row(tx,s,true);leased(r,s);
    if(r.receipts[stage])return r.receipts[stage];
    if(stages.slice(0,index).some(k=>!r.receipts[k]))throw Error('Deletion stage prerequisite missing');
    // Handler must verify scope and real app prerequisites. DB mutations use tx.
    // Remote calls must reconcile lost acknowledgements; rollback cannot undo them.
    if(await handlers[stage](s,tx)!==true)throw Error('Deletion stage unconfirmed');
    leased(await row(tx,s),s);
    const result=receipt(s,stage);
    await tx.query("update private.kb_shared_deletion_journal set receipts=receipts||$2::jsonb,status=case when $3='complete' then 'complete' else status end,lease_token=case when $3='complete' then null else lease_token end,lease_until=case when $3='complete' then null else lease_until end where request_id=$1",[s.requestID,{[stage]:result},stage]);
    // Persist private completion side effects on the SAME connection, after
    // the final receipt is visible but before commit. No remote mail in this tx.
    if(stage==='complete'&&handlers['after-complete']){
     if(await handlers['after-complete'](s,tx)!==true)throw Error('Deletion completion persistence unconfirmed');
     const final=await row(tx,s),p=final.receipts.complete;
     if(final.status!=='complete'||p?.durable!==true||p.stage!=='complete'||canonical(p)!==canonical(s))throw Error('Deletion completion changed');
    }
    return result;
   });
  }
 };
}
