# Post-deletion purchase restore transfer gate

Prepared only. No production apply, route, scheduler, Apple token update or paid
rights are enabled. The migration creates a Sandbox-only queue and an operator
policy whose enabled value is false. Service-role code can lock its singleton
but cannot change that enabled flag. An approved migration is required to enable.

The trusted server must verify live Auth/current enrollment, both Apple-signed
AppTransaction and purchase information, their Apple-account/app/environment
pairing, the registered Apple-attested key and its approved native build, and the
fresh challenge-bound assertion before calling the enqueue RPC. A signed pair,
client device identifier, assertion parser or mock response alone never proves
transfer authorization. Use the original signed pair digest and exact stored
scope. Native code must obtain proof from verified StoreKit and its own device;
never expose a path that signs arbitrary externally supplied purchase claims.

The enqueue RPC uses the existing live-enrollment and nonce/counter consumer in
one SQL transaction with job creation. It refuses active recorded ownership and
another reservation for the original purchase. A failed job insertion rolls back
proof consumption. An exact lost-response retry identifies the same existing
job, without creating another job or consuming again. A changed request scope or
lease is refused. The mutation marker changes authorized to update_started once;
a stale second worker gets no marker. A revoked session invalidates permission
without discarding the uncertain original-purchase reservation.

The ownership INSERT trigger now shares account -> original advisory -> owner
row ordering with enqueue/completion and refuses ordinary ingestion while a
restore reservation is pending. The atomic completion RPC alone enters a
transient committing phase in the same transaction; failure restores the prior
phase and rolls back all writes. Completed same-owner duplicate INSERTs remain
allowed only when that owner still exists, so normal new-period/refund ingestion
can proceed. Other owners and recreation after deletion remain refused.
Ownership identity UPDATE is immutable; service UPDATE is limited to a guarded
column solely for PostgreSQL row-lock permission.

PGlite tests cover these conditions. Disposable CI run 38190996644 passed the
actual PostgreSQL parallel-session test: foreign and same-owner writers waited
on the shared locks while completion was uncommitted; commit allowed only the
same owner's new period, and rollback preserved the reservation with no owner
or period. The full migration apply, existing retirement race, real Auth and
PostgREST checks also passed at head 3c42e6f. This concurrency fixture uses
synthetic Auth/Apple output, not live Apple account proof or an Apple mutation.
The migration workflow now applies these new migrations (it previously stopped
before them). The newer deletion integration below still needs current-head CI.
An ownership insert guard is not full-system release proof.

Prepared completion RPC now rechecks the live enrollment and exact lease,
Apple account/app scope, Sandbox, original purchase, current target token,
premium product, signed-time freshness, active expiry and absence of revocation.
It invokes the existing verified ledger writer and records completion in the
same SQL transaction. A failure in the final job write rolls back the ownership
and transaction inserts. No existing owner's purchase is reassigned. Already
completed exact-receipt retries require the durable transaction/current owner;
a later ledger refund cannot be overwritten by that completion retry. A changed
JWS hash/transaction requires status reconciliation/normal ledger ingestion,
not a second completion. This only validates normalized output from a trusted
cryptographic adapter; it does not verify Apple signatures in SQL.

A prepared service RPC adapter now connects the worker to the lease probe,
mutation CAS, atomic completion and separate durable completed-status lookup.
The worker checks completed status before Apple read/mutation; this reports past
job completion only, never an active entitlement. Later refund/expiry stays in
the ledger and the normal entitlement path must still evaluate it. The actual
SQL/worker test loses an acknowledgement AFTER SQL commit, then resumes without
another Apple call or ledger insert. Apple responses and live Auth remain
synthetic; neither a real Supabase service nor Apple Sandbox was contacted.
Malformed boolean responses, RPC errors and null mutation CAS fail closed.
Job DTO timestamps must use server epoch milliseconds (as the marker RPC does),
not Date.parse on a Date object, which can discard fractional milliseconds.

Prepared deletion now erases authorized/completed restore jobs across all of the
closing user's retained epochs only after inventory, records, receipt sessions,
closed access/current epoch and the exact deletion lease are confirmed. Unknown
or committing jobs refuse the entire job cleanup; safe jobs are not partially
erased. The deletion store runs this stage before proof/purchase-ledger erasure.
Identity checkpoints, identity erasure and completed receipts require all that
user's restore jobs to be absent. Another user's jobs are preserved.

Local deletion SQL tests physically erase authorized/completed fixtures and
check identity refusal with an uncertain job. The uncertain fixture is removed
by privileged test cleanup only: this is NOT a implemented Apple reconciliation.
A bounded cancellation/reconciliation and approved finite retention policy for
unknown external outcomes remains mandatory. Do not deploy a deletion flow that
leaves these jobs pending indefinitely or presents them as erased.

Required next work:

- Trusted authenticated job loading and worker dispatch for the prepared RPC
  store. Test actual service transport and scheduling, changed current JWS,
  live session invalidation and true parallel workers. The helper factory is
  not an enabled route, scheduler or production service client.
- Apple Sandbox current-status adapter and explicit token-update client. HTTP200
  is not proof. Reconcile a lost PUT response by verified readback; uncertain
  retries must never blindly send a second mutation or free the reservation.
- Reconciliation of unknown external mutations under a revoked-user deletion
  lease, bounded retry/escalation, approved finite retention and erasure for those
  outcomes. Verify full deletion with actual service transport and parallel
  mutation/closure before enablement; prepared safe-state cleanup is insufficient.
- Fresh authenticated restore challenge/assertion endpoints and native wiring,
  authentic Apple device/build proof, duplicate/replay/competing ownership,
  response loss, expiry/refund/revocation and Web/native rights verification.
- Actual Apple Sandbox signatures and token update/readback, actual concurrent
  PostgreSQL sessions, Supabase security advisors and approved operator policy.

Local tests run actual migration SQL in disposable PGlite with synthetic Auth,
registered-key and crypto-result fixtures. They check rollback, one-use proof,
reservation/retry and mutation CAS, browser RPC/table denial, RLS, invoker mode
and limited update grants. They neither register an Apple device nor verify an
Apple signature, use shared Supabase, mutate Apple or grant paid access. Formal
Supabase advisors cannot run against this embedded database; remain required
against the eventual isolated actual PostgreSQL setup before release.
