import {billingProducts} from './billing';
import type {BillingEnvironment,VerifiedTransaction} from './billing';
import type {VerifiedRenewal} from './billing-renewal';
type Scope={environment:BillingEnvironment;bundleId:string;accountToken:string;appAppleId?:number};
type Dependencies={
 history:(transactionId:string,revision:string|null)=>Promise<Record<string,unknown>>;
 statuses:(transactionId:string)=>Promise<Record<string,unknown>>;
 verifyTransaction:(jws:string)=>Promise<VerifiedTransaction>;
 verifyRenewal:(jws:string,transaction:VerifiedTransaction)=>Promise<VerifiedRenewal>;
 saveTransaction:(jws:string,transaction:VerifiedTransaction)=>Promise<void>;
 saveRenewal:(jws:string,renewal:VerifiedRenewal)=>Promise<void>;
};
function proof(value:unknown):string{
 if(typeof value!=='string'||!value||Buffer.byteLength(value)>131072)throw new Error('Invalid history proof');return value;
}
function scopedResponse(value:Record<string,unknown>,scope:Scope){
 if(value.environment!==scope.environment||value.bundleId!==scope.bundleId||(scope.environment==='Production'&&value.appAppleId!==scope.appAppleId))throw new Error('History response scope mismatch');
}
/** Internal worker only: seed must be selected from the service ledger, never a client-selected ID.
 * Caller must bind scope to a current authenticated app epoch before scheduling this work.
 * Returned cursor advances only after durable saves; complete=false must remain queued.
 */
export async function reconcilePurchaseHistory(seed:VerifiedTransaction,scope:Scope,deps:Dependencies,options:{revision?:string;maxPages?:number}={}){
 const maxPages=options.maxPages??25;
 if(!['Sandbox','Production'].includes(scope.environment)||!scope.bundleId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.accountToken)||scope.accountToken==='00000000-0000-0000-0000-000000000000'||seed.accountToken!==scope.accountToken||seed.environment!==scope.environment||!Object.hasOwn(billingProducts,seed.productId)||!seed.transactionId||seed.transactionId.length>128||!Number.isInteger(maxPages)||maxPages<1||maxPages>50||(scope.environment==='Production'&&(!Number.isSafeInteger(scope.appAppleId)||scope.appAppleId!<=0)))throw new Error('Invalid reconciliation scope');
 let revision=options.revision??null,transactions=0,renewals=0,ignoredOtherAccounts=0;
 if(revision!==null&&(typeof revision!=='string'||!revision||revision.length>4096))throw new Error('Invalid history cursor');
 const seen=new Set<string>(revision===null?[]:[revision]);
 for(let page=0;page<maxPages;page++){
  const response=await deps.history(seed.transactionId,revision);scopedResponse(response,scope);
  const rows=response.signedTransactions;
  if(typeof response.hasMore!=='boolean'||!Array.isArray(rows)||rows.length>20)throw new Error('Invalid history page');
  const next=response.revision;
  if(response.hasMore&&(typeof next!=='string'||!next||next.length>4096||seen.has(next)))throw new Error('History cursor did not advance');
  // Verify the entire page before performing any writes from it.
  const verified: {jws:string;transaction:VerifiedTransaction}[]=[];
  for(const value of rows){const jws=proof(value),transaction=await deps.verifyTransaction(jws);
   if(transaction.environment!==scope.environment)throw new Error('Verified history environment mismatch');
   if(transaction.accountToken!==scope.accountToken){ignoredOtherAccounts++;continue;}
   verified.push({jws,transaction});
  }
  for(const {jws,transaction} of verified){await deps.saveTransaction(jws,transaction);transactions++;}
  if(!response.hasMore){
   if(billingProducts[seed.productId].kind==='subscription'){
    const status=await deps.statuses(seed.transactionId);scopedResponse(status,scope);
    if(!Array.isArray(status.data)||status.data.length>100)throw new Error('Invalid subscription groups');
    let count=0;
    for(const group of status.data){
     if(!group||typeof group!=='object'||!Array.isArray(group.lastTransactions))throw new Error('Invalid subscription group');
     for(const item of group.lastTransactions){
      if(++count>500||!item||typeof item!=='object')throw new Error('Invalid subscription item');
      const jws=proof(item.signedTransactionInfo),transaction=await deps.verifyTransaction(jws);
      if(transaction.environment!==scope.environment||item.originalTransactionId!==transaction.originalTransactionId)throw new Error('Subscription identity mismatch');
      if(transaction.accountToken!==scope.accountToken){ignoredOtherAccounts++;continue;}
      const signedRenewal=proof(item.signedRenewalInfo),renewal=await deps.verifyRenewal(signedRenewal,transaction);
      if(renewal.environment!==scope.environment||renewal.accountToken!==scope.accountToken||renewal.originalTransactionId!==transaction.originalTransactionId)throw new Error('Verified renewal ownership mismatch');
      // Raw API status flags never grant access. Only verified transaction/renewal saves do.
      await deps.saveTransaction(jws,transaction);transactions++;
      await deps.saveRenewal(signedRenewal,renewal);renewals++;
     }
    }
   }
   return {complete:true as const,revision:null,transactions,renewals,ignoredOtherAccounts};
  }
  revision=next as string;seen.add(revision);
 }
 return {complete:false as const,revision,transactions,renewals,ignoredOtherAccounts};
}
