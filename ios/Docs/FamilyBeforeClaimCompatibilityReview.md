# Family before-claim compatibility: canonical capture ordering

Local real-PostgreSQL evidence, 2026-10-21. No operational activation or hosted change. The append-only generation reservation candidate is a prerequisite, not full native preparation or a family claim.

## Verified ordering conflict

The unchanged `public.capture_maintenance_deletion_objects(uuid,uuid,uuid,uuid)` calls `maintenance_private.owned_homes_have_no_other_members(user)` **before** changing enabled flags, inserting inventory objects or setting inventory_captured. It returns false while an owned home has another member, even with a valid running native request and live exact lease. This guard is necessary to prevent accidental family erasure and must not be bypassed by temporarily moving members, disabling a trigger, substituting a predicate, pre-setting inventory_captured or declaring the sidecar reservation to be canonical capture.

An actual isolated PG17.6/GoTrue2.197 case creates a real Auth owner and receiver, enabled owner epoch and a retained shared home. Inside a disposable transaction it inserts a running native request, verifies the real lease, observes owned-family guard=false and canonical capture=false. Inventory stays empty/unconfirmed, enrollment and home/member rows are unchanged. The synthetic native row is rolled back. Function bodies and legacy PKs/constraints are byte-identical before/after.

Observed canonical body SHA256: `77108701d1e59146d1f9cfd40e9293bc1712997023dfe94a0921c2fdfbefdd1c`.
Observed owned-family guard body SHA256: `df97b3cf8bbdbc01ea68b151edcdff92f9dc9cfb4ce3d59ce0ec3694907b1dd3`.

These body hashes are local source/runtime evidence, not a fresh hosted-catalog attestation or an operational ACL policy.

## Corrected preparation contract (design, not implemented)

1. Reserve an exact new root/generation with complete owner/shared-home/member/uploader/successor epochs and actual preimages **before** mutating native/enrollment/hold state. Legacy prepared state without provenance still refuses. Current generation reservation supplies a partial foundation, not a complete file inventory.
2. Establish a separately named, generation-bound **family preparation inventory**, complete write stops and reversible native-running preparation delta atomically under checked actual PID/XID. The family snapshot is not canonical erasure inventory. Keep `inventory_captured=false`; do not fabricate canonical confirmation or a root processing lease. Require exact original flags/absence, incoming native-child review and complete writer/dispatch exclusion through COMMIT.
3. Issue independent generation-bound owner and every selected successor AAL2 originals, bound to exact family preparation inventory/plan/session/epoch. Use a new domain or explicitly versioned generation contract. Never rewrite/re-sign/renew old originals or point a home-only reader at a different generation. Reuse existing strict Auth/policy verification only via an explicitly reviewed fixed RPC contract, not client claims.
4. Root claim must validate the exact generation, full roster, complete original set, prepared stops/native lease/preimage provenance, physical transaction and independent coverage before and after the exact requested→processing transition. The current reservation-only gate does none of this and cannot authorize claim.
5. Perform lawful generation-specific handoff with both consents and unchanged family data. Only then, once the unchanged owned-family guard passes, invoke the real canonical capture and verify its actual inventory/flags. Empty-file preparation does not authorize adding attachments or ignoring uncertain writes.
6. Requested cancellation before any transfer/copy/erase/logout admission may restore only the recorded native/stop/enrollment preparation delta. Any started dispatch, unknown external outcome, changed family/epoch/writer/content or missing original preimage refuses; do not attempt to undo external effects. Preserve immutable history, current-generation exclusion and old signed originals. A new root follows successful cancellation COMMIT.

This separates **before-claim family preparation** from **after-handoff canonical erasure inventory**. If a future contract requires canonical capture before handoff, it conflicts with the existing protection; the requirement must be redesigned rather than weakening that protection.

## Shared root cancellation integration boundary

The inspected paired cancellation candidate `ios/Backend/review/shared-requested-cancellation-transition.sql` in the sibling workspace has an exact requested→cancelled branch preserving the old processing/COMPLETE guard. Its final deferred check currently declares `p maintenance_private.ouchi_requested_preparations`, requires p.state=cancelled and calls `ouchi_requested_preparation_state`. That is the owner-zero protocol, not the family generation reservation table. A cancelled family sidecar must not be accepted by this verifier as if native preparation were restored.

A future family-specific final predicate must verify the actual prepared/restored family generation and signed provenance alongside both app cancellation states, actual public request/requested_at generation, revoked result capabilities and removed outbox contact. Verify final owning COMMIT and fault injection with the real completion guard present. Do not remove or replace the completion guard with a permissive cancellation test guard. The paired transition source is reference evidence only; no edits or execution were made in the sibling project or a hosted database.

## Still unfinished

Actual reversible family native/write-stop preparation; new generation-bound family AAL2 originals/readers/claim/handoff; file/capacity inventory and real uncertain-dispatch recovery; shared final-COMMIT integration; hosted effective-role/all-writer coverage; approved personal provenance retention and operator recovery. Production, permissions, contracts, charges and publishing remain untouched.
