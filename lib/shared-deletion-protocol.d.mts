export type SharedDeletionScope = Readonly<{
 protocolVersion: 2; kind: 'shared-account'; requestID: string; userID: string;
 leaseToken: string; inventoryDigest: string;
 apps: ReadonlyArray<Readonly<{app: string; requestID: string; scopeID: string}>>;
}>;
export const SHARED_DELETION_PROTOCOL: 2;
export function normalizeSharedDeletionScope(value: unknown): SharedDeletionScope;
export function deletionStages(scope: SharedDeletionScope): string[];
export function runSharedDeletion(value: unknown, adapters: unknown, signal?: AbortSignal): Promise<
 {state: 'complete'; notification: 'unconfirmed'} | {state: 'pending'; stage: string}
>;
