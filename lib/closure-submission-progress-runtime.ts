import 'server-only';
import {createClosureSubmissionProgressServer} from './closure-submission-progress';
import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';
import {createPostgresClient} from './postgres-driver.mjs';
import {createDeletionReceiptGetUser} from './deletion-receipt-auth';
import type {closureSubmissionProgressDeployment} from './closure-submission-progress-deployment';
/** No credential/grant discovery, mutation or active-enrollment gate. */
export function createClosureSubmissionProgressRuntime(config:NonNullable<ReturnType<typeof closureSubmissionProgressDeployment>>){
 const connect=createDedicatedPostgresConnection({createClient:bounds=>createPostgresClient({...config.database,...bounds})});
 return createClosureSubmissionProgressServer({enabled:true,connect,getUser:createDeletionReceiptGetUser({supabaseURL:config.authURL,publishableKey:config.publishableKey})});
}
