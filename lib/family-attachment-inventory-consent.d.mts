export type ConsentTransaction = {
 signal: AbortSignal;
 query(sql: string, args: unknown[]): Promise<{rows: Record<string, unknown>[]}>;
 beforeCommit(key: string, check: () => Promise<boolean>): void;
};
type Value = Record<string, unknown>;
type RecordValue = {actorID: string; token: string; revokedAt: unknown};
type AuthorityArgs = [ConsentTransaction, Value, Value, Value, string, AbortSignal, Value];
export type InventoryConsentOptions = {
 key: Uint8Array;
 store: {
  transaction<T>(work: (tx: ConsentTransaction) => Promise<T>, signal: AbortSignal): Promise<T>;
  target(tx: ConsentTransaction, requestID: string, homeID: string, actorID: string, signal: AbortSignal): Promise<{scope: Value; plan: Value; inventory: Value}>;
  records(tx: ConsentTransaction, scope: Value, plan: Value, signal: AbortSignal): Promise<RecordValue[]>;
  record(tx: ConsentTransaction, scope: Value, plan: Value, record: RecordValue, signal: AbortSignal): Promise<unknown>;
 };
 identifyActor(bearer: string, signal: AbortSignal): Promise<string | null>;
 verifyIdentity(bearer: string, tx: ConsentTransaction, signal: AbortSignal): Promise<{
  userID: string; epochID: string; sessionID: string; aal: 'aal1' | 'aal2';
  authenticatedAt: number; checkedAt: number; authStateDigest: string;
 } | null>;
 verifyActor(tx: ConsentTransaction, claim: Value, signal: AbortSignal): Promise<boolean>;
 currentAuthority(...args: AuthorityArgs): Promise<boolean>;
};
export function createFamilyAttachmentInventoryConsent(options: InventoryConsentOptions): Readonly<{
 issue(input: {requestID: string; homeID: string; accessToken: string; confirmation: string; signal: AbortSignal}): Promise<{status: string; expiresAt?: number}>;
 authorize(...args: AuthorityArgs): Promise<boolean>;
 authorizeActivation(...args: AuthorityArgs): Promise<boolean>;
 authorizeCommittedActivation(tx: ConsentTransaction, scope: Value, signal: AbortSignal): Promise<boolean>;
}>;
