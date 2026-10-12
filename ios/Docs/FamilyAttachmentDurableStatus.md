# Durable family attachment status — disabled backend candidate

`createFamilyAttachmentStatus` reads an already reserved original journal on a
trusted pinned transaction. It returns only `prepared` or `activated` with the
orchestrator's exact normalized-plan digest. Missing/partial evidence throws and
the orchestrator keeps the result pending. It does not claim `complete`, create
a journal, reserve capacity, activate ownership, remove originals or delete Auth.

The reader independently checks the original controller/native request binding,
current database-clock native/controller lease, retained private freeze and hold,
recipient enrollment, immutable journal/digests, retained family snapshot,
complete home/product/task write routes, complete file/settled-write inventory
and exact receiver quota. Activation additionally requires both matching durable
receipts and the unchanged two consent records captured by the activation context.
Current signed inventory/identity authorization is mandatory before and after
readback; the entire evidence set is checked again after the final callback.

Activation context expiry does not discard a committed receipt. Reading durable
evidence does not reuse its old write capability, extend the measured-copy proof,
or waive current authority. Before any source removal, the orchestrator still
requires fresh measured destination bytes. A native lease rotation must first
belong to the same original controller operation; a new unrelated request cannot
reuse the manifest. Normalized caller destinations are derived again and compared,
so an externally supplied path cannot override the original plan.

The original activation fixture is now shared without registering test cases on
import. Nine unchanged activation assertions and eleven status assertions pass
in full-schema PGlite. Status cases include a lost commit reply, a new reader/provider
and orchestrator restart without another activation, expired write context,
member-only transfers with zero receiver quota, missing product route, revoked
consent, expired controller binding, disabled receiver, foreign inventory/native
request/destination, lost authorization and cancellation. Revocation during the
final callback is refused for both prepared and activated readback. The native
expiry status test injects a false current-lease SQL result; it is not a real
clock/claim concurrency proof. Storage bytes and inventory authorization in these
tests are synthetic/injected, and cleanup is deliberately unsuccessful.

## Still required before shipping

- Real signed complete-inventory consent and current pinned Auth/MFA provider,
  least-privilege database composition and HTTP/native integration.
- Actual combined PostgreSQL/Storage activation/readback, concurrency and lost
  replies, plus physical-device persistence/recovery verification.
- Durable source cleanup and definitive-absence/completion evidence. This reader
  never converts activation into whole-account retirement completion.
- Initial absent/preparation handling, frozen native lease reclamation, receiver
  cancellation/refund, later handoff lifecycle and finite hold/receipt retention.
- Scalable measured-copy inspection and all-project Auth retirement isolation.

No production migration, role/grant, real charge, paid infrastructure or existing
user/file deletion is enabled.
