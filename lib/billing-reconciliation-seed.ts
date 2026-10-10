import {billingProducts,normalizeAppleTransaction} from './billing';
import type {BillingEnvironment,VerifiedTransaction} from './billing';
type Arguments={target_user:string;verified_session:string;target_epoch:string;target_environment:BillingEnvironment};
type RPC=(name:'read_maintenance_reconciliation_seed',args:Arguments)=>Promise<{data:unknown;error:unknown}>;
/** The RPC returns an already-verified service-ledger record, not new client/Apple proof.
 * Call only after Auth.getUser verifies this exact user/session and live epoch binding.
 */
export async function readAuthoritativeReconciliationSeed(rpc:RPC,args:Arguments,bundleId:string):Promise<VerifiedTransaction|null>{
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!bundleId||!['Sandbox','Production'].includes(args.target_environment)||[args.target_user,args.verified_session,args.target_epoch].some(v=>!uuid.test(v)||v==='00000000-0000-0000-0000-000000000000'))throw new Error('Invalid recovery identity');
 const result=await rpc('read_maintenance_reconciliation_seed',args);
 if(result.error)throw new Error('Recovery seed unavailable');
 if(result.data===null)return null;
 return normalizeOwnedLedgerSeed(result.data,args.target_environment,args.target_epoch,bundleId);
}
/** Normalizes an already-verified service snapshot; never a signature verifier or authorization gate. */
export function normalizeOwnedLedgerSeed(data:unknown,environment:BillingEnvironment,epoch:string,bundleId:string):VerifiedTransaction{
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid recovery seed');
 const row=data as Record<string,unknown>;
 if(row.environment!==environment||typeof row.accountToken!=='string'||row.accountToken.toLowerCase()!==epoch.toLowerCase()||typeof row.productId!=='string'||!Object.hasOwn(billingProducts,row.productId))throw new Error('Recovery seed scope mismatch');
 const productId=row.productId as keyof typeof billingProducts;
 // Reuse field validation without pretending this mapping verifies a new signature.
 return normalizeAppleTransaction({bundleId,environment:row.environment,transactionId:row.transactionId,originalTransactionId:row.originalTransactionId,productId,appAccountToken:row.accountToken,signedDate:row.signedAt,purchaseDate:row.purchasedAt,expiresDate:row.expiresAt,revocationDate:row.revokedAt,isUpgraded:row.isUpgraded,type:billingProducts[productId].kind==='subscription'?'Auto-Renewable Subscription':'Consumable'},bundleId,environment);
}
