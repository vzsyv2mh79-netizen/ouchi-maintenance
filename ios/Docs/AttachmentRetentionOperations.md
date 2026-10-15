# Attachment deletion timing and operational observation

Prepared on 2026-10-15. Not enabled, not a physical deletion worker and not a published 30-day service promise.

The existing removal API durably fences reads and future writes before Storage deletion. Its first committed `removal_pending` transition now has a server-owned `removal_requested_at`. Repeating the original request preserves the first time. A rolled-back request leaves neither the fence nor the time. Historical pending rows stay null because their acceptance event is unknown; file creation, migration installation or a new retry cannot manufacture that date.

`lib/attachment-retention-observation.mjs` accepts an explicitly supplied, reviewed, bounded read-only private SQL provider and cancellation signal. It returns only aggregate counters and observation/oldest known event times. It has no endpoint, credentials, environment discovery, schedule or mutation port. Empty/malformed results and database failures are unavailable, never an empty backlog. It does not return account IDs, attachment IDs, object paths or file content.

Operators must review unknown/future timestamps, unsettled writes and legacy unknown writers separately from known aged requests. `olderThan30DaysFiles` is an observation threshold for this draft's proposed target, not evidence that a deletion SLA exists or has been met. Pending/unknown work remains charged and protected by existing write/ownership fences. Neither a timeout nor an expired subscription authorizes erasure, capacity release or completion.

Scope is only existing attachment metadata with `removal_pending` and a non-removed state. Account-deletion inventories, family transfer cleanup, orphan recovery, logs, receipts and backups require their independent reviewed observation, reconciliation and finite retention. A zero count here cannot prove that all customer data or physical Storage objects are gone.

Before enabling photo sales or publishing a deletion deadline, complete actual Storage reconciliation and durable retry, all-writer admission and app budget, retained reads/export, operator alert ownership and response, verified physical absence, provider/backup expiry and service-exit policy. Verify the candidate schema, effective privileges and pending frozen plans before production application. This change introduces no new role, grant, scheduler or automatic migration application.

The dedicated disposable Family CI adds real GoTrue/PostgreSQL first-event, concurrent retry, forgery refusal and client-denial checks. Local canonical-schema PGlite tests are recorded in `ReleasePreparation/attachment-retention-observation-20261015.json`; actual-service completion must be inspected on the published head before it is claimed. No real customer record or file is erased by these tests.

References checked 2026-10-15:
- https://www.postgresql.org/docs/17/sql-createtrigger.html
- https://www.postgresql.org/docs/17/functions-datetime.html

## Lost Storage acknowledgements during account closure

`eraseAccountDeletionObjects` handles a different frozen account-deletion inventory, not the aggregate removal-pending observation above. A Storage removal error or thrown response loss now leads to reconciliation of the same immutable path, rather than assuming presence or completion. It rechecks the current native lease before downloading. Only the pinned SDK's `StorageApiError` with `NoSuchKey`, followed by the canonical same-request/user/epoch/lease SQL acknowledgement, can advance that file. A remaining object, AccessDenied, an unknown read, cancellation, expired lease or refused acknowledgement leaves the batch unconfirmed. Final inventory reread is still required before reporting all objects confirmed; this is not whole-account completion.

The preexisting canonical SQL write-quietness checks remain mandatory. A temporarily missing object cannot acknowledge an upload that may still finish later. The actual-service candidate deliberately keeps this refusal check, settles only the exact known synthetic upload through its original RPC, then drops a successful Storage DELETE reply and requires the SDK to expose that loss before recovery. It does not replace unknown send outcomes with timeout-based completion.

Local verification: 21 related tests passed, including actual pinned SDK/default fetch over a loopback HTTP socket destroyed after the synthetic removal, definitive SDK NoSuchKey decoding, and same-scope acknowledgement. Local RPC/identity are synthetic. The disposable real Storage/PostgreSQL test is still a new-head CI candidate; its marker and result must be inspected before claiming it passed. No endpoint, worker schedule, production deletion or 30-day SLA is enabled.
