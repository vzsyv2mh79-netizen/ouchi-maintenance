import { createClient } from '@supabase/supabase-js';

/** Request-scoped Auth transport. No sessions are persisted or refreshed and
 * no production configuration is read implicitly. Receipt tokens never enter
 * this transport: only the original login bearer is sent to getUser.
 */
export function createDeletionReceiptGetUser({supabaseURL, publishableKey, isolatedDevelopment = false, fetcher = fetch}: {
 supabaseURL: string; publishableKey: string; isolatedDevelopment?: boolean; fetcher?: typeof fetch
}) {
 const origin = new URL(supabaseURL);
 if(origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
    !(origin.protocol === 'https:' || (isolatedDevelopment && origin.protocol === 'http:' && origin.hostname === '127.0.0.1')) ||
    !publishableKey || publishableKey.length > 16384 || /\s/.test(publishableKey)) throw Error('Receipt Auth configuration unavailable');
 const endpoint = origin.origin + '/auth/v1/user';
 return async(bearer: string, callerSignal: AbortSignal) => {
  callerSignal.throwIfAborted();
  if(typeof bearer !== 'string' || !bearer || bearer.length > 16384 || /\s/.test(bearer)) throw Error('Receipt Auth bearer unavailable');
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(5000)]);
  const transport: typeof fetch = async(input, init) => {
   const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
   if(target !== endpoint || (init?.method ?? 'GET').toUpperCase() !== 'GET') throw Error('Unexpected receipt Auth request');
   signal.throwIfAborted();
   const response = await fetcher(input, {...init, signal, redirect: 'error', cache: 'no-store'});
   signal.throwIfAborted();
   if(response.redirected || (response.url && response.url !== endpoint)) throw Error('Receipt Auth redirect refused');
   const reader = response.body?.getReader();
   if(!reader) throw Error('Receipt Auth response unavailable');
   let length = 0;
   const parts: Uint8Array[] = [];
   const cancel = () => { void reader.cancel().catch(() => {}); };
   signal.addEventListener('abort', cancel, {once: true});
   try {
    for(;;) {
     signal.throwIfAborted();
     const next = await reader.read();
     signal.throwIfAborted();
     if(next.done) break;
     length += next.value.byteLength;
     if(length > 65536) throw Error('Receipt Auth response too large');
     parts.push(next.value);
    }
   } catch(error) { await reader.cancel().catch(() => {}); throw error; }
   finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
   const body = new Uint8Array(length); let offset = 0;
   for(const part of parts) { body.set(part, offset); offset += part.byteLength; }
   return new Response(body, {status: response.status, headers: response.headers});
  };
  const client = createClient(origin.origin, publishableKey, {
   auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
   global: {fetch: transport},
  });
  const result = await client.auth.getUser(bearer);
  signal.throwIfAborted();
  return result;
 };
}
