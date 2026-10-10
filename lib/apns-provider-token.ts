import 'server-only';
import { createPrivateKey, sign } from 'node:crypto';

/** In-memory provider credentials. No environment loading, persistence or sending. */
export function createAPNsTokenProvider(input: { keyId: string; teamId: string; privateKey: string }) {
  const { keyId, teamId } = input;
  if (!/^[A-Z0-9]{10}$/.test(input.keyId) || !/^[A-Z0-9]{10}$/.test(input.teamId)
      || typeof input.privateKey !== 'string' || input.privateKey.length > 16384) {
    throw new Error('Invalid APNs credentials');
  }
  let key;
  try { key = createPrivateKey(input.privateKey); } catch { throw new Error('Invalid APNs signing key'); }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('APNs requires a P-256 private key');
  }
  let cached: { token: string; issuedAt: number } | undefined;
  return (now: number): string => {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid APNs clock');
    const issuedAt = Math.floor(now / 1000);
    if (cached && issuedAt < cached.issuedAt) throw new Error('APNs clock moved backwards');
    // Reuse credentials instead of generating a JWT for every notification.
    if (cached && issuedAt - cached.issuedAt < 50 * 60) return cached.token;
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: issuedAt })).toString('base64url');
    const payload = `${header}.${claims}`;
    const signature = sign('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' });
    cached = { token: `${payload}.${signature.toString('base64url')}`, issuedAt };
    return cached.token;
  };
}
