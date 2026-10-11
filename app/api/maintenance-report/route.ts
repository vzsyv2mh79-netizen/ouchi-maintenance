import {createClient} from '@supabase/supabase-js';
import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {createAttachmentFetch} from '@/lib/attachment-fetch';
import {reportDeployment,reportServiceResponse} from '@/lib/report-service-handler';
export const runtime='nodejs';
/** Held by default; no production flag is enabled by adding this route. */
export async function GET(request:Request){
 const config=reportDeployment(billingConfiguration(),process.env.OUCHI_REPORTS_ENABLED,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
 return reportServiceResponse(request,config,{
  service:(value,signal)=>billingDatabase(value,signal),
  caller:(value,token,signal)=>createClient(value.url,value.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token},fetch:createAttachmentFetch(signal)}}),
 });
}
