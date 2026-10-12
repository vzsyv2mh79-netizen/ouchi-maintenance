/** Authenticated progress preparation. No production route is enabled. */
export type DeletionProgressDependencies = {
 verify: (bearer: string) => Promise<string | null>;
 /** Filter by BOTH request ID and verified user ID, using a bounded server client. */
 read: (scope: Readonly<{requestID: string | null; userID: string}>, verifiedBearer: string) => Promise<unknown>;
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && v !== '00000000-0000-0000-0000-000000000000';
export async function handleAccountDeletionProgress(request: Request, requestID: string | null, deps: DeletionProgressDependencies) {
 const reply = (body: object, status: number) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
 if (request.method !== 'GET') return reply({error: 'Method not allowed'}, 405);
 if ((requestID !== null && !uuid(requestID)) || new URL(request.url).search) return reply({error: 'Invalid request'}, 400);
 const header = request.headers.get('authorization');
 if (!header || header.length > 16384 || !/^Bearer [^\s]+$/.test(header)) return reply({error: 'Authentication required'}, 401);
 try {
  const userID = await deps.verify(header.slice(7));
  if (!uuid(userID)) return reply({error: 'Authentication required'}, 401);
  if (request.signal.aborted) return reply({error: 'Request cancelled'}, 409);
  const result = await deps.read(Object.freeze({requestID, userID}), header.slice(7));
  if (result === null) return reply({error: requestID === null ? 'Current status unconfirmed' : 'Request not found'}, requestID === null ? 503 : 404);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('Invalid progress');
  const row = result as Record<string, unknown>;
  // Only an authoritative store snapshot may declare scoped absence. A null
  // query result or route-level 404 cannot authorize a new deletion POST.
  if (requestID === null && row.state === 'not_requested') {
   if (row.userID !== userID || !uuid(row.epochID) || row.requestID !== undefined) throw Error('Unconfirmed absence');
   return reply({state: 'not_requested', userID, epochID: row.epochID}, 200);
  }
  if (!uuid(row.requestID) || !uuid(row.epochID) || (requestID !== null && row.requestID !== requestID) || row.userID !== userID || !['pending', 'running', 'complete', 'failed'].includes(String(row.state))) throw Error('Unconfirmed scope');
  // File/household erasure flags never imply full account completion.
  return reply({requestID: row.requestID, epochID: row.epochID, state: row.state}, 200);
 } catch {return reply({error: 'Progress unavailable'}, 503);}
}
