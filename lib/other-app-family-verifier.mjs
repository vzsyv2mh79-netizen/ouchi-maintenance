import {normalizeSharedDeletionScope} from './shared-deletion-protocol.mjs';
/** Strict contribution registry, no inferred empty app coverage. The controller
 * verifier must authenticate CURRENT full immutable app inventory/fences on tx.
 * Every non-maintenance app supplies its own retained-family + committed-proof
 * verifier. Unknown/unconfigured apps block the global family checkpoint.
 */
export function createOtherAppFamilyVerifier({verifyControllerCoverage,verifiers}){
 if(typeof verifyControllerCoverage!=='function'||!verifiers||typeof verifiers!=='object')throw Error('Trusted other-app coverage providers required');
 const entries=Object.entries(verifiers);
 if(entries.some(([app,verify])=>!/^[-a-z0-9]{1,40}$/.test(app)||app==='ouchi-maintenance'||typeof verify!=='function'))throw Error('Explicit other-app family verifiers required');
 const fixed=new Map(entries);
 return async(tx,value,signal)=>{
  try{
   if(!(signal instanceof AbortSignal))return false;signal.throwIfAborted();
   const scope=normalizeSharedDeletionScope(value);
   if(await verifyControllerCoverage(tx,scope,signal)!==true)return false;signal.throwIfAborted();
   for(const app of scope.apps.filter(a=>a.app!=='ouchi-maintenance')){
    const verify=fixed.get(app.app);if(!verify||await verify(tx,scope,signal)!==true)return false;signal.throwIfAborted();
   }
   if(await verifyControllerCoverage(tx,scope,signal)!==true)return false;signal.throwIfAborted();return true;
  }catch{return false;}
 };
}
