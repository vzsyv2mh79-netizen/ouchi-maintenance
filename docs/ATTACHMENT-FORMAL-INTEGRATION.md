# Photo / warranty Storage integration status

Formal additive migrations reserve quota and finalize verified metadata using current live Auth session and enrollment. No Production upload route, bucket, paid purchase or scheduled worker is enabled.

Limits: 100 MiB / 100 nonremoved files per uploader account, 5 MiB per file; JPEG, PNG, PDF. Retained prior enrollment reservations count toward quota. A repeated request has to match immutable product, user, enrollment, size, MIME and expected SHA-256. Finalization accepts only exact size/hash and current product membership, with both uploader/owner locks matching deletion capture. Null legacy hashes never qualify as proof of verified files.

Local PGlite test proves count/byte boundary rejection, idempotency, size/hash/ownership mismatch rejection, disabled owner refusal and client RPC denial. It is not evidence of concurrent multi-session Storage safety.

Disposable Auth + PostgREST + Storage CI is extended to reserve, upload without replacement, download and independently measure bytes/hash, finalize and repeat, deny client RPC calls, then close enrollment and refuse later reservation/completion before leased erasure. CI result must be observed for the resulting commit; this document alone is not that result.

Release gates: verified entitlement before reservation; bounded body and actual MIME validation; session/member change races; upload in flight when deletion captures inventory (late object writes must be prevented or durably erased before absence/final completion); permanent failed reservation cleanup with quota release only after verified object absence; read/list/export authorization after subscription expiry; storage/download bandwidth cost and retention policy; real device flow. SQL locks alone cannot make remote Storage and DB writes atomic. Do not advertise these incomplete paths as available paid benefits.

Supabase service keys bypass Storage RLS. Keep them server-only and verify caller, enrollment, membership and paid rights explicitly: https://supabase.com/docs/guides/storage/security/access-control . Changelog markdown could not be fetched by the browsing tool; no claim of a verified changelog audit is made.

## Retained read foundation

20261011010724 adds read-only RPCs bound to an existing live session/enrollment (no enrollment creation), verified stored hashes and current household membership. Reads deliberately have no paid-transaction prerequisite. Closed uploader/owner enrollment is denied. Page results are bounded to 25 items with a UUID keyset cursor; only server-side download metadata includes uploader and hash. Usage includes reserved files and retained earlier enrollments.

Local database tests cover complete two-page traversal, reserved/unverified files excluded, family ownership, membership removal, disabled owner, expired session, wrong epoch/session and client denial. Real Auth/PostgREST/Storage CI also exercises retained metadata and pages before/after membership removal and owner closure. The new commit CI must be inspected before claiming integration success. This is backend preparation, not a published paid-feature screen. Final streaming/export adapters must authorize again before delivery and bound downloaded contents; public long-lived signed URLs must not bypass later membership/closure.

## Response-time read check

The isolated development download route snapshots validated metadata, reads/verifies the bytes, then repeats the server-only metadata lookup immediately before returning. Missing authorization returns404; changed user/epoch/size/MIME/hash, RPC failure or request cancellation returns503 without a file response. Route tests inject membership removal, enrollment change, in-place metadata mutation, authorization outage and cancellation while Storage is awaited. Typecheck and targeted lint pass. This guards the response boundary; it cannot recall bytes already delivered and does not prove Production streaming, upload/deletion atomicity, bounded SDK download transport or actual native UI.

## Bounded isolated transport

The development route injects server-only transport into Auth, RPC and Storage calls: each call has a10-second deadline, response bytes are buffered and capped at5 MiB before SDK consumption, redirects are refused, and request cancellation plus a30-second common network deadline are forwarded. Incoming file reading has a15-second deadline and cancels its stream on deadline/caller abort. Received byte counting also covers unknown/chunked length; wire encoding and size are replaced for the decoded response.

Actual local HTTP tests exercise exact byte boundary, stalled headers/body, declared and streamed overflow, redirect refusal and cancellation; the real Supabase Storage SDK reports failure without a Blob. Local stream tests exercise stalled incoming body and caller cancellation. Timeout on a write is ambiguous and retains its reservation; it is never proof of rollback or permission to release quota. These checks still do not prove the remote Storage write/deletion race, native paid feature UI or Production deployment.

## In-flight write review and current release gate

Authoritative Storage schema guidance treats metadata as read-only and requires API-based file deletion; avoid installing the disposable fixture trigger in Production: https://supabase.com/docs/guides/storage/schema/design . Service-role Storage calls bypass RLS, so an ordinary owner policy cannot stop their late completion: https://supabase.com/docs/guides/storage/security/access-control .

The pinned disposable service is storage-api:v1.74.0. Its upload path performs backend upload before completeUpload; completion uses a new nonaborted signal and a superuser DB transaction. Therefore caller timeout alone does not prove completion stopped. Source: https://raw.githubusercontent.com/supabase/storage/v1.74.0/src/storage/uploader.ts . This is evidence about the pinned test service, not the currently deployed shared Supabase version.

Required next implementation: record a server-only upload attempt atomically before remote write using both uploader/owner closure locks; disallow starts after closure; retain uncertain/in-flight attempts and prevent absence confirmation/record erasure until all writes affecting that file have definitively settled. A timeout/expired lease alone must never mark a write settled. Acknowledged operation or explicit reconciler proof is required. Include all captured family uploads and do not alter Storage-owned schema or directly delete its metadata. Quota must remain charged during uncertainty. Actual delayed-write/closure/deletion tests and recovery are required before enabling uploads.

## Durable attempt / erasure gate preparation

20261011012412 adds private one-attempt-per-file tracking. Newly reserved files are tracked; legacy unknown writes are not silently marked safe. Begin serializes with uploader/owner closure, validates live session and membership and grants a single started=true receipt. Repeated begin returns started=false and never permits another remote write. Settling requires the exact server attempt and definitive terminal-operation evidence; it is allowed after closure so late acknowledgements can be recorded. No timeout/age/lease automatically settles an attempt.

Finalization requires a settled attempt. Both object-absence acknowledgement and application-record erasure refuse pending or unknown writes, including a pre-acknowledged inventory. An unstarted tracked reservation can be erased after closure because begin is then refused. Local DB tests cover uploader/family writes, delayed settlement after closure, wrong nonce, repeated begin, aged pending state, fake pre-acknowledgement, client denial and idempotent record erasure that still leaves full account deletion running.

Actual disposable migration CI now begins once before upload, independently verifies downloaded bytes, settles the acknowledged write, then finalizes metadata and erases after closure. The delayed actual remote write/closure/erasure race, lost begin acknowledgement recovery, terminal proof for ambiguous writes, legacy unknown reconciliation and native/Web upload adapter integration remain required. The prototype development endpoint does not use this new formal ledger yet; no Production upload or erasure endpoint is enabled.

## Delayed family upload integration scenario

The actual disposable Auth/PostgREST/Storage test starts a tracked family upload, receives its real HTTP request at the local gateway and holds it before forwarding to Storage. Owner deletion then captures both owner and family files, rejects new begin calls, refuses missing-object acknowledgement for the held write, and refuses record erasure. The actual deletion helper also cannot acknowledge the unfinished write. The held request is then forwarded to the pinned Storage service after closure; its real saved bytes are downloaded and checked, the exact acknowledged attempt settles, the deletion helper removes remaining objects and verifies NoSuchKey, and only then records can be erased. The family's independently owned home remains accessible.

This is a test of delayed forwarding and late actual Storage completion, not an S3 backend pause or proof of every lost-response/retry case. Current commit CI must pass before the scenario is treated as verified. No shared project, paid infrastructure, owner data, live APNs or account identity finalization is used.

## Formal server adapter preparation

`storedAttachmentUploadServices` is one instance per authenticated server request. It verifies the exact bearer with Auth, derives the current live session/enrollment, and reads the formal verified-transaction entitlement for a server-selected environment. Editable metadata and client premium flags are not authorization. Entitlement is rechecked before reservation and before the physical write. The caller must supply the bounded server-only service client; this helper creates no public endpoint or bucket.

The adapter snapshots approved bytes and scope. It sends only after an exact once-only begin receipt, never overwrites, and settles only an acknowledged successful Storage upload. A timeout retains the pending attempt even if readback finds the bytes. A lost settlement acknowledgement can recover through independently verified readback plus database finalization if the settlement actually committed. Actual downloaded size, MIME and SHA256 must match before finalization. SQL still rechecks membership/session/enrollment and settled attempt.

Eight local mock tests cover free/invalid Auth, wrong billing environment, entitlement expiration, once-only begin denial, normal completion and retry, uncertain write, content mismatch, lost settlement response and caller cancellation. Typecheck and lint pass. These are not signed Apple Sandbox purchases or actual successful paid Storage integration. An additional disposable real-Auth scenario checks that an account with no verified purchase gets403 with no reserved files; its CI execution remains pending.

The delayed-family-write scenario above passed at e3d9bd9129d047af11b5fb5799c1f324fd89f894 in migration run38102209193/job114360286274. All four workflow runs for that commit subsequently succeeded. Native UI, successful verified-entitlement adapter integration, ambiguous attempt recovery and complete account identity finalization remain release gates.

The next disposable integration also seeds a synthetic transaction through the service-only formal ledger for a separate family-owned product, invokes the actual adapter to save and retry the same file, revokes that synthetic entitlement, verifies new upload denial, and verifies retained metadata remains readable. This scenario is prepared but not yet executed against running services. It does not claim Apple signature verification and does not use real purchases or owner data.
