import {billingDatabase,sandboxRestoreAppleAdapter} from './billing-server';
import {restoreChallengeDeployment} from './billing-restore-challenge-entry';
import {restoreProcessResponse} from './billing-restore-process-service';
/** Independent restore/reconciliation flags, complete Sandbox verification and
 * signing config, and DB policy are required. This does not enable any setting. */
export async function restoreProcessEntry(request:Request,env:Readonly<Record<string,string|undefined>>){
 const config=env.BILLING_RECONCILIATION_ENABLED==='true'?restoreChallengeDeployment(env):null;
 return restoreProcessResponse(request,config,(value,signal)=>billingDatabase(value.billing,signal),
  (value,signal)=>sandboxRestoreAppleAdapter(value.billing,signal));
}
