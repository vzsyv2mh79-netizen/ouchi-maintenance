import type {BillingEnvironment} from './billing';
/** Only after Apple's verifyAndDecodeRenewalInfo. This is a lookup, never a paid right. */
export function verifiedRenewalLocator(value:Record<string,unknown>,environment:BillingEnvironment){
 if(!['Sandbox','Production'].includes(environment)||value.environment!==environment||typeof value.originalTransactionId!=='string'||!/^[0-9]{1,128}$/.test(value.originalTransactionId)||!['ouchi.premium.monthly','ouchi.premium.annual'].includes(value.productId as string)||typeof value.signedDate!=='number'||!Number.isSafeInteger(value.signedDate)||value.signedDate<=0)throw new Error('Invalid verified renewal locator');
 if(value.appAccountToken!==undefined&&(typeof value.appAccountToken!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.appAccountToken)||value.appAccountToken==='00000000-0000-0000-0000-000000000000'))throw new Error('Invalid renewal account');
 for(const key of ['renewalDate'])if(typeof value[key]!=='number'||!Number.isSafeInteger(value[key])||(value[key] as number)<=0)throw new Error('Invalid renewal date');
 if(value.autoRenewStatus!==0&&value.autoRenewStatus!==1)throw new Error('Invalid renewal status');
 if(value.isInBillingRetryPeriod!==undefined&&typeof value.isInBillingRetryPeriod!=='boolean')throw new Error('Invalid retry status');
 const grace=value.gracePeriodExpiresDate;
 if(grace!==undefined&&(typeof grace!=='number'||!Number.isSafeInteger(grace)||grace<=(value.renewalDate as number)))throw new Error('Invalid grace expiry');
 return {environment,originalTransactionId:value.originalTransactionId};
}
