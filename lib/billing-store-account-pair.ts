import {normalizeAppleTransaction,type BillingEnvironment} from './billing';

type Scope={bundleId:string;environment:BillingEnvironment;appAppleId?:number};
type Verifiers={verifyApp:(jws:string)=>Promise<Record<string,unknown>>;verifyTransaction:(jws:string)=>Promise<Record<string,unknown>>};
/** Pairing is NOT authorization to restore/rebind an erased account. Callers
 * still need fresh authenticated user/device proof, replay protection and an
 * approved ownership transfer policy. No storage or entitlement is changed.
 * Both verifier functions must validate Apple's JWS before returning payloads.
 */
export async function verifyStoreAccountPair(signedApp:string,signedTransaction:string,scope:Scope,verifiers:Verifiers,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<=0||!scope.bundleId||!['Sandbox','Production'].includes(scope.environment))throw Error('Invalid proof scope');
 if((scope.environment==='Production'||scope.appAppleId!==undefined)&&(!Number.isSafeInteger(scope.appAppleId)||(scope.appAppleId??0)<=0))throw Error('Missing app identifier');
 for(const jws of [signedApp,signedTransaction])if(typeof jws!=='string'||!jws||Buffer.byteLength(jws)>131072)throw Error('Invalid proof input');
 const app=await verifiers.verifyApp(signedApp);
 const payload=await verifiers.verifyTransaction(signedTransaction);
 if(!app||typeof app!=='object'||Array.isArray(app)||!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid verified payload');
 const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128&&!/\s/.test(value);
 if(app.bundleId!==scope.bundleId||app.receiptType!==scope.environment||!id(app.appTransactionId)||app.appTransactionId!==payload.appTransactionId)throw Error('Store account mismatch');
 if(scope.appAppleId!==undefined&&app.appAppleId!==scope.appAppleId)throw Error('App identifier mismatch');
 // Old valid signatures remain valid pairs; this is deliberately not a
 // freshness challenge, replay defense or a decision to grant entitlement.
 for(const timestamp of [app.receiptCreationDate,payload.signedDate])if(!Number.isSafeInteger(timestamp)||(timestamp as number)<=0||(timestamp as number)>now+60000)throw Error('Invalid proof time');
 const transaction=normalizeAppleTransaction(payload,scope.bundleId,scope.environment);
 if(payload.inAppOwnershipType!=='PURCHASED'||!['ouchi.premium.monthly','ouchi.premium.annual'].includes(transaction.productId))throw Error('Unsupported restore ownership');
 return {appTransactionId:app.appTransactionId,transaction};
}
