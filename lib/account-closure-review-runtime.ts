import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createAccountClosureReviewServer} from './account-closure-review-server';
import {createAccountClosureReviewPrivateTransactions} from './account-closure-review-private-transactions';
import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';
import {createPostgresClient} from './postgres-driver.mjs';
import {createClosureReauthenticationProducer} from './closure-reauth-producer.mjs';
import {createHomeHandoffAuthVersionReader} from './home-handoff-auth-version.mjs';
import {createStrictHomeHandoffPolicyReader} from './home-handoff-policy.mjs';
import {createAttachmentFetch} from './attachment-fetch';
import {closureReviewAuthFetch} from './account-closure-review-auth-fetch';
import type {accountClosureReviewDeployment} from './account-closure-review-deployment';
type Configuration=NonNullable<ReturnType<typeof accountClosureReviewDeployment>>;

/** Real SDK composition, still gated by explicit deployment input. No schema,
 * grant, credential or recovery schedule is provisioned here. Dedicated role
 * privileges, managed Auth trigger compatibility and retention require review.
 */
export function createAccountClosureReviewRuntime(config:Configuration){
 const connect=createDedicatedPostgresConnection({createClient:bounds=>createPostgresClient({...config.database,...bounds})});
 const transactions=createAccountClosureReviewPrivateTransactions({connect});
 const authClient=(signal:AbortSignal,agent?:string)=>createClient(config.authURL,config.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:closureReviewAuthFetch(config.authURL,signal,agent)}
 });
 const version=createHomeHandoffAuthVersionReader({projectID:config.projectID,publishableKey:config.publishableKey,fetcher:createAttachmentFetch(undefined,3000,8192)});
 const policyReader=createStrictHomeHandoffPolicyReader({projectID:config.projectID,accessToken:config.accessToken,authVersionReader:version,fetcher:createAttachmentFetch(undefined,3000,65536)});
 const authenticate=createClosureReauthenticationProducer({transactions,clientForRequest:({signal,agent})=>authClient(signal,agent)});
 return createAccountClosureReviewServer({enabled:true,transactions,authenticate,
  identityOptions:{projectID:config.projectID,policyReader,getUser:(bearer,signal)=>authClient(signal).auth.getUser(bearer)}});
}
