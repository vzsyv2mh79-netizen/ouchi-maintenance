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
