import {createClient} from '@supabase/supabase-js';
import {createAttachmentFetch} from './attachment-fetch';
import type {EnrollmentConfiguration} from './account-enrollment-service';

/** Temporary, nonpersistent authentication. Logout survives cancellation of consent. */
export function createEnrollmentAuthClient(value:EnrollmentConfiguration,signal:AbortSignal){
 const normal=createAttachmentFetch(signal,10000,65536);
 const cleanup=createAttachmentFetch(undefined,10000,65536);
 const origin=new URL(value.url).origin;
 return createClient(value.url,value.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:async(input,init)=>{
   const target=new URL(input instanceof Request?input.url:input.toString());
   if(target.origin!==origin)throw Error('Enrollment Auth host unavailable');
   return (target.pathname==='/auth/v1/logout'?cleanup:normal)(input,init);
  }},
 });
}
