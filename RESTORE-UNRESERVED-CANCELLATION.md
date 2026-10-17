# Prepared Sandbox restore cancellation and reauthorization boundary

Not enabled, not applied to the shared database, not a subscription cancellation,
not an Apple mutation, and not authority for paid access.

## Exact cancellation

A native encrypted pending record may have been staged before its first HTTP
request, or a rejected request may have created no durable transfer job. A status
lookup returning missing/409 does not establish absence and cannot permit a
blind resend, deletion, or a new request.

The fixed POST `/api/billing/restore/cancel` accepts only `requestID`, `keyID`,
`pairSHA256`, and `assertionSHA256` (bounded 1024-byte JSON). Current server Auth,
original session and explicit enrollment epoch are verified before and after the
RPC. The existing independent Sandbox restore deployment flag, verifier settings,
and disabled database policy remain mandatory. The server returns only a matching
`cancelled` receipt; unknown/changed scope/errors return failure and preserve local
proof. Neither caller-supplied digests nor a receipt grant subscription rights.

The service-only invoker RPC holds the same account advisory lock as enqueue and
consume, checks live enrollment/registered key, refuses *any* existing transfer
job, and requires the exact stored unconsumed Sandbox nonce. Its expiry alone is
never proof that no job exists. In one transaction it deletes that nonce and
inserts an immutable private RLS cancellation receipt. A late preverified assertion
or enqueue then lacks a nonce and cannot advance the key counter or create a job.
The challenge issuer and direct-insert trigger refuse reuse of that request ID.
Use a fresh request ID and fresh own-SDK proof only after the native client has
validated a receipt for the exact persisted record.

Lost acknowledgement can be recovered by repeating the same cancellation with the
same original live user/session/epoch/key/app and both digests. Different scope or
proof is rejected. A challenge already pruned by the existing bounded expired-nonce
cleanup, a consumed nonce without a job, or revoked original session remains
unknown; none authorizes local erasure or reauthorization. That unresolved path
requires a reviewed recovery/escalation policy.

## Erasure and retention

The receipt contains IDs/digests/timestamp only, no JWS, bearer, receipt bytes,
lease or Apple transaction IDs. The server role cannot update/delete receipts.
Strict existing deletion proof-key erasure cascades these receipts through the
composite key/user/epoch foreign key. Browser roles have no access or execute.

No automatic receipt expiry/purge is enabled. Finite receipt retention, request-ID
reuse after expiry, anti-abuse limits, unresolved-record escalation and user-facing
retention disclosures must be decided and tested before enabling this preparation.
They are release blockers; an indefinite production retention policy is not
approved by this migration. Do not enable it simply because tests pass.

## Verification and limits

- Actual PGlite SQL exercises cancellation/repeated acknowledgement, exact scope,
  missing/consumed/expired nonce, late consume/enqueue, ID reissue refusal,
  authorized/update-started refusal, unchanged counter, browser grants/RLS and
  proof-key cascade, using synthetic enrollment/key/receipt fixtures.
- HTTP tests inject Auth and RPC, verify before/after live scope, exact request and
  returned proof digests, unavailable/changed/cancelled transport, and disabled
  entry. Typecheck and selected lint pass locally.
- A disposable real PostgreSQL CI test exercises both cancellation/enqueue lock
  orders and commit/rollback, observes the blocked advisory wait, and asserts one
  receipt or one consumed nonce/job/counter advance. It never connects to a real
  Supabase project. Its success must be observed separately after publication.
- Current Supabase function docs/changelog were checked. New private tables are
  not exposed to browser Data APIs; affected ltree/legacy PGP/GiST/custom operator
  features are not used here. Formal local database advisors are unavailable
  without Docker/local PostgreSQL and remain a deployment gate.

Native receipt validation/exact-record cleanup, a single coordinated live restore
UI, device/key/session recovery, authenticated worker dispatch, external Apple
unknown-outcome reconciliation, signed Sandbox/device proof and TestFlight remain
incomplete. No real charge, owner data deletion, paid infrastructure or Production
change is part of this preparation.
