# Prepared Sandbox restore challenge transport

The new POST `/api/billing/restore/challenge` route is disabled without the
explicit Sandbox restore flag, complete existing App Attest registration
verification settings and Sandbox verified-ledger billing configuration. It
must not be enabled before the entire restore/deletion release gate passes.
No environment setting, shared database or enabled SQL policy is changed here.

The endpoint validates live Auth and exact session/enrollment, loads a scoped
registered key via service-only RPC, checks its point/hash/counter, then passes
the exact supplied app/purchase JWS strings to the existing hardwired Apple SDK
verifier with online checks. Only a matching active, purchased Sandbox premium
subscription with a different enrollment token is a candidate. A signed pair
alone is not permission to transfer. App revocation, revoked/upgraded/expired
subscription, foreign app/key/session, malformed proof and signature failure
are refused. The database also requires an explicitly reviewed operator-enabled
restore policy; the service role cannot enable it.

A server nonce is persisted with a SHA-256 of exact canonical bytes. The SQL
issuer locks the account, policy, key and request in that order, checks the live
enrollment, returns the exact original unconsumed unexpired challenge on a
matching retry and refuses changed scope/pair. Five active challenges per key
are allowed. Expired nonce data for that user/key is removed in bounded batches
when a new nonce is issued; transfer jobs and purchase records are untouched.
The response contains only base64 canonical challenge bytes and is no-store.
User/session/enrollment and expiry are checked again before returning it.
Browser roles cannot call these RPCs; functions use SECURITY INVOKER and empty
search_path. No private receipt or key material is returned to the device.

## Verification and remaining work

PGlite runs the actual new SQL and existing key/challenge/reservation schema
with synthetic enrollment and key/receipt fixtures. Tests cover disabled policy,
service inability to enable it, scope, exact persisted retry, changed proof,
Production, wrong hash, active nonce limit, revoked enrollment and role/function
privileges. HTTP service tests instantiate the actual Apple SDK but replace
its decode methods with synthetic results, and inject Auth/RPC responses. They
check exact inputs and verifier settings, rejection before issuing, altered
acknowledgements and a successful nonce response without any transfer call.
They are not real Apple signature, Supabase HTTP or concurrent PostgreSQL proof.

The migration is prepared with CLI migration new and is not applied to shared
Supabase. Formal advisors, real Auth/PostgREST/RPC and concurrent PostgreSQL
verification remain required before enabling. The current docs/changelog were
reviewed; the cited PostgreSQL minor-release legacy PGP/ltree/btree_gist/custom
operator changes are not used by these new functions. The local checks do not
audit existing production data or prove the production database unaffected.

Native HTTP wiring, assertion commit and atomic reservation, authenticated job
lookup/dispatch, durable unknown-response recovery, finite retention of unknown
external operations, real signed-device/App Attest/Apple Sandbox testing and
full deletion reconciliation remain required. Selling and real billing remain
unavailable. The full gate is `RESTORE-TRANSFER-RELEASE-GATE.md`.

Supabase references:
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
- https://supabase.com/changelog/extension-version-pinning-ignored
