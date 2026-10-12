# Durable family attachment inventory — disabled review preparation

The storage-copy preparation previously retained its authority/activation journal
in memory in the actual Storage fixture. This change adds a pinned-transaction
PostgreSQL inventory journal so the exact original files, write attempts, products
and members can be retained independently of a backend provider instance.

`lib/family-attachment-journal.mjs` records **planned** with `record`, or also
holds receiver capacity with `reserve`, returning **reserved**. Neither is the
orchestrator's complete `prepare` port, and neither means copied, activated or
safe to delete. Both schemas are disposable test fixtures; no migration, route,
credentials or production database change is included.

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

The dedicated family workflow also awaits a disposable PostgreSQL fixture
using real GoTrue accounts and the existing actual schema. It captures the
inventory, expires/reclaims the exact native request, requires renewed injected
authority and verifies old-lease refusal and unchanged home/file owner. Its CI
result must be observed before claiming actual PostgreSQL evidence. The original
native-claim fixture passed at `6382fbb2` (workflow 38313215611, job 115023621612,
one awaited enclosing test, 0 failures/skips). Authority/freeze were injected.

## Pending receiver capacity

The private quota fixture stores one immutable reservation per relocating file,
bound to request/home, original file ID, recipient/epoch and original byte count.
Original member-owned files keep their own capacity and receive no new charge.
Nineteen journal tests include all-or-nothing limits across other homes,
ordinary service-only upload reservation, rollback of a later-file capacity failure,
client/service mutation refusal, exact replay/reclaim, unchanged member
paths and post-reservation authority-loss rollback. The source normalizer now
uses 100 files/100 MiB **per uploader**, allowing a shared home over 100 files;
the destination still checks the recipient's aggregate existing/pending usage.

Both reservation and ordinary metadata triggers take the same principal quota
locks and count all nonremoved files across epochs plus pending reservations.
Ordinary service-only reserve RPCs retain their existing authorization and gain
the quota trigger, so a handoff cannot be ignored by their old metadata-only
precheck. The quota trigger is security invoker, with only private SELECT granted
to the existing service role; clients gain no policy or write permission.
No reservation expiry, update or deletion is allowed. A timeout cannot refund
uncertain copies. Consumption/release needs a future exact activation/cancel
context and receipt; those remain unimplemented and gate migration readiness.

The actual PostgreSQL fixture is extended to hold the receiver's last capacity
while another connection calls the ordinary service RPC, require lock refusal,
then quota refusal after commit, and confirm one reservation after reclaim.
This extension's CI is pending; the earlier passed fixture does not prove the
new quota/concurrency behavior. No end-to-end shipping claim is made.

Remaining work, in dependency order:

1. Integrate the current database-verified native lease with the signed shared
   controller binding and physical-device recovery. The disabled journal now
   supports native request reclamation; complete shipping recovery remains open.
2. Verify quota/concurrency against actual PostgreSQL, add exact private
   consumption/cancellation and finite receipt cleanup, and integrate the
   complete preparation port. Serial all-copy inspection/deadline scaling
   remains open even though the incorrect whole-home normalization cap is fixed.
3. Bind full inventory to real dual consent/current Auth-MFA and private freeze.
4. Atomically consume reservations and switch home/write route, file uploader,
   epoch, captured owner and settled-write metadata using a transaction-scoped
   exact context plus fresh measured Storage proof. Preserve member-owned paths.
5. Persist activation/cleanup/completion receipts, verify retained reads and
   retirement inventory, and test actual concurrent PostgreSQL/Auth/Storage.
6. Wire the trusted routes and native recovery UI, verify physical iPhone,
   adopt finite retention, then approve deployment. Existing basic/free records
   must remain readable and exportable.
