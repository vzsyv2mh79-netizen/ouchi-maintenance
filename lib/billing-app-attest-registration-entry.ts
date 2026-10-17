import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAttachmentFetch} from './attachment-fetch';
import {APP_ATTEST_PRIVATE_ROOT_PEM,APP_ATTEST_PUBLIC_ROOT_DER} from './billing-app-attest-roots';
import {attestRegistrationConfiguration,appAttestRegistrationResponse,type AttestRegistrationConfiguration} from './billing-app-attest-registration-service';
type Environment=Readonly<Record<string,string|undefined>>;
export function attestRegistrationDeployment(env:Environment){
 if(env.OUCHI_APP_ATTEST_REGISTRATION_ENABLED!=='true')return null;
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY,appID=env.OUCHI_APP_ATTEST_APP_ID,environment=env.OUCHI_APP_ATTEST_ENVIRONMENT;
 const categories=env.OUCHI_APP_ATTEST_VALIDATION_CATEGORIES,versions=env.OUCHI_APP_ATTEST_BUNDLE_VERSIONS;
 if(!url||!key||!appID||!['development','production'].includes(environment??'')||!categories||categories.length>128||!versions||versions.length>8192)return null;
 try{return attestRegistrationConfiguration({url,key,appID,attestEnvironment:environment as 'development'|'production',policy:{validationCategories:JSON.parse(categories),bundleVersions:JSON.parse(versions)},privateRootPEM:APP_ATTEST_PRIVATE_ROOT_PEM,publicRootDER:APP_ATTEST_PUBLIC_ROOT_DER},env.OUCHI_APP_ATTEST_REGISTRATION_ENABLED);}catch{return null;}
}
/** Both fixed routes remain disabled without complete explicit server settings.
 * No shared DB apply, environment write or current-device approval is performed.
 */
export async function appAttestRegistrationEntry(request:Request,operation:'challenge'|'commit',env:Environment,factory?:(config:Readonly<AttestRegistrationConfiguration>,signal:AbortSignal)=>SupabaseClient){
 return appAttestRegistrationResponse(request,operation,attestRegistrationDeployment(env),factory??((value,signal)=>createClient(value.url,value.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal,10000,65536)}})));
}
