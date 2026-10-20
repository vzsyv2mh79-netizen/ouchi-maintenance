import {createOuchiFamilyPreparationGeneration,FAMILY_GENERATION_RESERVE_SQL,FAMILY_GENERATION_CANCEL_SQL,FAMILY_GENERATION_STATE_SQL} from './ouchi-family-preparation-generation.mjs';
export const FAMILY_NATIVE_PREPARE_SQL='select maintenance_private.prepare_family_native_generation($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb) as ok';
export const FAMILY_NATIVE_CANCEL_SQL='select maintenance_private.cancel_family_native_generation($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb) as ok';
export const FAMILY_NATIVE_STATE_SQL='select * from maintenance_private.family_native_generation_state($1::uuid,$2::jsonb,$3::uuid,$4::uuid,$5::jsonb,$6::text)';
/** Fixed SQL adaptation of the checked generation transport. No arbitrary
 * query/identity callback. Empty-file family prep leaves canonical captured=false;
 * this does not issue AAL2 originals or authorize claim/handoff/erasure. */
export function createOuchiFamilyNativePreparation(options){
 const base=createOuchiFamilyPreparationGeneration(options),adapters=new WeakMap();
 const adapt=tx=>{if(!tx||typeof tx!=='object'||typeof tx.query!=='function'||typeof tx.beforeCommit!=='function'||!(tx.signal instanceof AbortSignal))throw Error('Checked family native transaction required');let a=adapters.get(tx);if(a)return a;
  a={signal:tx.signal,beforeCommit:typeof tx.beforeCommit==='function'?tx.beforeCommit.bind(tx):undefined,query:async(sql,args)=>{
   if(sql===FAMILY_GENERATION_RESERVE_SQL)return tx.query(FAMILY_NATIVE_PREPARE_SQL,args);
   if(sql===FAMILY_GENERATION_CANCEL_SQL)return tx.query(FAMILY_NATIVE_CANCEL_SQL,args);
   if(sql===FAMILY_GENERATION_STATE_SQL)return tx.query(FAMILY_NATIVE_STATE_SQL,[...args.slice(0,5),args[5]==='reserved'?'prepared':args[5]]);
   throw Error('Unexpected family native query');
  }};adapters.set(tx,a);return a;
 };
 return Object.freeze({prepare:(s,tx)=>base.reserve(s,adapt(tx)),cancelRequested:(s,tx)=>base.cancelRequested(s,adapt(tx))});
}
