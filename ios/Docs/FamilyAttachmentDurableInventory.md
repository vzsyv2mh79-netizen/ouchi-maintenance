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

An identical replay verifies authority and returns the persisted digest. A
different manifest or original scope cannot overwrite the row. Updates/deletes
are refused by a private trigger; anon/authenticated/service_role receive no
grants. No Auth/home cascade can discard the evidence. An approved finite
retention/retirement cleanup design is still required before migration readiness.

## Evidence and remaining gates

Eight full-schema PGlite contract tests cover provider recreation, immutable
manifest/scope conflicts, partial/changed metadata, unsettled writes, receiver
epoch/membership/ownership changes, post-insert revocation/cancellation rollback,
role isolation and receiver retirement. Auth, signed consent and freeze evidence
are injected. These are not actual PostgreSQL concurrency or shipping tests.

Remaining work, in dependency order:

1. Explicit verified lease reclamation: keep original immutable inventory while
   separately accepting only the controller's current proven replacement lease;
   reject old leases. Current exact-scope refusal also refuses changed nativeLease.
   Do not merely ignore the lease or claim restart/expiry recovery is complete.
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
