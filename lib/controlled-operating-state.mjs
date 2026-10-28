// Undeployed candidate. This verifies cooperative operating state only;
// it does not replace Auth, scope, trigger, role, retention or writer checks.
export const PROTOCOL='Kakei/shared-retirement/controlled-v1';
export const REVISION='20261029-operator-boundary-v1';
export const MAINTENANCE_KEY='kakei-controlled-retirement-maintenance-v1';
export const STATE_SQL=`select protocol,revision,epoch::text as epoch,status,verified_manifest,
 floor(extract(epoch from pg_catalog.pg_postmaster_start_time())*1000000)::text as boot,
 verified_until>pg_catalog.clock_timestamp() as live,not pg_catalog.pg_is_in_recovery() as primary,
 pg_catalog.pg_backend_pid() as pid,pg_catalog.txid_current()::text as xid,
 pg_catalog.current_setting('session_replication_role') as replication_mode,
 pg_catalog.current_setting('transaction_isolation') as isolation
 from private.kb_controlled_retirement_operation where singleton=true`;

export function createOperatingStateCheck({epoch,manifest,expectedBoot}){
 if(typeof expectedBoot!=='string'||! /^[1-9][0-9]{0,18}$/.test(expectedBoot)||typeof epoch!=='string'||! /^[1-9][0-9]*$/.test(epoch)||BigInt(epoch)>9223372036854775807n||
    typeof manifest!=='string'||! /^[a-f0-9]{64}$/.test(manifest))throw Error('Exact externally pinned operation epoch and manifest required');
 const bindings=new WeakMap();
 return Object.freeze({async bind(tx){
  if(!tx||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal)||tx.signal.aborted)return null;
  if(bindings.has(tx)){const prior=bindings.get(tx);return await prior.verify()?prior:null;}
  let valid=true,pin=null,busy=false;
  async function current(){
   if(!valid||busy||tx.signal.aborted){valid=false;return false;}
   busy=true;
   try{
    const result=await tx.query(STATE_SQL,[]),r=result?.rows?.[0];
    if(!valid||tx.signal.aborted||result?.rows?.length!==1||r.protocol!==PROTOCOL||r.revision!==REVISION||r.epoch!==epoch||
       r.boot!==expectedBoot||r.primary!==true||r.status!=='ready'||r.verified_manifest!==manifest||r.live!==true||r.replication_mode!=='origin'||r.isolation!=='read committed'||
       !Number.isSafeInteger(r.pid)||r.pid<=0||typeof r.xid!=='string'||! /^[1-9][0-9]*$/.test(r.xid)||
       (pin&&(pin.pid!==r.pid||pin.xid!==r.xid))){valid=false;return false;}
    pin??={pid:r.pid,xid:r.xid};return true;
   }catch{valid=false;return false;}finally{busy=false;}
  }
  // Poisoned bindings cannot be revived in the same owning transaction.
  const binding=Object.freeze({verify:current});bindings.set(tx,binding);
  if(!await current())return null;
  try{tx.beforeCommit('controlled-operation:'+epoch,current);}catch{valid=false;return null;}
  return binding;
 }});
}
