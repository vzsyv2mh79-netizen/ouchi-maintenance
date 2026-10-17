// Generated from canonical TypeScript by scripts/generate-closure-storage-runtime.mjs.
// Node-only private inspection/copy transport. Never import into a client bundle.
import 'node:process';
import { createHash } from 'node:crypto';
import { createClient, StorageApiError } from '@supabase/supabase-js';
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

export const createHouseholdCopyStorage = (() => {



const uuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) && v !== '00000000-0000-0000-0000-000000000000';
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
function paths(m) {
    const f = m?.source, d = m?.destination;
    if (!f || !d || ![m.intentID, m.capacityClaimID, f.attachmentID, f.uploaderID, f.uploaderEpoch, f.homeInstanceID, d.id].every(uuid) || m.intentID !== m.capacityClaimID
        || !Object.hasOwn(extensions, f.mime) || !Number.isSafeInteger(f.sizeBytes) || f.sizeBytes < 1 || f.sizeBytes > 5242880 || !/^[0-9a-f]{64}$/.test(f.sha256)
        || f.objectPath !== `${f.uploaderID}/${f.uploaderEpoch}/${f.attachmentID}.${extensions[f.mime]}` || d.homeInstanceID !== f.homeInstanceID || d.mime !== f.mime || d.size !== f.sizeBytes || d.sha256 !== f.sha256
        || d.objectPath !== `households/${f.homeInstanceID}/${d.id}.${extensions[f.mime]}`)
        throw Error('Exact prepared copy paths required');
    return { source: f.objectPath, destination: d.objectPath };
}
/** Dedicated server copy-only Storage provider. Explicit project/secret only;
 * no implicit environment, bucket creation, signed URL, upsert or remove method.
 * SQL coordinator independently pins current intent/decision/capacity through
 * I/O. The upload acknowledgement alone is not measured copy confirmation.
 */
function createHouseholdCopyStorage({ projectID, secretKey }) {
    if (!/^[a-z]{20}$/.test(projectID) || !/^sb_secret_[A-Za-z0-9_-]{1,2000}$/.test(secretKey))
        throw Error('Explicit private copy Storage configuration required');
    const origin = 'https://' + projectID + '.supabase.co', bucket = 'ouchi-product-attachments';
    function client(m, path, method, signal) {
        const allowed = paths(m);
        if ((method === 'POST' && path !== allowed.destination) || (method === 'GET' && path !== allowed.source && path !== allowed.destination))
            throw Error('Exact copy operation required');
        if (!(signal instanceof AbortSignal))
            throw Error('Bounded copy signal required');
        signal.throwIfAborted();
        const endpoint = origin + '/storage/v1/object/' + bucket + '/' + path;
        return createClient(origin, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
                    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
                    const effectiveMethod = init?.method ?? (input instanceof Request ? input.method : 'GET');
                    if (url !== endpoint || effectiveMethod !== method || (method === 'GET' && (init?.body != null || (input instanceof Request && input.body !== null))))
                        throw Error('Exact copy Storage operation required');
                    return createAttachmentFetch(signal, 5000, method === 'POST' ? 8192 : Math.max(8192, m.destination.size))(input, { ...init, cache: 'no-store' });
                } } }).storage.from(bucket);
    }
    async function download(m, which, signal) {
        const path = paths(m)[which], result = await client(m, path, 'GET', signal).download(path, {}, { signal, cache: 'no-store' });
        signal.throwIfAborted();
        // Storage v1.74 download wraps NoSuchKey's semantic 404 in HTTP 400.
        // Require the explicit code plus that exact semantic status; generic 400,
        // bucket failures and authorization failures never mean an absent object.
        if (result.error instanceof StorageApiError && result.error.code === 'NoSuchKey'
            && (result.error.status === 404 || (result.error.status === 400 && result.error.statusCode === '404')))
            return null;
        if (result.error || !(result.data instanceof Blob))
            throw Error('Copy Storage read unconfirmed');
        return result.data;
    }
    return Object.freeze({
        inspectDestination: (m, signal) => download(m, 'destination', signal),
        readSource: (m, signal) => download(m, 'source', signal),
        writeDestination: async (m, blob, signal) => {
            const path = paths(m).destination;
            if (!(blob instanceof Blob) || blob.size !== m.destination.size || blob.type !== m.destination.mime)
                throw Error('Copy source bytes mismatch');
            const bytes = await blob.arrayBuffer();
            signal.throwIfAborted();
            if (createHash('sha256').update(new Uint8Array(bytes)).digest('hex') !== m.destination.sha256)
                throw Error('Copy source bytes mismatch');
            const result = await client(m, path, 'POST', signal).upload(path, new Blob([bytes], { type: blob.type }), { upsert: false, contentType: m.destination.mime, cacheControl: '0' });
            signal.throwIfAborted();
            if (result.error || result.data?.path !== path || result.data?.fullPath !== bucket + '/' + path)
                throw Error('Copy upload acknowledgement unconfirmed');
        }
    });
}

return createHouseholdCopyStorage;
})();
