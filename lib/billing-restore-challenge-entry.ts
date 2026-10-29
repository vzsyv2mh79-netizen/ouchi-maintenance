import {billingConfiguration,billingDatabase} from './billing-server';
import {attestRegistrationDeployment} from './billing-app-attest-registration-entry';
import {restoreChallengeResponse} from './billing-restore-challenge-service';
type Environment=Readonly<Record<string,string|undefined>>;
/** Independent explicit Sandbox restore flag plus complete existing verification
 * settings are required. No environment settings or DB policy are changed here.
 */
export function restoreChallengeDeployment(env:Environment){
 if(env.BILLING_SANDBOX_RESTORE_TRANSFER_ENABLED!=='true')return null;
 const billing=billingConfiguration(),attest=attestRegistrationDeployment(env);
 if(!billing||billing.environment!=='Sandbox'||billing.storage!=='verified-ledger'||!attest||attest.appID.split('.').slice(1).join('.')!==billing.bundleId)return null;
 return {billing,attest};
}
export async function restoreChallengeEntry(request:Request,env:Environment){
 return restoreChallengeResponse(request,restoreChallengeDeployment(env),(config,signal)=>billingDatabase(config.billing,signal));
}
