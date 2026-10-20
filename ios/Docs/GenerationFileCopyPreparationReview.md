# Planned-generation file copy preparation — not a file-capable retirement

Local review candidate after `7dc2db6`. This is a **per-file COPY-ONLY preparatory
namespace**, not the canonical generation reservation/native preparation and not
the global `prepare` stage. It has no activation, source removal, finalization,
family handoff, cancellation, capacity release, session/Auth erase or COMPLETE
capability. Root phase changes are explicitly blocked once this partial route is
used. Do not enable it in a customer route until the remaining transitions exist.

## Why a separate preparatory boundary

Current generation reservation, native preparation and handoff intentionally
refuse files. Their empty-file predicates, canonical capture and original TOTP
proofs are unchanged here. A copied object, even when measured, cannot replace a
complete file disposition plan or make those old gates accept a file-bearing
account. This registry binds a PLANNED generation UUID and exact root scope/native
lease/review to old scoped per-file copy intents. It is not evidence that the
actual native generation was reserved, nor a complete all-file inventory.

The existing copy coordinator still enforces current explicit account-content
review, measured content hash/MIME/size, original uploader/captured-owner/epoch,
home incarnation/product and quiet writes, finite physical capacity, immutable
intent and one durable nonce-bound writer. It remains create-only. Its original source body is preserved in a private clone; measured prepare/lock/
writer functions stay byte-identical. The old source boundary's exact body
is preserved as fallback; outside a new private context its upgraded-namespace
refusal still occurs. Inside the context a separately named source checker runs
ALL original inspection/decision/enrollment/quiet-writer/manifest checks after
requiring the exact new binding. This does not retrofit an old intent or discard
the old namespace guard for normal callers.

## Bound server adapter and private state

`createGenerationFileCopy` wraps only seven exact old SQL calls with a fixed typed
RPC; it accepts no arbitrary SQL/function/path/action from a client. Dedicated
server identity `ouchi_generation_file_backend` has no raw table or old-copy RPC
grants in this candidate. Its safe role attributes, no role membership, exact
full root scope and planned generation/review/native lease are checked. The root
row is locked FIRST and its PID/XID remains pinned through leaf SQL, Storage I/O
where the old coordinator holds locks, independent admission and real COMMIT.
Only actual PID/XID-local private contexts allow the new source branch.

Three private RLS tables hold immutable preparation/bindings plus transient
contexts. Deferred constraints require the exact old intent/scope/decision/file/
destination at producing COMMIT, with no transient residue. Root scope/phase/
receipts cannot change after a binding exists, and root deletion is restricted
by FK: partial file processing cannot be relabeled a global preparation/claim or
cancelled in a way that abandons an uncertain physical writer. The future drain,
retained-source disposition and cancellation rules remain UNIMPLEMENTED.

Every operational call and COMMIT requires an independent SERVER `readAdmission`
provider with exact domain, full-scope digest, generation/native/review binding,
finite canonical confirmation deadline and namespace-writer/review evidence
digests. There is no default TTL or client approval flag. A changing/stale proof
or different physical transaction refuses. Observed ACK/no-dispatch facts and
scoped status are factual readbacks, not new I/O authority; they can be retained
after policy withdrawal using the existing private nonce rules. Never expose the
backend credential or grant this preparatory server profile to a client.

## Native proof and deliberate limits

A separate local PG17.6 test applies the full pinned135 canonical migration order,
actual reviewed household namespace definitions, current account-content decision
protocol, and official Storage API commit
`01c95148a981a88b5f7e9014571a2926567b51e3` with real filesystem and PG object
metadata. Auth identities/sessions are SYNTHETIC for this test; no real GoTrue
MFA/current family original or paired root claim is asserted. Managed HTTPS/key
exchange and the independent writer/policy/evidence provider remain synthetic.
The Storage runtime is explicitly prepared outside the repository; tests never
download it or silently substitute an in-memory server.

Verified cases:

- Actual create-only private copy, SHA/MIME/size verification and exact reserved
  capacity; repeated verified inspection never POSTs again.
- Official Storage accepts bytes but its response is lost: writer remains
  `issued`, status/retry returns pending, and no second POST is dispatched, even
  when destination bytes match. Source, destination and capacity stay held.
- Actual success ACK is observed, then admission is withdrawn before SQL COMMIT:
  ordinary continuation refuses, the observed ACK can be recorded factually, and
  renewed independent admission resumes measured inspection without another POST.
- Another family member's original bytes and all metadata remain exact; home
  ownership and synthetic Auth rows are preserved. No native request is created.
- Missing admission creates no preparation/intent; old upgraded-source refusal
  remains outside context; raw private/old RPC access, cleanup action and root
  advance are denied. No removal HTTP request exists in the adapter.

NOT proved/connected: whole-file inventory and both actors' inventory consent,
file-capable canonical generation/native stops, pairwise stage composition,
household activation, source cleanup/finalization and lost DELETE acknowledgement,
unknown-writer provider reconciliation, partial-route cancellation, physical
capacity release, global erasure/Auth-after/COMPLETE/family-write release, hosted
owners/ACLs/all writers or operational retention approval. The existing reviewed
cleanup Storage port stays unchanged and **unconnected**; do not use a copy result
as its authorization. The fixed interface packet describes the next composition.
