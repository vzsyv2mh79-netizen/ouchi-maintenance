import type {BillingEnvironment,VerifiedTransaction} from './billing';
export type VerifiedRenewal={environment:BillingEnvironment;originalTransactionId:string;productId:'ouchi.premium.monthly'|'ouchi.premium.annual';accountToken:string;signedAt:number;renewalDate:number;autoRenewStatus:0|1;isInBillingRetryPeriod?:boolean;gracePeriodExpiresAt?:number};
const subscriptions=['ouchi.premium.monthly','ouchi.premium.annual'];
/** Input must first pass Apple's verifyAndDecodeRenewalInfo. Pair with a verified transaction. */
export function normalizeVerifiedRenewal(value:Record<string,unknown>,transaction:VerifiedTransaction,environment:BillingEnvironment='Sandbox'):VerifiedRenewal{
 if(!['Sandbox','Production'].includes(environment)||value.environment!==environment||transaction.environment!==environment||!subscriptions.includes(transaction.productId)||value.productId!==transaction.productId||value.originalTransactionId!==transaction.originalTransactionId)throw new Error('Renewal scope mismatch');
 if(value.appAccountToken!==undefined&&(typeof value.appAccountToken!=='string'||value.appAccountToken.toLowerCase()!==transaction.accountToken.toLowerCase()))throw new Error('Renewal ownership mismatch');
 for(const key of ['signedDate','renewalDate'])if(typeof value[key]!=='number'||!Number.isSafeInteger(value[key])||(value[key] as number)<=0)throw new Error('Invalid renewal date');
 if(value.renewalDate!==transaction.expiresAt)throw new Error('Renewal must match verified current period');
 if(value.autoRenewStatus!==0&&value.autoRenewStatus!==1)throw new Error('Unknown renewal status');
 if(value.isInBillingRetryPeriod!==undefined&&typeof value.isInBillingRetryPeriod!=='boolean')throw new Error('Invalid billing retry flag');
 const grace=value.gracePeriodExpiresDate;
 if(grace!==undefined&&(typeof grace!=='number'||!Number.isSafeInteger(grace)||grace<=(value.renewalDate as number)))throw new Error('Invalid grace expiry');
 return {environment,originalTransactionId:transaction.originalTransactionId,productId:transaction.productId as VerifiedRenewal['productId'],accountToken:transaction.accountToken,signedAt:value.signedDate as number,renewalDate:value.renewalDate as number,autoRenewStatus:value.autoRenewStatus,
 ...(value.isInBillingRetryPeriod===undefined?{}:{isInBillingRetryPeriod:value.isInBillingRetryPeriod as boolean}),...(grace===undefined?{}:{gracePeriodExpiresAt:grace as number})};
}
/** Pure decision only; no database entitlement or production setting is changed. */
export function verifiedPeriodAccess(transaction:VerifiedTransaction,renewal:VerifiedRenewal|undefined,now:number,environment:BillingEnvironment='Sandbox'){
 if(!Number.isSafeInteger(now)||now<=0||transaction.environment!==environment||!subscriptions.includes(transaction.productId)||transaction.revokedAt||transaction.isUpgraded||transaction.purchasedAt>now)return {state:'free' as const};
 const expiry=transaction.expiresAt??0;
 // Turning off auto-renew never cuts short an already paid period.
 if(expiry>now)return {state:'paid' as const,expiresAt:expiry};
 if(renewal&&renewal.environment===environment&&renewal.accountToken===transaction.accountToken&&renewal.originalTransactionId===transaction.originalTransactionId&&renewal.productId===transaction.productId&&renewal.renewalDate===expiry&&renewal.isInBillingRetryPeriod===true&&(renewal.gracePeriodExpiresAt??0)>now)return {state:'grace' as const,expiresAt:renewal.gracePeriodExpiresAt!};
 // Retry by itself and future renewal dates do not fabricate a paid period.
 return {state:'free' as const};
}
