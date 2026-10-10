import 'server-only';
import { connect, type ClientHttp2Session, type ClientHttp2Stream } from 'node:http2';
import { maintenanceAPNsRequest, maintenanceAPNsResponse, type APNsDisposition } from './apns-maintenance';

type Reminder = Parameters<typeof maintenanceAPNsRequest>[0] & { registeredAt: number };
/** Explicit test adapter. Not wired to a route, scheduler, database or production host. */
export function createSandboxAPNsSender(options: {
  environment: 'Sandbox';
  providerToken: (now: number) => string;
  connect?: typeof connect;
}) {
  if (options.environment !== 'Sandbox') throw new Error('Only APNs Sandbox is supported');
  const open = options.connect ?? connect;
  const providerToken = options.providerToken;
  return async (input: Reminder): Promise<APNsDisposition | 'skipped'> => {
    if (!Number.isSafeInteger(input.registeredAt) || input.registeredAt <= 0 || input.registeredAt > input.now) {
      throw new Error('Invalid APNs registration');
    }
    const request = maintenanceAPNsRequest(input);
    if (!request) return 'skipped';
    const token = providerToken(input.now);
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 4096) {
      throw new Error('Invalid APNs provider token');
    }
    return new Promise(resolve => {
      let session: ClientHttp2Session | undefined;
      let stream: ClientHttp2Stream | undefined;
      let done = false;
      let status = 0;
      let size = 0;
      const chunks: Buffer[] = [];
      const finish = (result: APNsDisposition) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        stream?.destroy();
        session?.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => finish('retry'), 10000);
      try {
        session = open(request.origin, { minVersion: 'TLSv1.2' });
        session.on('error', () => finish('retry'));
        session.on('close', () => finish('retry'));
        stream = session.request({ ':method': 'POST', ':path': request.path,
          ...request.headers, authorization: `bearer ${token}` });
        stream.on('error', () => finish('retry'));
        stream.on('aborted', () => finish('retry'));
        stream.on('close', () => finish('retry'));
        stream.on('response', headers => {
          const value = headers[':status'];
          status = typeof value === 'number' ? value : 0;
        });
        stream.on('data', (chunk: Buffer) => {
          if (done) return;
          size += chunk.length;
          if (size > 4096) { finish('inspect'); return; }
          chunks.push(Buffer.from(chunk));
        });
        stream.on('end', () => finish(maintenanceAPNsResponse(status, Buffer.concat(chunks).toString('utf8'), input.registeredAt)));
        stream.end(request.body);
      } catch { finish('retry'); }
    });
  };
}
