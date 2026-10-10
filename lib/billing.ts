export const billingProducts = {
  'ouchi.premium.monthly': {kind: 'subscription', period: 'month'},
  'ouchi.premium.annual': {kind: 'subscription', period: 'year'},
  'ouchi.tip.small': {kind: 'tip'},
  'ouchi.tip.medium': {kind: 'tip'},
  'ouchi.tip.large': {kind: 'tip'},
} as const;
export type BillingProductId = keyof typeof billingProducts;
export type VerifiedTransaction = {
  transactionId: string; originalTransactionId: string; productId: BillingProductId;
  accountToken: string; environment: 'Sandbox'; signedAt: number; purchasedAt: number;
  expiresAt?: number; revokedAt?: number; isUpgraded?: boolean;
};
export function normalizeAppleTransaction(value: Record<string, unknown>, bundleId: string): VerifiedTransaction {
  const id = value.productId;
  if (value.bundleId !== bundleId || value.environment !== 'Sandbox' || typeof id !== 'string' || !Object.hasOwn(billingProducts,id)) throw new Error('Invalid transaction scope');
  const productId = id as BillingProductId;
  const expectedType=billingProducts[productId].kind==='subscription'?'Auto-Renewable Subscription':'Consumable';
  if(value.type!==expectedType)throw new Error('Invalid transaction product type');
  for (const key of ['transactionId','originalTransactionId','appAccountToken']) if(typeof value[key] !== 'string' || !value[key] || (value[key] as string).length > 128) throw new Error('Missing transaction identity');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.appAccountToken as string)) throw new Error('Invalid account token');
  for(const key of ['signedDate','purchaseDate']) if(!Number.isSafeInteger(value[key]) || (value[key] as number)<=0)throw new Error('Invalid date');
  if(value.isUpgraded!==undefined&&typeof value.isUpgraded!=='boolean')throw new Error('Invalid upgrade flag');
  const expiresAt = value.expiresDate as number|undefined, revokedAt=value.revocationDate as number|undefined;
  if(billingProducts[productId].kind==='subscription' && (!Number.isSafeInteger(expiresAt) || expiresAt! <= (value.purchaseDate as number)))throw new Error('Invalid expiry');
  if(revokedAt!==undefined && (!Number.isSafeInteger(revokedAt)||revokedAt<=0))throw new Error('Invalid revocation');
  return {transactionId:value.transactionId as string,originalTransactionId:value.originalTransactionId as string,productId,accountToken:(value.appAccountToken as string).toLowerCase(),environment:'Sandbox',signedAt:value.signedDate as number,purchasedAt:value.purchaseDate as number,expiresAt,revokedAt,...(value.isUpgraded===true?{isUpgraded:true}:{})};
}
export function entitlementFromTransactions(transactions: VerifiedTransaction[], now: number) {
  const latest = new Map<string,VerifiedTransaction>();
  for(const transaction of transactions){const prior=latest.get(transaction.transactionId);if(!prior || transaction.signedAt>prior.signedAt || (transaction.signedAt===prior.signedAt && (transaction.revokedAt || transaction.isUpgraded && !prior.revokedAt)))latest.set(transaction.transactionId,transaction);}
  const active=[...latest.values()].filter(t=>billingProducts[t.productId].kind==='subscription' && !t.revokedAt && !t.isUpgraded && t.purchasedAt<=now && (t.expiresAt??0)>now);
  active.sort((a,b)=>(b.expiresAt??0)-(a.expiresAt??0));
  return active.length ? {plan:'premium' as const,expiresAt:active[0].expiresAt!,productId:active[0].productId} : {plan:'free' as const};
}
export function canStartSubscription(transactions:VerifiedTransaction[],now:number){return entitlementFromTransactions(transactions,now).plan==='free';}
