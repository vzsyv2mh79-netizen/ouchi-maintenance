import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {reminderDeployment,reminderServiceResponse} from '@/lib/reminder-service-handler';
export const runtime='nodejs';
/** Held by default. No scheduler, production gate or purchase is enabled here. */
async function handle(request:Request){
 const config=reminderDeployment(billingConfiguration(),process.env.OUCHI_REMINDER_SETTINGS_ENABLED);
 return reminderServiceResponse(request,config,(value,signal)=>billingDatabase(value,signal));
}
export const GET=handle;
export const PUT=handle;
