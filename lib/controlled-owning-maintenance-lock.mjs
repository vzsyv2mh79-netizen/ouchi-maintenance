import {createOperatingStateCheck,MAINTENANCE_KEY} from './controlled-operating-state.mjs';
export const ACQUIRE_SQL='select pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended($1,0)) as acquired';
export const HELD_SQL=`select exists(select 1 from pg_catalog.pg_locks
 where pid=pg_catalog.pg_backend_pid() and locktype='advisory' and mode='ShareLock' and granted and objsubid=1
 and classid=((pg_catalog.hashtextextended($1,0)>>32)&4294967295)::oid
 and objid=(pg_catalog.hashtextextended($1,0)&4294967295)::oid) as held`;
// Candidate owning-transaction component only. The independent direct holder,
// actor locks, root scope, Auth guards and writer coverage remain mandatory.
// Transaction-level shared lock survives loss of the independent holder until
// this owning transaction ends. No manual unlock or nested BEGIN/COMMIT.
export function createOwningMaintenanceLock(expected){
 const state=createOperatingStateCheck(expected),bindings=new WeakMap();
 return Object.freeze({async bind(tx){
  if(!tx||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal)||tx.signal.aborted)return null;
  if(bindings.has(tx)){const b=bindings.get(tx);return await b.verify()?b:null;}
  let valid=true,checking=false,operation;
  async function verify(){
   if(!valid||checking||tx.signal.aborted){valid=false;return false;}
   checking=true;
   try{
    if(!operation||!await operation.verify())throw Error('Operation changed');
    const rows=(await tx.query(HELD_SQL,[MAINTENANCE_KEY])).rows;
    if(!valid||tx.signal.aborted||rows.length!==1||rows[0].held!==true||!await operation.verify())throw Error('Owning maintenance lock lost');
    if(!valid||tx.signal.aborted)return false;
    return true;
   }catch{valid=false;return false;}finally{checking=false;}
  }
  const binding=Object.freeze({verify});bindings.set(tx,binding);
  try{
   const rows=(await tx.query(ACQUIRE_SQL,[MAINTENANCE_KEY])).rows;
   if(tx.signal.aborted||rows.length!==1||rows[0].acquired!==true)throw Error('Maintenance in progress');
   operation=await state.bind(tx);
   if(!await verify())throw Error('Maintenance binding refused');
   tx.beforeCommit('controlled-maintenance-lock',verify);
   return binding;
  }catch{valid=false;return null;}
 }});
}
