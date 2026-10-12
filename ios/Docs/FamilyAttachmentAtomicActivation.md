# Family attachment atomic activation — disabled review implementation

The new backend activation brand requires the existing opaque proof obtained by
measuring every destination Blob (exact MIME, bytes and SHA-256), the exact file
scope/plan, the original cancellation signal and a mandatory complete-inventory
consent verifier. JSON flags and client-produced proofs cannot satisfy it.

The existing signed household port accepts this brand as an optional backend
dependency. Without it, unresolved files continue to refuse handoff. With it,
all original uploaders participate in sorted principal locks before any rows are
locked. The port still verifies both signed family consents and the exact family
snapshot, and issues its existing private PID/transaction/expiry-bound context.

On the same pinned transaction, attachment preparation:

1. Locks the exact current native deletion job and immutable journal; verifies
   the complete original member/product/file/settled-write inventory.
2. Checks every receiver reservation against its original file and byte count.
3. Requires complete-inventory authorization (still an injected provider).
4. Issues a private child context tied to the parent household context, native
   job/epoch/lease and signed controller scope. The child expires no later than
   the parent or five database-clock seconds.
5. Records exact old/new images for only the named file and settled-write rows,
   and consumes receiver reservations under this exact context.

The household port then changes home owner/write routes. Attachment finishing
changes old-owner uploaders and epochs to the receiver, moves captured ownership
and settled-write ownership for all files, and preserves member-owned uploaders,
epochs and physical paths. Generated object paths are verified by final readback;
their exclusion from BEFORE-trigger comparison is necessary because PostgreSQL
computes stored generated values after BEFORE triggers.

The private writer guard remains closed by default. Only matching UPDATE old/new
images under the current private child/parent transaction context are allowed.
Ordinary writes, arbitrary GUC locators, reuse in another transaction, extra
fields, stale leases or receiver enrollment loss cannot use this exception.
Quota guards count only still-reserved rows, so consumption and transferred
metadata change the same total in one transaction without a double charge.

After exact readback and renewed authorization/measured proof, an immutable
attachment activation receipt is inserted, followed by the existing household
receipt. Failure/cancellation rolls ownership, routes, metadata, writes, quota and
both receipts back together. Deferrable database checks on context/receipt insertion
require the complete file/write rows, the whole home/product/task route set,
both receipts and exact consumed quota at COMMIT, including member-only cases
with no quota-update event. Current native/controller lease, unchanged family
consents and the measured proof deadline still apply at COMMIT. Source object
removal is deliberately excluded.

Nine full-schema PGlite tests cover two-file activation with the composed private
and household guards; retained member path/family rows; server metadata readback;
post-mutation authority-loss rollback; missing quota/fake proof/fake brand/GUC
refusal; receiver enrollment loss; and old-context mutation/refund refusal after
commit; missing receipts including member-only handoff; a missing product route;
controller expiry and family-consent revocation after the last application check.
The route-set query uses `rt`, distinct from the PL/pgSQL activation-row variable
`r`. Reusing `r` caused the positive case to roll back despite valid routes; the
same nine tests pass with the corrected query and unchanged assertions.
The enclosing copy ports use synthetic in-memory Blobs. Family identity
and full-inventory authorization are injected. No actual Storage/PostgreSQL
composition, deployed route or physical-device claim is made from these tests.

## Release gates still open

- Actual PostgreSQL and private Storage composition with the same guarded
  transaction, concurrency, cancellation and uncertain commit readback.
- Real current Auth/MFA plus BOTH inventory-bound consents, signing-key and
  least-privilege provider provisioning, and shipping native/HTTP integration.
- Durable activation-status/cleanup/completion adapters. Only activation receipt
  readback may advance to source cleanup; measured destination bytes must still
  be current. Auth retirement must await durable definitive source absence.
- Verified native lease reclamation while the shared private-writer freeze is
  composed. Standalone journal reclaim tests do not prove this: the old generic
  private-write fence also guards account_deletion_requests and must gain an
  exact controller operation capability before frozen reclaims can proceed.
- Formal hold/plan/receipt lifetime and later legitimate handoffs of the same
  home. Consumed quota history no longer uniquely blocks the same file, but the
  current review household plan/receipt tables still use a home-only key.
- Scalable measured-copy inspection, exact cancellation cleanup/refunds, finite
  receipt retention, all-project Auth retirement, and physical iPhone recovery.

All new SQL remains a disposable test fixture. No migration, route, production
role/grant, real payment, paid infrastructure or existing-user deletion is enabled.
