import 'server-only';
import {createClosureReadCustodyServer} from './closure-read-custody';
import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';
import {createPostgresClient} from './postgres-driver.mjs';
import {createDeletionReceiptGetUser} from './deletion-receipt-auth';
import type {closureReadCustodyDeployment} from './closure-read-custody-deployment';
/** Separate registrar/reader transports; never fall back to a service key. */
export function createClosureReadCustodyRuntime(config:NonNullable<ReturnType<typeof closureReadCustodyDeployment>>){
 const connect=createDedicatedPostgresConnection({createClient:bounds=>createPostgresClient({...config.database,...bounds})});
 return createClosureReadCustodyServer({enabled:true,action:config.action,connect,
  ...(config.action==='status'?{}:{getUser:createDeletionReceiptGetUser({supabaseURL:config.authURL,publishableKey:config.publishableKey})})});
}
