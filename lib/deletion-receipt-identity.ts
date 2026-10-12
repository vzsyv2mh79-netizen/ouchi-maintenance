import { sessionAfterAuthVerification } from './verified-app-session';

type Transaction = {
 signal: AbortSignal;
 query: (sql: string, parameters: string[]) => Promise<{rows: Record<string, unknown>[]}>
};
type AuthResult = {data: {user: {id: string} | null}; error: unknown};

/** Prepared server adapter. getUser must make a fresh Auth-server request for
 * this exact bearer using signal; cached/decoded identities are not accepted.
 * A dedicated transaction must hold the live Auth session through registration.
 * No production client, route, grants or account mutation is initialized here.
 */
export function createDeletionReceiptIdentityVerifier({getUser}: {
 getUser: (bearer: string, signal: AbortSignal) => Promise<AuthResult>
}) {
 return async(bearer: string, tx: Transaction, signal: AbortSignal = tx.signal) => {
  if(signal !== tx.signal) throw Error('Receipt transaction cancellation mismatch');
  signal.throwIfAborted();
  if(typeof bearer !== 'string' || !bearer || bearer.length > 16384 || /\s/.test(bearer)) return null;
  const result = await getUser(bearer, signal);
  signal.throwIfAborted();
  if(result.error || !result.data.user) return null;
  const verified = sessionAfterAuthVerification(bearer, result.data.user.id);
  if(!verified) return null;
  // Server-side revocation matters even while a signed JWT has not expired.
  // Holding the session prevents its concurrent removal before registration.
  const live = await tx.query(`select extract(epoch from clock_timestamp()) * 1000 as verified_at
   from auth.sessions where id=$1::uuid and user_id=$2::uuid
   and (not_after is null or not_after > clock_timestamp()) for share`,
   [verified.sessionID, verified.userID]);
  signal.throwIfAborted();
  if(live.rows.length !== 1) return null;
  // A row-lock wait can cross a deadline. Recheck against a new server clock
  // after acquiring the lock; do not reuse a timestamp evaluated before wait.
  const current = await tx.query(`select extract(epoch from clock_timestamp()) * 1000 as verified_at
   from auth.sessions where id=$1::uuid and user_id=$2::uuid
   and (not_after is null or not_after > clock_timestamp())`,
   [verified.sessionID, verified.userID]);
  signal.throwIfAborted();
  if(current.rows.length !== 1) return null;
  const authVerifiedAt = Number(current.rows[0].verified_at);
  if(!Number.isFinite(authVerifiedAt) || !sessionAfterAuthVerification(bearer, verified.userID, new Date(authVerifiedAt))) return null;
  return Object.freeze({userID: verified.userID, authVerifiedAt});
 };
}
