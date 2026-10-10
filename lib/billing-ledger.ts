import {createHash} from 'node:crypto';
import type {VerifiedTransaction} from './billing';

type LedgerResult = {data: unknown; error: unknown};
type LedgerDependencies = {
  verify: (signedTransaction: string) => Promise<VerifiedTransaction>;
  persist: (name: 'apply_maintenance_verified_transaction', args: {payload: VerifiedTransaction; proof_sha256: string}) => Promise<LedgerResult>;
};

/** The verifier must use Apple's signed-data verifier, never a decoded client payload. */
export async function verifyAndPersistLedgerTransaction(
  signedTransaction: string,
  dependencies: LedgerDependencies,
  expectedAccountToken?: string,
) {
  if (!signedTransaction || Buffer.byteLength(signedTransaction, 'utf8') > 131072) throw new Error('Invalid signed transaction');
  const transaction = await dependencies.verify(signedTransaction);
  if (expectedAccountToken !== undefined && transaction.accountToken !== expectedAccountToken) throw new Error('Purchase account mismatch');
  const result = await dependencies.persist('apply_maintenance_verified_transaction', {
    payload: transaction,
    // Audit reference to the exact verified JWS; this hash is not signature proof.
    proof_sha256: createHash('sha256').update(signedTransaction, 'utf8').digest('hex'),
  });
  if (result.error || !['inserted', 'updated', 'ignored'].includes(result.data as string)) throw new Error('Verified transaction persistence unavailable');
  return {transaction, outcome: result.data as 'inserted' | 'updated' | 'ignored'};
}
