import {createClient} from '@supabase/supabase-js';
import {accountEnrollmentResponse,enrollmentConfiguration} from '@/lib/account-enrollment-service';
import {createAttachmentFetch} from '@/lib/attachment-fetch';
import {createEnrollmentAuthClient} from '@/lib/enrollment-auth-client';
export const runtime='nodejs';
async function handle(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const config=enrollmentConfiguration(url&&key&&publishableKey?{url,key,publishableKey}:null,process.env.OUCHI_EXPLICIT_ENROLLMENT_ENABLED);
 return accountEnrollmentResponse(request,config,{
  database:(value,signal)=>createClient(value.url,value.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal,10000,65536)}}),
  temporaryAuth:createEnrollmentAuthClient,
 });
}
export const GET=handle;
export const POST=handle;
