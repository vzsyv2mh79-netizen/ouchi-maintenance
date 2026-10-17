# Attachment deletion timing and operational observation

Prepared on 2026-10-15. Not enabled, not a physical deletion worker and not a published 30-day service promise.

Current status update (2026-10-17): account erasure, user removal, accepted cleanup, upload inspection and family-copy adapters require typed SDK NoSuchKey together with definitive status: HTTP404 with absent/404 semantic status, or Storage1.74 HTTP400 with semantic404. Contradictory status, authorization/server errors and non-SDK objects remain unknown; they cannot acknowledge deletion or authorize a new write. Local actual-SDK HTTP tests cover the failed-status boundary and supported Storage response. No worker, deletion deadline or provider-wide garbage-collection proof is enabled by this check.

Account upload allowance and the app-wide physical allocation are separate. Personal removed files can stop counting against the uploader allowance only after the canonical acknowledgement. Physical claims/quarantine remain held until independently verified reconciliation permits release. The prepared ordinary-retirement finalizer removes account-linked capacity metadata while preserving the same opaque held bytes. API absence never authorizes releasing that physical allocation.

Retained household files have prepared Web/native read/download clients. Active-member removal/parent-deletion workflow and orphan/service-exit retention remain release work. Do not promise a household-file delete action or reuse a personal uploader namespace for it. Family preservation must exclude the departing account's associated content and posts, not merely visible personal information. Historical notes below retain their original verification scopes.

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

Local verification: 21 related tests passed, including actual pinned SDK/default fetch over a loopback HTTP socket destroyed after the synthetic removal, definitive SDK NoSuchKey decoding, and same-scope acknowledgement. Local RPC/identity are synthetic. The disposable real Storage/PostgreSQL test passed at b3a6d7b (workflow38675062288, job116226675558); its raw marker and one enclosing passed test were reviewed. That proof concerns the account-deletion path only. No endpoint, worker schedule, production deletion or 30-day SLA is enabled.

## Accepted-removal cleanup candidate — 2026-10-15

The CLI-created `20261015041238_ouchi_attachment_cleanup_lease.sql`,
`attachment-cleanup.ts` and `attachment-cleanup-store.ts` prepare a dormant
backend batch for already accepted removals. No role, grant, route, credentials
or schedule is created. All five new private functions are invoker functions
with empty search paths; PUBLIC/anon/authenticated/service_role execution is
revoked. A separately reviewed bounded private-query role and Storage transport
are required before deployment. One fresh service instance handles at most 25
immutable approvals; batch errors expose aggregate counts, not identities/paths.

Only a known original acceptance time, tracked quiet writes, an immutable
canonical path and current uploader/captured-owner enrollment can be claimed.
Legacy unknown times/tracking, unsettled writes, disabled accounts and changed
epochs remain deferred. Logout does not revoke an already accepted deletion.
The SQL claim takes the same sorted principal locks as uploads before row locks.
An exact lease retry does not extend its five-minute technical lease; takeover
requires a new nonce after expiry. Expiry is never disappearance evidence.

Every step checks the exact claim and current SQL lease. Storage failure may
have committed: only the pinned SDK's definitive NoSuchKey can precede the
current-lease SQL acknowledgement. SQL independently rechecks exact mapping,
quiet writes, active principals and Storage metadata absence before setting
removed and releasing quota. It clears the cleanup lease at that point. A lost
completion reply remains unconfirmed to this batch; a future scan omits the
already removed row. No counter proves whole-account or provider/backup erasure.

A reproduced retirement bug omitted removed metadata from a new account-deletion
inventory, leaving it behind after record erasure and blocking identity cleanup.
The replacement capture function retains the same scope/lease/family checks and
existing execute privileges, and includes removed metadata in NEW inventories.
Those entries start unconfirmed and need fresh definitive absence before record
erasure. A previously captured inventory is never expanded or repaired here;
legacy frozen plans need separate review. Unresolved writes still prevent erasure.

Local verification: 20 related cases passed, including actual pinned SDK/default
fetch over a dropped loopback DELETE reply, exact private SQL binding, stale
lease/mapping refusals, no client/service-role entry point, fresh retirement
recapture and legacy-plan immutability. SQL uses full-schema PGlite and synthetic
Auth/Storage metadata. A separate disposable actual Auth/PostgreSQL/Storage
helper is prepared: accept then log out, race lease claims, expire the old nonce,
drop actual successful Storage replies, require SDK NoSuchKey before quota
release, retain an unsettled write plus foreign bytes/Auth, then recapture removed
metadata into a new native inventory. New-head CI is pending; no actual-service
success for this cleanup candidate is claimed yet. Native intake/coverage remain
explicit operator fixtures.

Live read-only history was reconciled again: 98 canonical files, seven matching
applied source hashes, 91 pending and eight foreign history rows preserved, no
conflicts. Automatic apply/history repair remain false. Local staged advisors
could not connect to 127.0.0.1:54322; the candidate has no advisor approval.
Before activation, review full staged schema/effective privileges and frozen
plans, dedicated role/TLS/provider bounds, all-writer admission, actual services,
private app budget, scheduling/alert ownership/backoff and finite receipt/log/
backup retention. No 30-day SLA or automatic expiry-based deletion is adopted.

Locking references checked:
- https://www.postgresql.org/docs/17/sql-select.html
- https://www.postgresql.org/docs/17/explicit-locking.html
