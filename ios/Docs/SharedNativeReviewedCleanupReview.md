# Shared native reviewed-metadata cleanup — local candidate

2026-10-21. Dormant source/test candidate. No production DB/configuration/role/grant change, real customer erasure, retention adoption, schema-prefix exclusion or shipping endpoint. The frozen earlier native executor/profile remain unchanged.

`lib/shared-native-reviewed-erasure.mjs` adds a separately named `createSharedNativeReviewedErasure({scope,nativeLease,verifyBefore,verifySealed})`. Both current providers remain required, same checked physical transaction/PID/XID and owning COMMIT checks apply. The root lease, exact typed prerequisite receipts and immutable family checkpoint are still required. This is not a replacement for independent all-app writer/Storage/family/session coverage.

The fixed order is eraseRecords → eraseDeviceRegistrations → **eraseReviewedMetadata → eraseManagementClaims → eraseClosureMetadata** → captureReceiptSessions → eraseIdentity → markComplete. It differs from blindly copying the ordinary worker: the review/file RESTRICT dependencies must go before the closure review parent, and both reviewed metadata and management claims must be gone before native completion. Records must already be canonically erased; no metadata phase can run first. Global Auth removal stays later in the existing separate root stage.

Normal phases keep using the frozen `execute_shared_native_stage` RPC. Only the three added phases call `maintenance_private.execute_shared_native_cleanup` from `tests/fixtures/shared-native-reviewed-cleanup-20261021/cleanup-owner-profile.sql`. It uses the existing restricted NOLOGIN/NOINHERIT/NOBYPASS owner and exact LOGIN caller, checks role attributes/memberships and the exact existing native scope/root/epoch/lease. It pins the three canonical function bodies' SHA256 before use:

- `public.erase_reviewed_retirement_metadata`
- `public.erase_maintenance_deletion_management_claims`
- `public.erase_maintenance_deletion_closure_metadata` (required ordering tail)

Only these exact canonical EXECUTE grants are added to the NOLOGIN owner in the local profile. The LOGIN gains only the new fixed wrapper, no raw canonical EXECUTE or private-table/column DML. No LOGIN/membership or broad grants are created. Existing canonical DEFINER owners remain unchanged; their hosted restricted ownership/effective privileges remain a separate unapproved production gate.

A private `shared_native_cleanup_scopes` row derives the affected review set from current SQL, bound to actual PID/XID/root/native request/epoch/lease. Only the fixed owner can access it. It records reviewed→claims order; closure-parent erasure requires that exact frozen review set. It cannot be supplied by client JSON or a GUC. The scoped row is removed by the last cleanup phase. Its deferred constraint requires it to be absent and canonical native COMPLETE to be true on the same actual COMMIT. Both a partial raw cleanup and all three cleanups without the remaining native seal fail COMMIT. No new persistent PII lifetime or background pruner is adopted; successful transactions leave zero cleanup-scope rows, failures roll them back.

## Deliberately unresolved cross-generation policy

The canonical functions are **user-wide**, even though their parameters include one epoch/request. The new wrapper does not reinterpret that as an exact scoped delete. It refuses before cleanup if any affected reviewed retirement/file/plan/review or management claim belongs to a different epoch/request or has unknown review custody. All affected plans must be sealed and bound to the exact reviewed retirement/native request. Unbound drafts also refuse. This protects the other generation rather than broadening the allowlist.

A successful COMPLETE that both retains same-user foreign-generation reviewed metadata and uses the unchanged canonical completion checker is not available: the checker requires user-wide review/claim absence. The native test proves the safe negative result (entire operation rolled back with that generation intact), removes only the intentionally conflicting synthetic test fixture, and then proves the exact-scope positive path. Deploying a whole-account/all-generation cleanup needs a separately reviewed inventory/authority policy or a distinct canonical scoped contract; this change does neither. This restriction must be surfaced as pending, never silently ignored or marked complete.

## Local actual-service evidence

PostgreSQL17.6 / GoTrue2.197, synthetic accounts and operator intake/review/file-absence prerequisites only:

- Nonempty coverage plan, file item, child decision, reviewed retirement, settled reviewed file and ownerless-home claim are erased through the fixed canonical calls. The child FK cascade executes in PostgreSQL; no fake empty-table assertions replace it.
- Another actor/different epoch/family's corresponding records stay byte-for-byte unchanged. A same-user foreign-generation request refuses and rolls the prior record phase plus all metadata back.
- Before-record metadata invocation, skipped review/claim order, raw partial cleanup COMMIT and raw full cleanup without native COMPLETE all refuse. A late owning seal check refusal rolls all records, metadata, receipt and native flags back; retry then succeeds.
- The LOGIN cannot call any of the three raw canonical erasers or read the private cleanup custody table. Successful completion leaves no transient custody rows.
- The enclosing real original/manifest/native-seal test continues through real Admin Auth DELETE, owner-zero 14→15 global completion and read-only result projection. Original HMAC/signature, session manifest, full native seal/receipt expiry, another owner's product and real login remain as independently checked by that test. This is not real credential delivery, physical file erasure or global production coverage proof.

Intake/review/file absence was seeded only in the disposable fixture. Original USER-trigger modes were temporarily disabled for those synthetic prerequisites, then restored before execution; actual FK/check constraints stayed enabled. No erasure guard was relaxed for the positive path. The old frozen executor, canonical functions and original/manifest/readers were not edited.

Local validation: 79 focused/related tests, the actual PG/Auth native case, changed-file ESLint and build/typecheck (49 routes). Dedicated local-socket native runner remains separate from GitHub CI. The 72-table matrix remains an offline source classification with all operational approvals false; this candidate closes specific exact-scope source gaps only and is not a blanket approval of the rest.
