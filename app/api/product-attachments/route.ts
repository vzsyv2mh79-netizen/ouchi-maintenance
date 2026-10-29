import {createClient} from '@supabase/supabase-js';
import {billingConfiguration} from '@/lib/billing-server';
import {createAttachmentFetch} from '@/lib/attachment-fetch';
import {attachmentDeployment,attachmentServiceResponse} from '@/lib/attachment-service-handler';

export const runtime='nodejs';
/** Prepared, disabled by default. Enabling requires separate deployment approval and release checks. */
async function handle(request:Request){
 const config=attachmentDeployment(billingConfiguration(),process.env.OUCHI_ATTACHMENTS_ENABLED);
 return attachmentServiceResponse(request,config,(value,signal)=>createClient(value.url,value.key,{
  auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createAttachmentFetch(signal)},
 }));
}
export const GET=handle;
export const POST=handle;
export const DELETE=handle;
