# Controlled family preparation: stage zero candidate

This is an undeployed adapter contract, not production SQL or deletion authority.
`createOuchiControlledFamilyPreparation` accepts the exact original protected
provenance object (`domain`, `generationID`, `scope`, `operation`, `digest`), a
distinct native lease, an exact home/successor roster, externally pinned operation,
and independent no-dispatch/writer coverage. It exposes `reserve(tx)` and
`reconcile(tx)`. The latter never calls reserve: it reads the protected mapping
and actual reserved facts under the same locks and final checks, returning only
`controlled-family-preparation-observation`. Missing/cancelled/mismatched state
is an error, never permission to retry or create a new generation. It grants no
deletion authority. Caller must finish the checked transaction before relying on
the observation; a changed operation still requires separate recovery admission.

The original header must already be committed in a different transaction.
Bootstrap requires its operation to equal the external current operation. Restart
recovery under a new operation needs a separate admission contract; it is not
implemented by changing the original provenance or extending any deadline.

## Transaction order

1. Acquire global shared hold and the protected operation row through COMMIT.
2. Read `private.kb_read_controlled_generation_provenance(gid, scope)` and compare
   every original provenance field and digest. Reject the producing transaction.
3. Lock the exact requested root, with null lease fields and empty receipts.
4. Check independent no-dispatch coverage and call the new reserve port below.
5. Read exact preparation facts and repeat current/root/provenance checks.
6. Repeat these facts in the owning transaction's final COMMIT checks.

The returned `{kind: 'controlled-family-preparation', generationID,
provenanceDigest, phase: 'reserved'}` is tentative until COMMIT. It contains no
durable receipt, generic verifier, Auth capability, or claim authorization.
Unknown COMMIT must be reconciled from protected state, not retried blindly.

## New SQL candidate, real database verification pending

`tests/fixtures/controlled-family-preparation-20261029/protocol.sql` implements
the ports below as an isolated fixture. It is not a production migration.
Its dedicated NOLOGIN owner receives only metadata column reads and named helper
execution. The mapping table remains installer-owned with forced RLS; the
function owner has SELECT/INSERT only, no Auth CRUD, schema CREATE or membership.
The initial protected header read discovers the operation; a second read under
the operation lock must match before the original root/participant locks run.
Both original header and actual preparation producer PID/XID are pinned in the
immutable mapping. A deferred insert guard repeats actual state checks.
Reserve rejects even a matching existing mapping; reconciliation uses only the
state port. Reconciliation under a changed operation is not implemented.

`maintenance_private.reserve_controlled_family_preparation_generation`
arguments: `(root uuid, scope jsonb, gid uuid, nativeLease uuid, targets jsonb,
provenanceDigest text)`, returns boolean.

This must lock in the same order, independently validate the committed original
controlled provenance and requested root, and reject ANY existing generation for
the gid/root before creating a new preparation. It may invoke the existing
`reserve_family_preparation_generation` only to perform a genuinely new reserve;
its existing idempotent adoption branch is not sufficient. Atomically persist an
immutable gid/root/provenance-digest/preparation-producer binding. Do not change
the original function or reinterpret any old signature, checkpoint or receipt.

Keep all existing actual conditions: exact current roster and enrolled successor,
original preimage/catalog, session/app epochs, no prior stop/deletion/handoff,
file and dispatch restrictions, unique current home holds, and deferred SQL
COMMIT guards. Existing restrictions remain blockers if real users do not meet
them; the adapter does not manufacture eligibility or bypass file handling.

`maintenance_private.controlled_family_preparation_generation_state` takes the
same six arguments and returns exactly one row `{ok boolean, pid integer,
xid text, provenance_digest text, phase text}`. `phase` must be `reserved` for this
adapter. Verify the immutable controlled binding, actual existing generation
state and current transaction identity; do not return a caller-asserted `ok`.
Reject absent, old, cancelled, dispatched or mismatched preparation.

Both ports require private, minimal server privileges and the same current
operation, scope, actor and generation. No production grants are authorized here.
Missing ports fail closed; there is no direct old-reserve fallback.

## Stage 1–4 integration still required

### Historical binding lookup

`maintenance_private.read_controlled_family_preparation_binding(root, scope,
generationID, provenanceDigest)` is a STABLE metadata reader. It returns zero or
one row with `kind: controlled-family-preparation-history`, `native_lease`,
`targets`, `provenance_digest`, integer `header_pid`/`producer_pid`, and text
`header_xid`/`producer_xid`. It compares the immutable mapping to both the actual
original reservation and protected original provenance. No caller-supplied lease
or targets are adopted. An identity mismatch returns no row; an invalid caller
raises. Only the dedicated backend has EXECUTE, not direct table access.

The lookup intentionally remains readable after processing/completion and an
operation change. It does not lock roots/Auth rows, allocate a transaction ID,
check current eligibility, renew a lease, issue a receipt or authorize any work.
The stage evidence caller must separately verify actual runtime/admission and
stage-specific facts. Real PG checks must cover read-only transactions before and
after status transitions, mismatched inputs, immutable original metadata, and
the absence of XID assignment. This SQL candidate is not yet PG-verified.

- Prepare: separately verify native capture, all app bindings, consent and
  write-stop readiness before claim. Stage zero is not this permission.
- Family handoff: retain actual successor consent and copy/transfer/retention
  checks; bind facts to the same controlled provenance and parent checkpoint.
- Verify family before: read actual post-handoff ownership, memberships and
  retained file access, not merely the reservation result.
- Verify sessions before: require actual session custody/logout and remaining
  writer exclusion; neither a reserved roster nor a planned nonce proves logout.

The shared owner implements controlled typed checkpoint issuance/readback and
the full lifecycle. These facts need dedicated stage-specific ports; this
adapter intentionally does not claim to implement stages 1–4 or 1–15.

Current verification: six preparation mock-driver tests plus seventeen provider
mock tests. Real SQL/PG/Auth integration,
production configuration, and recovery admission remain unverified.
