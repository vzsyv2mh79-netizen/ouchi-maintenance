import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {notificationChannelDeployment,notificationChannelResponse} from '@/lib/notification-channel-service';
export const runtime='nodejs';
/** Held independently of sale/premium gates; no scheduler or destination changes. */
async function handle(request:Request){
 const config=notificationChannelDeployment(billingConfiguration(),process.env.OUCHI_NOTIFICATION_CHANNELS_ENABLED);
 return notificationChannelResponse(request,config,(value,signal)=>billingDatabase(value,signal));
}
export const GET=handle;
export const PUT=handle;
