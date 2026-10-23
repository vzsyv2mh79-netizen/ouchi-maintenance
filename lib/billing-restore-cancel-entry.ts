import {billingDatabase} from './billing-server';
import {restoreChallengeDeployment} from './billing-restore-challenge-entry';
import {restoreCancelResponse} from './billing-restore-cancel-service';
/** Same independent Sandbox-only restore deployment and DB policy as commit.
 * Does not dispatch Apple mutations, enable flags, or change paid rights. */
export async function restoreCancelEntry(request:Request,env:Readonly<Record<string,string|undefined>>){
 const config=restoreChallengeDeployment(env);
 return restoreCancelResponse(request,config,(value,signal)=>billingDatabase(value.billing,signal));
}
