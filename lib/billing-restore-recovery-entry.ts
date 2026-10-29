import {billingDatabase} from './billing-server';
import {restoreChallengeDeployment} from './billing-restore-challenge-entry';
import {restoreCommitResponse} from './billing-restore-commit-service';
import {restoreStatusResponse} from './billing-restore-status-service';
type Environment=Readonly<Record<string,string|undefined>>;
/** Fixed Sandbox routes remain disabled under the independent restore flag,
 * complete verification settings and disabled-by-default database policy. No
 * environment write, shared DB apply or Apple mutation is performed here.
 */
export async function restoreRecoveryEntry(request:Request,operation:'commit'|'status',env:Environment){
 const config=restoreChallengeDeployment(env);
 if(operation==='status')return restoreStatusResponse(request,config,(value,signal)=>billingDatabase(value.billing,signal));
 return restoreCommitResponse(request,config?{...config,buildPolicy:config.attest.policy}:null,(value,signal)=>billingDatabase(value.billing,signal));
}
