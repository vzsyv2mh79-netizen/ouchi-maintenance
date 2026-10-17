// Generated from the three canonical TypeScript sources by scripts/generate-closure-storage-runtime.mjs.
// Node-only private inspection transport. Never import into a client bundle.
import 'node:process';
import { createClient } from '@supabase/supabase-js';
/** Server-only bounded transport. A timeout is not proof that a write rolled back. */
export function createAttachmentFetch(callerSignal, timeoutMs = 10000, maxBytes = 5 * 1024 * 1024) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 5 * 1024 * 1024)
        throw new Error('Invalid attachment transport bounds');
    return async (input, init) => {
        const signals = [AbortSignal.timeout(timeoutMs)];
        if (callerSignal)
            signals.push(callerSignal);
        if (input instanceof Request)
            signals.push(input.signal);
        if (init?.signal)
            signals.push(init.signal);
        const signal = AbortSignal.any(signals);
        const upstream = await fetch(input, { ...init, redirect: 'error', signal });
        const declared = upstream.headers.get('content-length');
        if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maxBytes)) {
            void upstream.body?.cancel().catch(() => { });
            throw new Error('Attachment response too large');
        }
        signal.throwIfAborted();
        if (!upstream.body)
            return upstream;
        const reader = upstream.body.getReader(), chunks = [];
        const cancel = () => { void reader.cancel().catch(() => { }); };
        signal.addEventListener('abort', cancel, { once: true });
        let size = 0, finished = false;
        try {
            while (true) {
                signal.throwIfAborted();
                const { done, value } = await reader.read();
                signal.throwIfAborted();
                if (done) {
                    finished = true;
                    break;
                }
                size += value.byteLength;
                if (size > maxBytes)
                    throw new Error('Attachment response too large');
                chunks.push(value);
            }
        }
        finally {
            signal.removeEventListener('abort', cancel);
            if (!finished)
                cancel();
            reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        const headers = new Headers(upstream.headers);
        // fetch may have decompressed the bytes; do not retain the wire encoding/size.
        headers.delete('content-encoding');
        headers.set('content-length', String(size));
        return new Response(bytes, { status: upstream.status, statusText: upstream.statusText, headers });
    };
}

export const createClosureFileStorageReader = (() => {



const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
/** Server composition only: no default credentials, public/signed URL, writes,
 * environment activation or route. Caller must provide an explicitly provisioned
 * project secret. Operator SQL scope and content verification remain mandatory.
 */
function createClosureFileStorageReader({ projectID, secretKey }) {
    if (!/^[a-z]{20}$/.test(projectID) || !/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(secretKey))
        throw Error('Explicit private Storage configuration required');
    const origin = 'https://' + projectID + '.supabase.co';
    return async (file, signal) => {
        if (!(signal instanceof AbortSignal) || !file || ![file.attachmentID, file.uploaderID, file.uploaderEpoch].every(uuid)
            || file.bucket !== 'ouchi-product-attachments' || !Object.hasOwn(formats, file.mime) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > 5242880
            || file.objectPath !== `${file.uploaderID}/${file.uploaderEpoch}/${file.attachmentID}.${formats[file.mime]}`)
            throw Error('Exact reviewed Storage object required');
        signal.throwIfAborted();
        const endpoint = origin + '/storage/v1/object/' + file.bucket + '/' + file.objectPath;
        const client = createClient(origin, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
                    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
                    if (url !== endpoint || method !== 'GET' || init?.body != null || (input instanceof Request && input.body !== null))
                        throw Error('Exact private Storage read required');
                    return createAttachmentFetch(signal, 5000, file.sizeBytes)(input, { ...init, cache: 'no-store' });
                } } });
        const { data, error } = await client.storage.from(file.bucket).download(file.objectPath, {}, { signal, cache: 'no-store' });
        signal.throwIfAborted();
        if (error || !(data instanceof Blob))
            throw Error('Private Storage read unconfirmed');
        return data;
    };
}

return createClosureFileStorageReader;
})();

export const createClosureHouseholdFileStorageReader = (() => {



const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) && value !== '00000000-0000-0000-0000-000000000000';
const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
/** Server composition only: no default credentials, public/signed URL, writes,
 * environment activation or route. Caller must provide an explicitly provisioned
 * project secret. Operator SQL scope and content verification remain mandatory.
 */
function createClosureHouseholdFileStorageReader({ projectID, secretKey }) {
    if (!/^[a-z]{20}$/.test(projectID) || !/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(secretKey))
        throw Error('Explicit private Storage configuration required');
    const origin = 'https://' + projectID + '.supabase.co';
    return async (file, signal) => {
        if (!(signal instanceof AbortSignal) || !file || ![file.attachmentID, file.homeID, file.homeInstanceID].every(uuid)
            || file.bucket !== 'ouchi-product-attachments' || !Object.hasOwn(formats, file.mime) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > 5242880
            || file.objectPath !== `households/${file.homeInstanceID}/${file.attachmentID}.${formats[file.mime]}`)
            throw Error('Exact reviewed Storage object required');
        signal.throwIfAborted();
        const endpoint = origin + '/storage/v1/object/' + file.bucket + '/' + file.objectPath;
        const client = createClient(origin, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
                    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
                    if (url !== endpoint || method !== 'GET' || init?.body != null || (input instanceof Request && input.body !== null))
                        throw Error('Exact private Storage read required');
                    return createAttachmentFetch(signal, 5000, file.sizeBytes)(input, { ...init, cache: 'no-store' });
                } } });
        const { data, error } = await client.storage.from(file.bucket).download(file.objectPath, {}, { signal, cache: 'no-store' });
        signal.throwIfAborted();
        if (error || !(data instanceof Blob))
            throw Error('Private Storage read unconfirmed');
        return data;
    };
}

return createClosureHouseholdFileStorageReader;
})();
