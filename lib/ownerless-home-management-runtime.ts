import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createOwnerlessHomeManagement} from './ownerless-home-management.mjs';
import {ownerlessHomeManagementResponse} from './ownerless-home-management-handler.mjs';
import {createHomeHandoffIdentityVerifier,createHomeHandoffInventoryIdentityVerifier} from './home-handoff-identity';
import {createDedicatedPostgresConnection} from './dedicated-postgres-connection.mjs';
import {createPostgresClient} from './postgres-driver.mjs';
import {createHomeManagementPrivateConnection} from './ownerless-home-management-private-connection';
import {createHomeHandoffAuthVersionReader} from './home-handoff-auth-version.mjs';
import {createStrictHomeHandoffPolicyReader} from './home-handoff-policy.mjs';
import {createAttachmentFetch} from './attachment-fetch';
import {closureReviewAuthFetch} from './account-closure-review-auth-fetch';
import type {ownerlessHomeManagementDeployment} from './ownerless-home-management-deployment';
type Configuration=NonNullable<ReturnType<typeof ownerlessHomeManagementDeployment>>;
/** Dormant composition. No role, grant, secret or live policy is created here.
 * The dedicated-role identity query/SQL privileges require isolated Auth tests
 * and explicit provisioning before deployment configuration can be enabled.
 */
export function createOwnerlessHomeManagementRuntime(config:Configuration){
 const connect=createHomeManagementPrivateConnection({connect:createDedicatedPostgresConnection({createClient:bounds=>createPostgresClient({...config.database,...bounds})})});
 const authClient=(signal:AbortSignal)=>createClient(config.authURL,config.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:closureReviewAuthFetch(config.authURL,signal)}
 });
 const version=createHomeHandoffAuthVersionReader({projectID:config.projectID,publishableKey:config.publishableKey,fetcher:createAttachmentFetch(undefined,3000,8192)});
 const policyReader=createStrictHomeHandoffPolicyReader({projectID:config.projectID,accessToken:config.accessToken,authVersionReader:version,fetcher:createAttachmentFetch(undefined,3000,65536)});
 const options={projectID:config.projectID,policyReader,getUser:(bearer:string,signal:AbortSignal)=>authClient(signal).auth.getUser(bearer)};
 const management=createOwnerlessHomeManagement({connect,verifyCurrent:createHomeHandoffIdentityVerifier(options),verifyIdentity:createHomeHandoffInventoryIdentityVerifier(options)});
 return (request:Request)=>ownerlessHomeManagementResponse(request,{origin:config.origin,management});
}
