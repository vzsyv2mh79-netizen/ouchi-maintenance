import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {nativePushDeployment,nativePushRegistrationResponse} from '@/lib/native-push-registration-service';
export const runtime='nodejs';
/** No registration or send is activated until explicit release configuration. */
async function handle(request:Request){
 const config=nativePushDeployment(billingConfiguration(),process.env.OUCHI_NATIVE_PUSH_ENABLED,process.env.OUCHI_APNS_ENVIRONMENT);
 return nativePushRegistrationResponse(request,config,(value,signal)=>billingDatabase(value,signal));
}
export const POST=handle;
export const DELETE=handle;
