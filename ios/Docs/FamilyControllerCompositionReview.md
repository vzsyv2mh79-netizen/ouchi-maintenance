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
require recovery without replay. It passed at 24b16f14, Family workflow38679677280 / job116241121836; the raw marker and enclosing 1/0/0 result were reviewed. This was a post-COMMIT callback exception, not an HTTP socket fault. Original
approved/unapproved manual-boundary cases remain. Enrollment, inventory, current
coverage, destinations and retention are explicit disposable fixtures; this
actor has no files or external sends. Full global controller/production ports,
physical file/outbox/device acknowledgement, signed consent/current MFA and
shipping UI remain unverified.


## Owned shared-handler composition and Auth-independent receipt

The dormant `shared-maintenance-composition.ts` now connects the actual owned
adapter to the existing v2 shared journal. It requires all seven independent
peer callbacks and the explicit native port factory. Both applications retain
pre/post-Auth family and session checks. Each operation keeps its first frozen
readback and runs it again on the same checked transaction before COMMIT. A
false, unknown, cancelled or swallowed failure poisons that transaction. It
creates no prepare/coverage/Auth/completion default, connection, role, grant,
route or scheduler. SQL ports must reuse the journal's pinned checked connection;
remote effects still need separately durable dispatch and reconciliation.

A negative test reproduced an earlier-approval-only composition accepting a
failed final family check. Current readback and a permanent failed-transaction
latch correct that. The first current verifier cannot be replaced by repetition.

The full PGlite coordinator, starting with an empty receipt object through the
existing fixture journal API, also found a canonical schema blocker: the native
request's Auth FK refused the final Auth-user removal (23503). The CLI-generated
`20261015052134_ouchi_deletion_receipt_auth_independence.sql` removes exactly that
verified FK. It preserves NOT NULL, RLS, table privileges and the existing
live-session/epoch/family enqueue checks. A private invoker trigger, ungranted to
PUBLIC/anon/authenticated/service_role, keeps request ID, actor, app epoch and
original acceptance immutable. Unexpected FK history refuses migration rather
than repairing it. No cascade or actor-null substitution destroys the receipt.
Direct operator DML is not authorized intake. Retained UUIDs are personal data;
a reviewed finite retention/purge operation is still required before activation.

Initial related verification: 38 cases passed, 0 failed, 0 skipped; typecheck and
targeted lint passed. The new checks include the whole v2 sequence and actual
canonical native worker, missing post-Auth readback, unknown sends, reply loss
after a committed app stage, preserved bystander rows, actor immutability and
unchanged privileges. The old FK is reproduced and then the same original
request resumes after the migration without native replay or receipt renewal.
Auth erasure in these local tests is PGlite SQL only. Inventory/enrollment,
retention, private SQL-owner access and one Ouchi-only account are fixtures;
no managed Auth, other-app erasure, physical file transfer or production proof
is inferred from them.

A separate disposable GoTrue/PostgreSQL/Storage helper is prepared, not yet
verified: it uses the same controller, owned worker and fixed request, an
independently committed dispatch reservation, and the real admin SDK. It drops
one successful Auth DELETE reply, requires a real SDK error and explicit
user_not_found plus SQL absence, forbids a second DELETE while an earlier send
is uncertain, and blocks completion until both post-Auth readbacks pass. It
also preserves the sealed native receipt, bystander metadata/devices, all other
Auth users and retained private bytes. Its single actor has no other app account
or physical files. The operator dispatch table/intake/coverage/retention are
fixtures, not production role, outbox or SLA adoption. Raw new-head CI must be
reviewed before claiming this managed-service scenario passed.

Read-only live history still matches seven Ouchi source hashes and preserves
eight foreign rows; the current canonical list has99 files with92 pending and
no conflicts. Automatic apply and history repair remain false. Staged advisors,
effective least privileges, complete current writer/app registry, current MFA
and consent, physical file/outbox/device reconciliation and finite operational
retention remain release gates. No production migration, shared Auth erasure,
actual billing or paid infrastructure is enabled.

References checked for the disposable admin SDK scenario:
- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid


### Exact family checkpoint integration follow-up

The first service attempt stopped in operator seeding because a preceding Kakei
fixture installed a legacy-sub auth.uid implementation. Seeding now binds both
transaction-local GUCs to the exact getUser-verified actor and restores the prior
context. It does not weaken Actor required or claim ordinary client CRUD/RLS.

The next service attempt exposed a substantive composition gap: the real review
schema requires a deferred exact family checkpoint, while the old journal's
plain handoff-family receipt could not satisfy it. The same constraints are now
loaded in the local full-controller fixture, reproducing that refusal. The
existing connectSharedFamilyStage and private store route that phase OUTSIDE
legacy journal.perform, preserving its coverage-bearing receipt. Empty coverage
is independently checked against the frozen app catalog, household plans and
current family obligations; no target/transfer is invented.

The native metadata boundary and private SQL capability now accept an enriched
family receipt only when its exact scope, coverage digest and receipt match the
protected committed checkpoint. When that schema exists, naked legacy family
receipts are refused. Both layers recheck the proof, including at the owning
COMMIT. Minimal matching-record fault fixtures test missing, fabricated and
changed proofs; the full controller loads the real immutable/deferred checkpoint
schema. Metadata-only actual-service cases also record a verified empty family
checkpoint rather than manufacture a plain boolean receipt.

Recovery after an independently committed Auth deletion cannot require a live
session that was deleted by that operation. New dispatch still requires current
session/lease/family/fence authority before and after its independent reservation.
Absence recovery instead requires the original exact dispatch proof, current
controller/family/fence/native completion and definitive Auth absence. A new
SQL-only external-effect emulation reproduces that missing-global-receipt case;
it does not replace the pending real SDK/socket-loss check.

The strengthened related suite passed50/0/0 locally. Typecheck and targeted lint
passed again for this follow-up. The managed-service scenario is still unverified;
its previous failed attempts do not count as successful Auth deletion evidence.
No production provider, migration, grant, customer erasure or sale is enabled.
