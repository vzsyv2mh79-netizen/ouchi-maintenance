# Final inventory/Auth verification on the pinned transaction

The prepared inventory activation provider now refuses a query-only adapter.
Its private approval requires a transaction-owned beforeCommit capability and
registers one immutable check per bound inventory digest. After all callback
writes, that check re-reads signed consent, current authority, both pinned
session/factor/enrollment states and current policy through the existing actor
verifier. A false result, exception or cancellation rejects the callback result
so the owning transaction manager must ROLLBACK rather than COMMIT.

runWithTransactionCommitChecks creates no connection, grant or authorization.
The caller must supply a dedicated transaction, enforce SQL timeouts, never
issue transaction control inside the callback, and COMMIT only immediately after
successful return. The callback query capability is then sealed; already-running
SQL must still be canceled/bounded and rollback acknowledged by the manager.
This is not a SQL sandbox or permission to use untrusted SQL. Duplicate scope
registration cannot replace the first verifier, checking cannot register more
checks, and unfinished query promises prevent successful completion.

The common full-schema PGlite activation fixture and the actual-services
PostgreSQL transaction manager use this boundary. A PGlite case removes the
receiver session after the final receipt INSERT, then verifies rejection and
rollback of home ownership, exact file metadata and receipts, restoration of
the session, and zero source cleanup. A query-only adapter is explicitly refused.
The earlier recent-authentication expiry tests intentionally use a faulty no-op
registration adapter to continue proving deferred SQL rejection independently
of the new final verifier.

Six callback-boundary tests cover lifecycle, false/throw refusal, immutable
registration, unfinished SQL, checking-phase registration and stalled-check
cancellation. Focused tests: 20 passed, 0 failed, 0 skipped. Full regression:
666 passed, 0 failed, 0 skipped. Targeted lint and complete typecheck passed.

The actual GoTrue/Storage fixture now changes the receiver's verified TOTP
factor metadata after ownership/file/receipt writes but before final checks.
It requires Auth-state digest refusal and rollback, then retries with original
consent/inventory and preserves the existing lost-response readback/download/
revocation/logout assertions. This new actual-service case has not run locally
(no Docker runtime); same-head CI evidence is required before calling it passed.

Production effective-policy acquisition, consistent multi-actor lock order,
least-privilege connection provisioning, shipping/native routes, source cleanup
and whole-account completion, and physical-device/App Store verification remain
open. Pins prevent concurrent Auth-row changes only under the already-checked
immediate Auth FK guarantees. External policy acquisition is not made atomic
with PostgreSQL by this callback boundary. No production gate, payment, customer
mutation or new public schema migration was enabled.
