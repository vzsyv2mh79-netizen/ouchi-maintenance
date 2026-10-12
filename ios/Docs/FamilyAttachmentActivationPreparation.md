# Family attachment activation preparation — 2026-10-13

The reviewed connection order is circular: the guarded household adapter refuses active attachments before changing home ownership, while the separate legacy photo preparation function requires an already-issued household handoff receipt and successor ownership. The existing refusal must not be removed merely to make a file-bearing handoff pass.

The new prepared backend orchestrator uses this order:
1. Bind a server-derived immutable request/home/owner enrollment/recipient enrollment and complete file manifest to the original signed family snapshot. Reserve all destination bytes/files in a durable preparation journal while ownership remains unchanged. Preparation must not require a completed household handoff receipt.
2. Create-only copy owner-uploaded files to the recipient's exact enrolled path. Retain other members' existing uploader, epoch, path and bytes. Measure every destination/retained Blob's MIME, byte count and SHA256 against the signed manifest. Retained prior owner epochs are valid original paths, not relabelled client claims.
3. Produce a backend-only opaque, scope/plan/cancellation-bound copy proof with at most 30 seconds from the start of inspection. A pinned transaction must verify that proof plus dual consent, current lease/MFA/receiver epoch, frozen complete snapshot, unsettled writes and reserved quota, then atomically change home owner/write routes and all file custody/captured-owner/write metadata with one durable activation receipt.
4. Read back the activation receipt after an uncertain response. Reinspect all surviving destination/retained bytes before each old-owner source removal. Finish only after definitive original absence and a durable receipt. Member-owned sources are never deleted. Shared Auth erasure remains prohibited until the complete family stage is verified.

Implementation status:
- lib/family-attachment-handoff.mjs implements ordering, immutable source/destination plans, opaque measured proofs, 35-second overall cancellation, create-only reconciliation and refusal after scope/data/authority changes.
- lib/family-attachment-storage.mjs supplies explicitly injected bounded server SDK adapters for measured reads, non-upsert writes, proof-gated source cleanup and canonical SDK NoSuchKey absence. Generic 404/error objects are not absence. It creates no bucket, credentials or route.
- Fourteen local injected tests passed: valid ordering/member preservation, lost copy/activation acknowledgements, quota refusal, corrupted copies, revoked authority, destination loss, forged/foreign/cancelled proof, stalled provider cancellation, immutable path/scope binding, monotonic five-file cleanup after repeated interruptions, typed absence and pre-upload hash refusal. Targeted lint and full typecheck passed.
- A dedicated actual-Storage fixture was added to the disposable family workflow. It copies/measures actual PNGs, preserves member bytes, asserts originals exist before activation, verifies old-path absence afterward and final destination bytes. Its authority/preparation/activation/finish journal is injected in memory, so it does NOT prove DB ownership activation, quota reservation, real Auth/MFA permission or retired-owner erasure. Its CI result remains pending until observed. Local Docker service execution is unavailable.

Still required: the durable preparation schema and restricted DB provider; the signed complete-manifest/receiver/quota binding; atomic activation and exact private controller context; read RPC and uploader/captured-owner retirement inventory compatibility; finite cancelled-copy reservation/cleanup policy; actual PostgreSQL concurrency and real Auth/Storage composition; native UI/recovery connection. The older attachment refusal remains in place. This candidate does not enable a file-bearing shipping handoff, production migration, real deletion or payment.

References checked:
- https://supabase.com/docs/reference/javascript/storage-from-upload
- https://supabase.com/docs/reference/javascript/storage-from-download
- https://supabase.com/docs/reference/javascript/storage-from-remove

Supabase CLI 2.120.0 is available in the temporary tool directory. Its SUPABASE_HOME is isolated to the temporary CLI state directory, avoiding writes outside the workspace. Help was inspected. No new migration was generated or applied during this preparation; future migrations must be generated with the CLI after the disposable schema review.

Cleanup replay now confirms each original path's definitive absence before another removal. Already-cleaned prefixes are skipped, so repeated interruptions advance five files as 3 → 1 → 0 remaining. Unknown presence/absence refuses mutation. Fourteen focused tests and lint passed after this correction. The preceding complete local regression run passed 589 tests.
