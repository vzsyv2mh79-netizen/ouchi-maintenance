import {createClient} from '@supabase/supabase-js';
import {createBillingFetch} from '@/lib/billing-fetch';
import {handleReminderSettings} from '@/lib/reminder-settings';
import {storedReminderSettings} from '@/lib/reminder-settings-store';
export const runtime='nodejs';
async function handle(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(process.env.VERCEL_ENV==='production'||process.env.OUCHI_REMINDER_SETTINGS_TEST_MODE!=='true'||process.env.BILLING_MODE!=='sandbox'||process.env.BILLING_ACCOUNT_BINDING_MODE!=='epoch'||process.env.BILLING_STORAGE_MODE!=='verified-ledger'||!url||!key)return handleReminderSettings(request,null);
 try {
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(30000)]);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createBillingFetch(10000,signal)}});
 return await handleReminderSettings(request,storedReminderSettings(db));
 }catch{return handleReminderSettings(request,null);}
}
export const GET=handle;
export const PUT=handle;
