import 'server-only';
import {SignedDataVerifier,Environment,AppStoreServerAPIClient,GetTransactionHistoryVersion} from '@apple/app-store-server-library';
import {createClient} from '@supabase/supabase-js';
import {purchaseAccountAfterAuthVerification} from './billing-account';
import {normalizeAppleTransaction} from './billing';
import {normalizeVerifiedRenewal} from './billing-renewal';
import type {VerifiedRenewal} from './billing-renewal';
import {createHash,createPrivateKey} from 'node:crypto';
import {reconcilePurchaseHistory} from './billing-reconciliation';
import {readAuthoritativeReconciliationSeed} from './billing-reconciliation-seed';
import type {BillingEnvironment,VerifiedTransaction} from './billing';
import {verifyAndPersistLedgerTransaction} from './billing-ledger';
import {readVerifiedLedgerEntitlement} from './billing-ledger-entitlement';
import {sessionAfterAuthVerification} from './verified-app-session';
export function billingConfiguration(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bundleId=process.env.APPLE_BUNDLE_ID,roots=process.env.APPLE_ROOT_CERTIFICATES_BASE64;
 const mode=process.env.BILLING_MODE;
 if(!['sandbox','production'].includes(mode??'')||process.env.BILLING_ACCOUNT_BINDING_MODE!=='epoch'||!url||!key||!bundleId||!roots)return null;
 const certificates=roots.split(',').map(v=>Buffer.from(v,'base64'));if(certificates.some(c=>!c.length))return null;
 const storage=process.env.BILLING_STORAGE_MODE;
 if(storage!==undefined&&storage!=='sandbox-legacy'&&storage!=='verified-ledger')return null;
 const environment:BillingEnvironment=mode==='production'?'Production':'Sandbox';
 let appAppleId:number|undefined;
 if(environment==='Production'){
  const identifier=process.env.APPLE_APP_ID;
  if(process.env.BILLING_PRODUCTION_VERIFICATION_ENABLED!=='true'||storage!=='verified-ledger'||!identifier||!/^[1-9][0-9]*$/.test(identifier))return null;
  appAppleId=Number(identifier);if(!Number.isSafeInteger(appAppleId))return null;
 }
 return {url,key,bundleId,certificates,storage:storage??'sandbox-legacy',environment,appAppleId};
}
export function billingDatabase(config:NonNullable<ReturnType<typeof billingConfiguration>>){return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});}
export function billingVerifier(config:NonNullable<ReturnType<typeof billingConfiguration>>){return new SignedDataVerifier(config.certificates,true,config.environment==='Production'?Environment.PRODUCTION:Environment.SANDBOX,config.bundleId,config.appAppleId);}
export async function verifyBillingTransaction(jws:string,config:NonNullable<ReturnType<typeof billingConfiguration>>){
 const value=await billingVerifier(config).verifyAndDecodeTransaction(jws);
 return normalizeAppleTransaction(value as unknown as Record<string,unknown>,config.bundleId,config.environment);
}
/** No renewal flag is trusted before Apple verifies this separate signed payload. */
export async function verifyBillingRenewal(jws:string,transaction:VerifiedTransaction,config:NonNullable<ReturnType<typeof billingConfiguration>>){
 const value=await billingVerifier(config).verifyAndDecodeRenewalInfo(jws);
 return normalizeVerifiedRenewal(value as unknown as Record<string,unknown>,transaction,config.environment);
}
export {readBillingBody} from './billing-body';

/** transaction must be the result of verifyBillingTransaction for this exact JWS. */
export async function persistBillingTransaction(db:ReturnType<typeof billingDatabase>,config:NonNullable<ReturnType<typeof billingConfiguration>>,signedTransaction:string,transaction:VerifiedTransaction){
 if(config.storage==='verified-ledger'){
  await verifyAndPersistLedgerTransaction(signedTransaction,{verify:async()=>transaction,persist:async(name,args)=>await db.rpc(name,args)});
 }else{
  const result=await db.rpc('apply_ouchi_sandbox_transaction',{payload:transaction});if(result.error)throw new Error('Persistence unavailable');
 }
}
/** renewal must come from verifyBillingRenewal for this exact signed input and paired transaction. */
export async function persistBillingRenewal(db:ReturnType<typeof billingDatabase>,config:NonNullable<ReturnType<typeof billingConfiguration>>,signedRenewal:string,renewal:VerifiedRenewal){
 if(config.storage!=='verified-ledger'||!signedRenewal||Buffer.byteLength(signedRenewal)>131072||renewal.environment!==config.environment)throw new Error('Renewal storage unavailable');
 const result=await db.rpc('apply_maintenance_verified_renewal',{payload:renewal,proof_sha256:createHash('sha256').update(signedRenewal).digest('hex')});
 if(result.error||typeof result.data!=='string'||!['inserted','updated','ignored'].includes(result.data))throw new Error('Renewal persistence unavailable');
}
/** Caller already verified this exact bearer with Auth.getUser. */
export async function ledgerEntitlementAfterAuth(db:ReturnType<typeof billingDatabase>,token:string,user:string,epoch:string,environment:BillingEnvironment='Sandbox'){
 const identity=sessionAfterAuthVerification(token,user);if(!identity)throw new Error('Session unavailable');
 return readVerifiedLedgerEntitlement(async(name,args)=>await db.rpc(name,args),{
  target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_environment:environment,
 });
}

/** Auth.getUser must already have verified this exact bearer and user. */
export async function verifiedPurchaseAccount(db:ReturnType<typeof billingDatabase>,token:string,user:string){
 return purchaseAccountAfterAuthVerification(token,user,async(target,session)=>{
  const result=await db.rpc('current_maintenance_purchase_account',{target_user:target,verified_session:session});
  if(result.error)throw new Error('Purchase binding unavailable');return result.data;
 });
}

/** Explicitly opt-in, read-only Apple API client. Missing signing setup keeps recovery disabled. */
export function billingReconciliationClient(config:NonNullable<ReturnType<typeof billingConfiguration>>){
 if(process.env.BILLING_RECONCILIATION_ENABLED!=='true'||config.storage!=='verified-ledger'||!['Sandbox','Production'].includes(config.environment)||!config.bundleId)return null;
 const key=process.env.APPLE_IAP_PRIVATE_KEY_BASE64,keyId=process.env.APPLE_IAP_KEY_ID,issuerId=process.env.APPLE_IAP_ISSUER_ID;
 if(!key||key.length>16384||!keyId||!/^[A-Z0-9]{10}$/.test(keyId)||!issuerId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId))return null;
 const signingKey=Buffer.from(key,'base64').toString('utf8');
 if(!signingKey.startsWith('-----BEGIN PRIVATE KEY-----')||!signingKey.trimEnd().endsWith('-----END PRIVATE KEY-----'))return null;
 try{const parsed=createPrivateKey(signingKey);if(parsed.asymmetricKeyType!=='ec'||parsed.asymmetricKeyDetails?.namedCurve!=='prime256v1')return null;}catch{return null;}
 return new AppStoreServerAPIClient(signingKey,keyId,issuerId,config.bundleId,config.environment==='Production'?Environment.PRODUCTION:Environment.SANDBOX);
}
/** Internal worker adapter. Caller must obtain seed from service ledger and scope from live Auth/epoch validation. */
export async function reconcileBillingSeed(db:ReturnType<typeof billingDatabase>,config:NonNullable<ReturnType<typeof billingConfiguration>>,seed:VerifiedTransaction,expectedEpoch:string,revision?:string,signal?:AbortSignal){
 const client=billingReconciliationClient(config);if(!client)throw new Error('Reconciliation disabled');
 return reconcilePurchaseHistory(seed,{environment:config.environment,bundleId:config.bundleId,accountToken:expectedEpoch,appAppleId:config.appAppleId},{
  history:async(transactionId,cursor)=>await client.getTransactionHistory(transactionId,cursor,{},GetTransactionHistoryVersion.V2) as unknown as Record<string,unknown>,
  statuses:async(transactionId)=>await client.getAllSubscriptionStatuses(transactionId) as unknown as Record<string,unknown>,
  verifyTransaction:async(jws)=>await verifyBillingTransaction(jws,config),
  verifyRenewal:async(jws,transaction)=>await verifyBillingRenewal(jws,transaction,config),
  saveTransaction:async(jws,transaction)=>await persistBillingTransaction(db,config,jws,transaction),
  saveRenewal:async(jws,renewal)=>await persistBillingRenewal(db,config,jws,renewal),
 },{revision,signal});
}

/** Exact bearer/user already verified through Auth.getUser; SQL also rechecks the live session/epoch. */
export async function reconciliationSeedAfterAuth(db:ReturnType<typeof billingDatabase>,config:NonNullable<ReturnType<typeof billingConfiguration>>,token:string,user:string,epoch:string){
 if(config.storage!=='verified-ledger')throw new Error('Recovery storage unavailable');
 const identity=sessionAfterAuthVerification(token,user);if(!identity)throw new Error('Recovery session unavailable');
 return readAuthoritativeReconciliationSeed(async(name,args)=>await db.rpc(name,args),{target_user:identity.userID,verified_session:identity.sessionID,target_epoch:epoch,target_environment:config.environment},config.bundleId);
}
