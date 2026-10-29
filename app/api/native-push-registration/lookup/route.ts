import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {nativePushDeployment,nativePushRegistrationResponse} from '@/lib/native-push-registration-service';
export const runtime='nodejs';
/** Body-only read avoids placing a device token in a URL. No registration write. */
export async function POST(request:Request){
 const config=nativePushDeployment(billingConfiguration(),process.env.OUCHI_NATIVE_PUSH_ENABLED,process.env.OUCHI_APNS_ENVIRONMENT);
 return nativePushRegistrationResponse(request,config,(value,signal)=>billingDatabase(value,signal),true);
}
