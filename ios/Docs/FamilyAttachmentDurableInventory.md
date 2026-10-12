# Durable family attachment inventory — disabled review preparation

The storage-copy preparation previously retained its authority/activation journal
in memory in the actual Storage fixture. This change adds a pinned-transaction
PostgreSQL inventory journal so the exact original files, write attempts, products
and members can be retained independently of a backend provider instance.

`lib/family-attachment-journal.mjs` records only **planned**. It is deliberately
not the orchestrator's `prepare` port, and planned never means reserved, copied,
activated or safe to delete. The only schema is a disposable test fixture; no
migration, route, credentials, grants or production database change is included.

The provider locks owner, receiver and all original uploaders in sorted order;
checks original home owner, receiver membership/current enabled epoch and absence
of receiver retirement; locks home/product/file/write rows; compares every live
file against the complete source manifest and requires tracked, settled writes.
It records all original metadata including captured owner and physical path.
Original metadata, home ownership and Storage remain untouched.

The mandatory injected `authorize` provider must verify both current signed
consents over the **complete inventory digest**, current lease and epochs, and
the retained household/private-writer freeze on the same pinned transaction.
Parent locks alone do not fence new files: the existing metadata has no product
foreign key. Authorization runs again after insertion; cancellation or rejection
rolls back. No shipping authorization provider is implemented here.

An identical replay verifies authority and returns the persisted digest. An
expired native lease can be replaced only by the existing database claim
procedure on the exact `scope.nativeRequestID`, user and original owner epoch.
The journal keeps its original scope and inventory; its stable scope comparison
excludes only `nativeLease`. That exclusion is conditional on the current locked
native deletion row actually holding the presented token in running state with
an unexpired database wall-clock deadline. Lease/epoch are rechecked before and
after every authorization await and after inserting. Old, foreign, expired,
terminal or replaced-epoch leases are refused. The authorization callback also
receives the original persisted scope and must verify its binding to the current
signed controller operation. A new DB lease does not substitute for consent.

A different manifest or stable original scope cannot overwrite the row. Updates/deletes
are refused by a private trigger; anon/authenticated/service_role receive no
grants. No Auth/home cascade can discard the evidence. An approved finite
retention/retirement cleanup design is still required before migration readiness.

## Evidence and remaining gates

Twelve full-schema PGlite contract tests cover provider recreation, immutable
manifest/scope conflicts, partial/changed metadata, unsettled writes, receiver
epoch/membership/ownership changes, post-insert revocation/cancellation rollback,
role isolation and receiver retirement, the database claim procedure's renewed
lease with unchanged inventory, rejection of old/foreign/terminal leases, and
post-insert expiry rollback. Auth, signed consent and freeze evidence are injected.
These are not actual PostgreSQL concurrency or shipping tests.

The dedicated family workflow also awaits a new disposable PostgreSQL fixture
using real GoTrue accounts and the existing actual schema. It captures the
inventory, expires/reclaims the exact native request, requires renewed injected
authority and verifies old-lease refusal and unchanged home/file owner. Its CI
result must be observed before claiming actual PostgreSQL evidence. It does not
prove real signed consent, freeze, quota, activation, concurrency or native UI.

Remaining work, in dependency order:

1. Integrate the current database-verified native lease with the signed shared
   controller binding and physical-device recovery. The disabled journal now
   supports native request reclamation; complete shipping recovery remains open.
2. Persist all receiver byte/file reservations and make ordinary attachment
   writers account for them under the same lock order. The whole-home 100-file
   normalization cap differs from the existing per-uploader quota and requires
   correction before a scalable shipping adapter.
3. Bind full inventory to real dual consent/current Auth-MFA and private freeze.
4. Atomically consume reservations and switch home/write route, file uploader,
   epoch, captured owner and settled-write metadata using a transaction-scoped
   exact context plus fresh measured Storage proof. Preserve member-owned paths.
5. Persist activation/cleanup/completion receipts, verify retained reads and
   retirement inventory, and test actual concurrent PostgreSQL/Auth/Storage.
6. Wire the trusted routes and native recovery UI, verify physical iPhone,
   adopt finite retention, then approve deployment. Existing basic/free records
   must remain readable and exportable.
