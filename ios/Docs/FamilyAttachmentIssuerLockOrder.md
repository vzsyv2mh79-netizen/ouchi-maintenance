# Prepared inventory-consent issuer lock order

The former issuer pinned Auth rows before reading the frozen inventory, while
the prepared worker acquired per-principal advisory coordination locks before
inventory and Auth rows. Concurrent issuer/worker execution could invert that
order. The issuer now requires a separate `identifyActor` callback that verifies
the exact bearer without database locks. This returns only an actor hint and
never authorizes a consent.

On the same transaction, `store.target` validates the trusted frozen plan,
acquires the worker-compatible `pg_advisory_xact_lock(hashtext(principal))` locks
for the owner, recipient and every source uploader in sorted unique order, then
reads the complete inventory. Only afterwards does `verifyIdentity` pin current
Auth/session/factor/enrollment rows. Its user ID must exactly match the earlier
hint, and all epoch, recent-authentication, authority and signed-consent checks
remain mandatory. No client-supplied participant list authorizes these locks.

The PGlite test exercises actor substitution and asserts that target coordination
precedes pinned identity verification; substitution leaves no consent record.
The prepared real GoTrue/Storage fixture additionally uses a second PostgreSQL
connection with a 200ms lock timeout to attempt each participant coordination
lock before the issuer takes Auth row pins. Both attempts must fail with 55P03.
This test is awaiting disposable CI execution; it is not a local-service result.

Local focused suite: 21 passed, 0 failed, 0 skipped. Targeted lint and complete
TypeScript checking passed. Whole suite: 667 passed, 0 failed, 0 skipped.
New-head disposable-service CI results remain pending.

Scope: these are private prepared providers and disposable fixtures. Production
plan lookup must obtain immutable trusted participant identities and validate
them again after locking. Every other writer/controller must use the same global
lock convention. Shipping HTTP/native flow, production Auth policy/version
acquisition, least-privilege provisioning, source cleanup and definitive whole-
account retirement remain open. Advisory locks do not make external Auth policy
atomic with a PostgreSQL commit. No endpoint, grant, production migration, actual
payment, production data deletion or source cleanup was enabled.
