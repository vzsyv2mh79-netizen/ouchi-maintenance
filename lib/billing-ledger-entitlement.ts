import type {BillingEnvironment} from './billing';

type ReadArguments = {
  target_user: string; verified_session: string; target_epoch: string;
  target_environment: BillingEnvironment;
};
type ReadRPC = (name: 'read_maintenance_verified_entitlement', args: ReadArguments) => Promise<{data: unknown; error: unknown}>;
/** Call only after Auth.getUser verified the exact bearer and its live session binding. */
export async function readVerifiedLedgerEntitlement(rpc: ReadRPC, args: ReadArguments, now = Date.now()) {
  if (!['Sandbox','Production'].includes(args.target_environment) || !Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid entitlement scope');
  const result = await rpc('read_maintenance_verified_entitlement', args);
  if (result.error || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error('Entitlement unavailable');
  const value = result.data as Record<string, unknown>;
  if (value.environment !== args.target_environment) throw new Error('Entitlement environment mismatch');
  if (value.plan === 'free') {
    if (value.productId !== undefined || value.expiresAt !== undefined) throw new Error('Inconsistent entitlement');
    return {plan: 'free' as const, environment: args.target_environment};
  }
  if (value.plan !== 'premium' || !['ouchi.premium.monthly','ouchi.premium.annual'].includes(value.productId as string)
    || !Number.isSafeInteger(value.expiresAt) || (value.expiresAt as number) <= 0) throw new Error('Invalid entitlement');
  // A response may cross the expiration boundary in transit; never prolong access.
  if ((value.expiresAt as number) <= now) return {plan: 'free' as const, environment: args.target_environment};
  return {plan:'premium' as const, environment:args.target_environment,
    productId:value.productId as 'ouchi.premium.monthly' | 'ouchi.premium.annual', expiresAt:value.expiresAt as number};
}
