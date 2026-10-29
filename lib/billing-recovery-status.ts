import type {BillingEnvironment} from './billing';
export type RecoveryState='none'|'queued'|'running'|'complete'|'failed'|'cancelled';
/** Only service RPC progress; never an entitlement or a transaction verification. */
export function normalizeRecoveryStatus(value:unknown,environment:BillingEnvironment):{state:RecoveryState;environment:BillingEnvironment}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Recovery status unavailable');
 const row=value as Record<string,unknown>;
 if(row.environment!==environment||!['Sandbox','Production'].includes(environment)||typeof row.state!=='string'||!['none','queued','running','complete','failed','cancelled'].includes(row.state))throw new Error('Recovery status unavailable');
 return {state:row.state as RecoveryState,environment};
}
