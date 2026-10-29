import {billingConfiguration,billingDatabase} from '@/lib/billing-server';
import {nativePushDeployment} from '@/lib/native-push-registration-service';
import {nativeDeliveryService} from '@/lib/native-delivery-service';
import {runStoredNativeDeliverySweep} from '@/lib/native-delivery-sweep';
import {storedScopedNativePushBatch} from '@/lib/native-push-scoped-store';
import {createAPNsSender} from '@/lib/apns-sandbox-sender';
import {createAPNsTokenProvider} from '@/lib/apns-provider-token';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
/** Prepared route only. No new entry is added to vercel.json or any scheduler. */
export async function GET(request:Request){
 return nativeDeliveryService(request,process.env.CRON_SECRET,process.env.OUCHI_NATIVE_DELIVERY_ENABLED==='true'&&process.env.OUCHI_NATIVE_PUSH_ENABLED==='true',async signal=>{
  const config=nativePushDeployment(billingConfiguration(),'true',process.env.OUCHI_APNS_ENVIRONMENT);
  if(!config)throw Error('Delivery configuration unavailable');
  const scope={push:config.pushEnvironment,purchase:config.environment};
  const providerToken=createAPNsTokenProvider({keyId:process.env.OUCHI_APNS_KEY_ID??'',teamId:process.env.OUCHI_APNS_TEAM_ID??'',privateKey:process.env.OUCHI_APNS_PRIVATE_KEY??''});
  const send=createAPNsSender({environment:scope.push,providerToken});
  const db=billingDatabase(config,signal),receiptDb=billingDatabase(config);
  return runStoredNativeDeliverySweep(db,receiptDb,scope,current=>storedScopedNativePushBatch(db,scope,async(input,sendSignal)=>{await current();return send(input,sendSignal);},Date.now,receiptDb),signal);
 });
}
