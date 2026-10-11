# Photo / warranty Storage integration status

Formal additive migrations reserve quota and finalize verified metadata using current live Auth session and enrollment. No Production upload route, bucket, paid purchase or scheduled worker is enabled.

Limits: 100 MiB / 100 nonremoved files per uploader account, 5 MiB per file; JPEG, PNG, PDF. Retained prior enrollment reservations count toward quota. A repeated request has to match immutable product, user, enrollment, size, MIME and expected SHA-256. Finalization accepts only exact size/hash and current product membership, with both uploader/owner locks matching deletion capture. Null legacy hashes never qualify as proof of verified files.

Local PGlite test proves count/byte boundary rejection, idempotency, size/hash/ownership mismatch rejection, disabled owner refusal and client RPC denial. It is not evidence of concurrent multi-session Storage safety.

Disposable Auth + PostgREST + Storage CI is extended to reserve, upload without replacement, download and independently measure bytes/hash, finalize and repeat, deny client RPC calls, then close enrollment and refuse later reservation/completion before leased erasure. CI result must be observed for the resulting commit; this document alone is not that result.

Release gates: verified entitlement before reservation; bounded body and actual MIME validation; session/member change races; upload in flight when deletion captures inventory (late object writes must be prevented or durably erased before absence/final completion); permanent failed reservation cleanup with quota release only after verified object absence; read/list/export authorization after subscription expiry; storage/download bandwidth cost and retention policy; real device flow. SQL locks alone cannot make remote Storage and DB writes atomic. Do not advertise these incomplete paths as available paid benefits.

Supabase service keys bypass Storage RLS. Keep them server-only and verify caller, enrollment, membership and paid rights explicitly: https://supabase.com/docs/guides/storage/security/access-control . Changelog markdown could not be fetched by the browsing tool; no claim of a verified changelog audit is made.
