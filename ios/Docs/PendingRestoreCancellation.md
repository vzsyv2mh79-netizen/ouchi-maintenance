# Prepared native exact unreserved restore cancellation

Not wired to live UI, not enabled, not a subscription cancellation and not paid
access. It does not resubmit commit, obtain replacement SDK proof or mutate Apple.

`RestoreCancelAPI` uses the fixed first-party `/api/billing/restore/cancel` POST,
ephemeral bounded no-redirect/cookie/cache transport, exact captured Auth/session/
epoch/key scope, and 1024-byte request / 4096-byte response limits. Request includes
only the persisted original request ID/key and actual pair/assertion SHA-256.
Historical challenge expiry does not prohibit this authenticated cancellation
lookup; server still requires an exact unconsumed stored nonce and no transfer job.

Only the API constructs its public read-only `Receipt`. A 200 JSON/no-store result
must have exactly requestID/status/pairSHA256/assertionSHA256, status cancelled, and
all values matching the original record. Missing/foreign/changed/cache/oversized/
error/lost-ack/cancelled/changed-session outcomes throw and preserve proof.

`PendingRestoreCancellation` reopens the actual encrypted record after restart,
checks scope before/after the API, then asks storage to remove only a receipt-bound
record. Storage checks request/scope and both proof hashes, then uses the same
process-shared lease and exact persisted-record equality as completion cleanup.
Missing local record returns nil without network. A new proof requires a fresh
request ID and fresh own-SDK proof; this helper does not create it or grant rights.

The server preparation in RESTORE-UNRESERVED-CANCELLATION.md refuses any reserved
job, atomically removes the old unconsumed nonce and retains an immutable private
receipt, and guards cancelled request-ID reissue. A lost cancellation response may
be recovered using the same original live scope and hashes. A pruned nonce,
consumed/inconsistent state or revoked original session remains unknown; keep
proof and require the reviewed escalation/reauthentication policy.

Verification: actual temporary AES-GCM record plus injected HTTP/Auth responses
covers exact request/receipt, expired proof, wrong hashes/scope/status/extra fields,
redirect/cache/MIME/body limits, error/lost ack, session change and cancellation.
Exact receipt removes only matching bytes; altered proof is refused; absence
avoids HTTP. Synthetic key only, no real Keychain/DeviceCheck/Apple trust/current
paid rights/device/live UI proof. Full native checks are recorded separately.

Release blockers remain: one coordinated live restore path (do not double-stage
SDK helper plus exclusive submission), device key/session recovery, authenticated
worker dispatch, unknown external Apple outcomes, finite receipt retention and
anti-abuse policy, formal advisors, signed Sandbox/device tests and TestFlight.
