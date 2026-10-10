import 'server-only';
import {SignedDataVerifier,Environment} from '@apple/app-store-server-library';
import {createClient} from '@supabase/supabase-js';
import {purchaseAccountAfterAuthVerification} from './billing-account';
import {normalizeAppleTransaction} from './billing';
export function billingConfiguration(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bundleId=process.env.APPLE_BUNDLE_ID,roots=process.env.APPLE_ROOT_CERTIFICATES_BASE64;
 if(process.env.BILLING_MODE!=='sandbox'||process.env.BILLING_ACCOUNT_BINDING_MODE!=='epoch'||!url||!key||!bundleId||!roots)return null;
 const certificates=roots.split(',').map(v=>Buffer.from(v,'base64'));if(certificates.some(c=>!c.length))return null;
 return {url,key,bundleId,certificates};
}
export function billingDatabase(config:NonNullable<ReturnType<typeof billingConfiguration>>){return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});}
export function billingVerifier(config:NonNullable<ReturnType<typeof billingConfiguration>>){return new SignedDataVerifier(config.certificates,true,Environment.SANDBOX,config.bundleId);}
export async function verifyBillingTransaction(jws:string,config:NonNullable<ReturnType<typeof billingConfiguration>>){
 const value=await billingVerifier(config).verifyAndDecodeTransaction(jws);
 return normalizeAppleTransaction(value as unknown as Record<string,unknown>,config.bundleId);
}
export async function readBillingBody(request:Request){
 if(Number(request.headers.get('content-length')??0)>65536)throw new Error('Payload too large');const body=await request.text();if(Buffer.byteLength(body)>65536)throw new Error('Payload too large');return JSON.parse(body) as Record<string,unknown>;
}

/** Auth.getUser must already have verified this exact bearer and user. */
export async function verifiedPurchaseAccount(db:ReturnType<typeof billingDatabase>,token:string,user:string){
 return purchaseAccountAfterAuthVerification(token,user,async(target,session)=>{
  const result=await db.rpc('current_maintenance_purchase_account',{target_user:target,verified_session:session});
  if(result.error)throw new Error('Purchase binding unavailable');return result.data;
 });
}
