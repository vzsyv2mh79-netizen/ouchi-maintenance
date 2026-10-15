# Shared retirement family stage — 2026-10-13

This review composes the four prepared family schema candidates with the separate shared-account household fence, scoped worker, signed handoff context and private-writer fence. It is a disposable PGlite composition fixture, not a shipping endpoint or production migration.

Six checks passed:
- Standalone native acceptance without the controller's same-transaction context is refused and preserves rows.
- Service-role access cannot forge the private context, including an arbitrary GUC locator.
- Standalone file-bearing acceptance is refused.
- A frozen shared-retirement scope with two signed synthetic consents changes owner and write route in one transaction, preserves the exact family snapshot and member rows, stores one receipt, and returns the same result on retry. A new attachment write after freeze is refused by the private-writer fence.
- Revoked consent refuses transfer without changing family rows or creating a receipt.
- Signed consent also refuses transfer when unresolved attachment metadata remains.

The last case initially failed: the copied shared-controller review adapter changed ownership despite unresolved files. The local review copy now checks unresolved attachments after dual-consent verification and before context/ownership issuance. It pins home/product rows and attachment rows; concurrent attachment writes are protected by the composed private-writer principal freeze. The actual attachment schema has no product foreign key, so parent locking alone is not claimed to fence inserts. The original sibling source was not modified. Copy provenance, original/corrected SHA256 and deliberate changes are recorded in source-manifest.json.

Important distinctions:
- The ordinary app handoff happens while the owner remains enrolled. Shared-account retirement starts from a frozen/processing controller scope. One does not substitute for the other.
- This controller path retains successor membership and the exact original family snapshot. The standalone candidate removes the successor's redundant membership. A shipping bridge must explicitly reconcile this difference rather than bypass the existing fence.
- Consents in this test are backend-signed but use synthetic identity assertions. Real exact-bearer Auth/MFA, current membership, recent confirmation, bounded transaction acquisition/cancellation and least-privilege DB access remain required.
- No physical files, storage quota/custody transfer, whole-account completion, post-Auth cascade, real device or production policy is proven. Refusing unresolved files preserves them but does not complete the required file-transfer feature.
- The review adapter has no shipping credentials, route or grants. Private review functions/tables must not be exposed through the Data API or enabled on the shared production database.

Next integration requirements: unify trusted consent/identity and the live transaction provider; carry the immutable snapshot and successor routing through the controller stage; implement measured file custody/quota transfer and subsequent retired-owner erasure isolation; prove the combined flow using actual Auth, PostgreSQL and Storage before deployment.

## Application-owned native worker bridge — 2026-10-15

`lib/shared-maintenance-adapter.ts` now binds the fixed shared-account inventory
to the application's actual `runAccountDeletion` worker. It requires all native
ports and cancellation, freezes provider identities and the resolved native
binding, and refuses a missing/foreign mapping or a native lease reused from
the shared controller (including a case-only UUID spelling change). A receipt
is accepted only after an independent final verifier. Unknown outcomes and
cancellation never report app completion. Recovery of an exact completed native
receipt does not rerun irreversible stages or infer notification delivery.

The adapter does not supply production ports. SQL metadata ports must use the
coordinator's same checked transaction and `withSharedMaintenanceClosureMetadata`;
an independent Supabase RPC connection is not an atomic substitute. Every port
must enforce current immutable inventory, both execution leases, family/session
and writer gates. Prepared remote outboxes, physical file absence, native device
acknowledgements and finite retention remain required. Family and pre/post-Auth
session verifiers are mandatory separate callbacks, with no default approval.
There is no Auth-delete port, route, credential, schema, grant or scheduler here.

Eight focused adapter cases and fourteen existing/full-schema native-stage cases
passed locally (22 passed, 0 failed, 0 skipped). Two new composed SQL cases run
the actual worker against the canonical metadata/device stages: a committed
completion with a lost response is recovered without repeating writes, while
an expired-but-unknown notification send prevents record erasure and rolls back
its current SQL stage. The bystander's metadata/device rows and original Auth
users remain. The full-schema engine is PGlite; preparation, current coverage,
retention and an empty file inventory are explicit fixtures, not real service
or whole-account completion evidence.

The first actual-service adapter check passed at draft head 3f46c617, Family
workflow 38678863621 / job 116238577593 (raw log reviewed): exact completed-native
receipt recovery only, with no mutation phase and unchanged receipt fields.

A later negative adapter test reproduced a provider accessor returning a different
request after validation. The bridge now snapshots the resolved binding once
before checking it; the same frozen value reaches every worker port. The old
code failed that test; all 22 related cases now pass locally.

The service helper also prepares a third fresh actor to run all six native worker
stages through the owned bridge, then drop the committed completion response and
require recovery without replay. Its result is pending new-head CI. Original
approved/unapproved manual-boundary cases remain. Enrollment, inventory, current
coverage, destinations and retention are explicit disposable fixtures; this
actor has no files or external sends. Full global controller/production ports,
physical file/outbox/device acknowledgement, signed consent/current MFA and
shipping UI remain unverified.
