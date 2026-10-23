# Family preparation generation reservation candidate

2026-10-21. Local review fixture only. **This is a reservation prerequisite, not full family prepared cancellation, native inventory capture, write-stop readiness, new family consent issuance, claim admission or activation.** No production migration, real permission change, Storage call, Auth deletion or retention adoption.

## Append-only generations, not replacement of immutable plans

The old handoff plan/hold/receipt keys and immutable guards remain unchanged. The old root journal's one-active-request-per-user unique constraint also remains: cancel COMMIT precedes a new root reservation. Existing legacy prepared plans are refused, never adopted/deleted/rewritten.

New private generation history is keyed by generation UUID and unique root/native IDs. A separate `(generation_id,home_id)` relation stores the complete target roster. A home-only current pointer admits at most one current reservation. Cancellation appends an immutable cancellation record and releases only pointers still belonging to that exact generation. A new root then appends a new generation for the retained home. Old history remains immutable; old cancellation retries cannot release a new pointer. Existing signed original evidence is preserved, but **no new family signed-original lifecycle is provided by this gate**.

`createOuchiFamilyPreparationGeneration({scope,generationID,nativeLease,homes,verifyNoDispatch})` has only `reserve(scope,checkedTx)` and `cancelRequested(scope,checkedTx)`. No method is named ready, claim, consent, handoff or complete. Checked query/signal/beforeCommit must belong to the actual owning physical transaction. Fixed readbacks pin PID/XID; caught failure or repeated mutation poisons the final hook. Independent no-dispatch and privileged-writer/remaining-path admission must be current through actual COMMIT; client booleans or missing result receipts are not authority.

SQL checks the exact requested/cancelled root with empty receipts/null root lease, takes root first then all current owner/member participant advisory locks in deterministic order and locks each target home. The complete current owned-shared-home roster is derived from actual rows. Every owner/member requires enabled enrollment, real live bound sessions, and no prepared native request/stop binding/stopped fence. Targets must contain every such home exactly once and an enrolled successor. Extra/missing home, changed epoch, session, membership, content, access, native state, writer metadata or missing coverage refuses.

A new immutable generation saves actual current roster, owner preimage/content digest, full participant epochs/enrollment/session/stop/native observations, metadata digest and producing PID/XID. This captures before-claim **reservation** provenance only; it does not establish the legitimate delta for canonical native preparation. File/copy/legacy-plan scopes are refused. Roots cannot claim this reservation as an existing native prepared scope.

## Dispatch and uncertainty

A separate immutable dispatch-admission history accepts only copy/transfer/erase/logout labels, with admitted/unknown/completed outcomes. Any entry refuses cancellation. The local test inserts an unknown-copy admission marker and verifies journal/pointer rollback, not actual Storage behavior. There is not yet a production writer that records admission before every external call; the independent provider remains mandatory and hosted operation is blocked until that path is implemented and verified. Unknown external result is never treated as absence merely because no success receipt exists.

## Local verification

Actual PostgreSQL17.6 + GoTrue2.197: real password sessions and enabled epochs for owner/receiver; actual complete family roster and preimage persisted; late reserve/cancel failure rolls all history/pointer/journal changes back; same-home new-root reservation after cancellation succeeds with prior history byte-identical; old cancel cannot release the new current pointer; processing cancellation, wrong roster and receiver epoch drift refuse; unknown-copy marker refuses; old original rows, old immutable plan rows and family products/ownership remain unchanged. The earlier original rows are real prior owner originals; this test does **not** claim newly issued generation-bound family AAL2 originals.

Related units verify exact targets/no duplicate or owner successor, mandatory coverage/checked transaction, no reserve on cancel, late PID/XID/coverage failure, poison and abort behavior. Native test is explicit opt-in, not implied by ordinary CI.

## Remaining gates

1. Adapt or add every consent/plan/context/receipt reader to explicit generation keys without reinterpreting old originals. No silent fallback from the old home-only readers to these history tables. Keep old signed evidence.
2. Integrate actual complete native file inventory and all family write stops atomically **after** saving before-images, with exact prepared differences and original provenance. This gate has no such native/flag mutation and cannot be composed with the owner-zero-only prepare RPC for a family.
3. Add generation-bound owner/successor AAL2 signed originals and verify complete roster at root claim and all later steps.
4. Design file/capacity reservation lifecycle and external dispatch admission/lost-reply recovery; any started/unknown copy, transfer, erase or logout forbids restoration. Tests must cover actual Storage behavior, not only a SQL marker.
5. Review complete dependency/effective-role profile. Private metadata observers and core in this disposable fixture retain DDL ownership; PUBLIC EXECUTEs are revoked and coordinator has fixed RPCs only, but this is **not a production least-privilege profile**. Add no hosted grants based on this fixture.
6. Verify exact public request/requested_at generation, result-credential invalidation, contact/outbox removal and the real global completion guard at final owning COMMIT. This fixture uses the captured root journal and does not prove coexistence with every current global completion trigger. Do not disable or substitute a completion guard to make cancellation pass.
7. Approve personal provenance retention/access, operator recovery and deployment separately. Session IDs and snapshots are personal data. No default TTL, scheduler, policy or deletion is adopted.

The complete family/file retirement goal remains unfinished. This candidate resolves the sidecar reservation generation collision only, with explicit refusal until actual preparation/consent/claim/file integration is available.
