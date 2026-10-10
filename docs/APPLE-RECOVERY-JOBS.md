# Durable interactive Apple recovery preparation

Additive service-only RLS job storage, unapplied to production. No scheduler, public API, Apple credential or billing sale is enabled.

Enqueue requires the exact bearer to be verified through Auth.getUser before invoking the RPC. SQL independently verifies live session, app epoch and environment, then selects the transaction from the verified ledger. One job per user/epoch/environment coalesces requests; active jobs retain their cursor and lease. Finished/failed jobs can restart after a new authenticated request.

Claim uses FOR UPDATE SKIP LOCKED, two-minute leases with fresh opaque lease tokens, and a persisted attempt counter. Expired leases can be reclaimed. Finish requires the exact unexpired lease: stale workers cannot advance cursors or report completion. A partial successful page batch saves its cursor and resets consecutive failures; storage failures retain the previously acknowledged cursor for idempotent replay. Failure delay is exponential from10seconds capped at1hour; eight consecutive claims with failures stop for review. No raw error text or signed proof is saved.

Closed application enrollment cancels interactive jobs on claim or finish. Ordinary session expiration after enqueue does not cancel a job while application enrollment remains open. Signed historical notification retention/reconciliation needs a separate policy and is not satisfied by these interactive jobs. Neither queue state nor completion grants entitlements.

Worker adapter remains required: bound invocation time below lease duration, cancellation/lease expiry checks before saves, durable finish acknowledgements, read seed by claimed fixed identity rather than a new arbitrary seed, and deployment/advisor review. Engine transport wait bounds alone do not abort SDK HTTP. A maximum-page batch can exceed this lease, so it must not be connected to a scheduler without a bounded worker budget/heartbeat strategy. Job retention/account deletion review is required.

Tests execute actual migration SQL in an isolated PGlite database: deduplicated enqueue, live identity, claim exclusion, partial resume, retry delay, lease replacement/stale finish refusal, eight-failure stop, closed enrollment, and authenticated-role denials. Actual Auth/PostgREST integration assertions were added to CI but their result must be inspected. No actual signed Apple purchase is proven.
