# Account deletion release gate

Status: design, not enabled. Existing development closure is not a release-complete deletion feature.

Source: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion (checked 2026-10-11).

## Required product behavior

Settings must offer account deletion, with export first, a clear irreversible confirmation, and reauthentication. Explain that deleting an account does not cancel Apple subscriptions; provide the Apple subscription management screen without making cancellation a prerequisite. A queued deletion must show its actual expected completion time and completion status. Do not claim completion while any object deletion is unconfirmed.

The shared Supabase Auth identity must not be globally deleted as a shortcut. Other applications may use it. Remove the Ouchi application enrollment and associated data; explicitly explain the separate shared login scope. Whether that boundary meets the actual multi-app account model must be reviewed before submission. Do not present a disabled enrollment as full account deletion.

## Data inventory and completion evidence

| Data | Required operation | Evidence |
|---|---|---|
| Owned homes, products, tasks, history | Delete only the confirmed user's owned scope; disclose impact on sharing | SQL transaction rollback and two-account isolation tests |
| Memberships and invitations | Remove memberships, invalidate invitations owned by the account | Former invite cannot join; other homes untouched |
| Photos and warranty files | Queue immutable object paths before metadata deletion; erase through Storage API | Object absence verified; storage outage leaves request pending |
| Device registrations and schedules | Disable immediately, purge device tokens and pending delivery jobs | No post-deletion delivery, including an already claimed worker |
| App sessions and epochs | Revoke all Ouchi access, prohibit old-session reenrollment | Real Auth session tests across two sessions |
| Recovery jobs | Cancel closed enrollment jobs and prevent late entitlement grants | Lease race test, closed-epoch entitlement rejection |
| Purchase ledger and notification inbox | Minimize retained identifiers; determine justified retention and duration before release | Document retained fields and lifecycle; no accidental new-account rights |
| Local snapshots and exports | Clear app-managed snapshots and temporary exports after confirmed request; user-owned exported files remain under user control | Native cleanup failures surfaced and retryable |
| Shared Auth identity | Preserve other apps' access; define account boundary transparently | Separate app session still functions after Ouchi erasure |

## Implementation sequence

1. Add a durable private deletion request and immutable app epoch scope. No client-supplied arbitrary user/object IDs. Live verified session plus reauthentication are required to enqueue.
2. Under the immutable epoch and current deletion lease, revoke app access and capture exact storage paths before erasing any application records. Block family access to a closed owner’s homes. Upload reservation and finalization must share the enrollment/home locking protocol before production activation.
3. Worker removes captured objects through Storage, verifies actual absence, and durably acknowledges each object. Only then erase owned household records. Cancel dependent delivery/recovery work and purge remaining app identity links according to the documented retention policy. Idempotent retry must never touch a later enrollment. Storage metadata DELETE alone does not erase file bytes.
4. Expose authenticated progress separate from purchase entitlement. Never report deleted until every required operation is acknowledged.
5. Wire native UI and test shared-family impact, session races, storage outage, duplicate requests, restore attempts and retained Apple notifications.
6. Run only disposable isolated tests first. Production migration and any existing-data erasure remain held.

No legal retention basis or deadline is assumed. Operator identity, support contact, retention policy and account boundary need finalization before activating this feature or submitting the app.

## Receipt enrollment boundary

Every accepted/progress receipt includes the immutable app epoch. Exact-request and current-request reads join the user's current epoch; neither may expose a prior enrollment's deletion receipt to a later enrollment. A disabled current epoch still permits pending progress. Native flow, view binding and notification cleanup require account, epoch and binding revision; an old receipt never authorizes local cleanup for a new enrollment, including the same shared Auth user.

Apply the additive `ouchi_deletion_progress_epoch` migration before enabling a route or client that consumes these receipts. Missing/zero/invalid epochs fail closed rather than being inferred from the logged-in user's UUID. The migration and fixtures are prepared for isolated tests only. They do not implement final identity erasure or establish a retention exception.

## Current evidence and remaining connections

At commit 861fab7 the isolated Auth/PostgREST/Storage integration confirms object removal, absence acknowledgement, owned home/product deletion, repeatable erasure, and preservation of another owner’s home. It deliberately leaves the shared Auth identity and the deletion request running; this is not proof of complete account deletion. Native Gmail login and existing record display were directly verified on the Mac iPhone 17e screen.

The closed-owner household helper and member isolation tests are prepared separately. Native deletion UI, authenticated request/progress routes, bounded worker adapters, delivery cancellation, local-file cleanup and justified purchase retention still require implementation and end-to-end verification. No production deletion endpoint or scheduler is active.

## Push deployment ordering

The reminder sender must always invoke the service-only dispatch guard before sending. Install the formal guard migration before deploying this sender change; a missing or unavailable guard must fail closed. Validate that the current subscription and delivery lease still exist and the app account/epoch is open. This check cannot recall notifications already accepted by a push provider or eliminate the final network dispatch race. Clear local schedules on the client and purge subscriptions as part of erasure; APNs registration/queue cleanup remains a release gate.

## Retired transaction ingestion preparation (2026-10-11)

Apple's current deletion guidance was rechecked at the official link above: disabling access alone is insufficient; associated account data must be erased except legally required retained data. This change does not establish such a retention exception or finish identity erasure.

The additive `ouchi_retired_transaction_ingestion` migration replaces the service-only transaction ingestion function. It acquires the same user advisory lock used by enrollment and deletion before touching ownership rows. An old enrollment that is disabled, lacks enabled access, or no longer matches the current epoch cannot add a new original owner or transaction period. Existing immutable transactions may still receive ordered refund/revocation updates while retained for pending processing. Other accounts and Sandbox/Production identity rules remain isolated. Actual signature verification remains a separate mandatory server stage.

A skipped new retired transaction returns `retired`, not the durable persistence acknowledgement `ignored`. Client purchase persistence refuses that result, so a purchase/deletion race cannot finish the StoreKit transaction without a saved ledger row. Only the explicitly verified server notification context accepts `retired`; after both outer and nested Apple proof verification and that SQL result, it acknowledges the notification without inserting notification-inbox or renewal records. RPC failures stay retryable. Renewal-only events now have a separate service-only ownership retirement lookup after Apple verification. Known retired owners may be acknowledged without adding records even if their new period was intentionally not retained. Unknown owners remain retryable; this is not proof of complete retention/erasure behavior.

Install and verify this migration before enabling the updated handler; all production billing, deletion endpoints and schedulers remain held. PGlite tests apply the actual SQL with synthetic users, checking closed/new-epoch refusal, no owner/period growth, existing refund ordering, another account's writes and browser-role denial. Handler tests use synthetic verifiers and confirm retirement cannot acknowledge a client purchase, invalid proof cannot be discarded, and unavailable SQL cannot be acknowledged. Real PostgreSQL concurrent closure/ingestion, signed Apple events, and complete erasure are not proved by these tests.

Still required: final erasure of app identity/session links, purchase ownership and ledger minimization with an approved finite policy, notification inbox/recovery cleanup, old-session re-enrollment prevention, safe fresh-owner restore after re-registration, confirmation receipt lifecycle, and final Keychain removal. Existing purchase identifiers are not authorized for permanent retention by this preparatory change. Shared Auth and other apps must remain intact.

## Renewal-only retirement preparation (2026-10-11)

The additive `ouchi_retired_renewal_ingestion` migration provides a private service-only retirement lookup by verified environment/original transaction and optional signed app account token. A missing owner returns unknown, not retired. A mismatched supplied epoch is refused. It shares the enrollment/deletion user lock and rereads the immutable owner before checking the current enabled epoch/access. No caller can infer paid rights from this lookup.

The verified renewal writer follows the same lock order and refuses retired updates/inserts with a distinct `retired` result, including a closure occurring after the initial lookup. Active renewals still require an exact verified ledger period and use the existing signed-order/grace/cancellation rules. Recovery/client callers reject retirement as a persistence acknowledgement. Only the explicitly verified notification context acknowledges retirement without notification inbox or renewal writes. Signature failures and DB errors remain errors; unknown ownership does not silently complete. Existing transaction refunds/revocations use the preceding transaction guard.

PGlite applies actual SQL for active/closed/old-epoch lookup, missing ownership, optional epoch matching, no retired renewal insert/update, malformed fields and browser-role denial. Synthetic handler tests cover retired renewal-only notifications before pairing and a retirement result during persistence, without inbox writes. These tests do not establish real Apple proofs or concurrent PostgreSQL retirement. Both migrations must be verified before deployment; no shared DB change or production activation is included.

## PostgreSQL retirement lock race fixture

`tests/billing-retirement-race.integration.mjs` requires an explicit disposable-CI opt-in and uses only the fixed `ouchi-identity-ci` Compose project. It creates a randomly named database inside that disposable container and removes only that database. Synthetic users and sessions are not real Auth or Apple proofs.

Two independent PostgreSQL sessions hold the same user advisory transaction lock used by the deletion request and the verified ingestion writers. Before committing closure, the fixture observes the competing writer's actual `pg_stat_activity` advisory-lock wait. After closure commits, new ownership, a new transaction period and a renewal update must return `retired` without creating or updating those records. A refund of an existing period remains ordered and persists. A successful run proves the database serialization boundary; it does not prove complete erasure, final retention, Apple signature verification, or an enabled deletion worker.

The migration CI's explicit ordered list includes both retired-ingestion migrations. Run this fixture against actual PostgreSQL in that CI; a PGlite pass alone is insufficient evidence of concurrent sessions.


## Scoped purchase-notification inbox erasure

The prepared notification-account-erasure migration associates new account-scoped notifications with a persisted transaction owner and app epoch, using verified transaction/paired renewal fields. It rereads ownership under the same user lock as enrollment/deletion. A scoped event arriving after closure returns retired without an inbox write; unknown/mismatched owners remain retryable. TEST and genuinely unscoped operational events are not assigned by guesswork. Historical unscoped rows are not retroactively mapped and remain a separate finite-retention/minimization gate.

The erasure RPC requires the exact current deletion lease, closed current epoch/access, captured inventory, acknowledged file absence and erased household records. It removes only scoped inbox rows for that user/epoch; another owner, unscoped rows and purchase ledger remain intact. The disabled worker's record stage requires this acknowledgement before finalization. This does not finalize app identity erasure, authorize permanent ledger retention or mark the request complete. Apply and verify the new migration before deploying the scoped recorder/worker. All production billing/deletion routes remain held.

## Metadata inventory and confirmed-path minimization

The read-only tests/fixtures/deletion/schema-inventory.sql reports actual relation names, RLS, columns/types/nullability and foreign keys for maintenance_private and explicitly listed Ouchi public tables. It never reads customer row values, tokens, proofs or file bytes. The opt-in disposable Auth/PostgreSQL/Storage test runs it after all migrations, checks required identity/ledger/inventory categories and outputs the metadata for the final erasure audit. Local PGlite verifies the query against the actual identity migration, recognizes an added link column, excludes unrelated public apps and preserves rows. A metadata inventory is not proof that any data was erased.

The prepared deletion_inventory_minimization migration adds an intermediate service-only stage. Under the existing user/request lock and exact live lease, it requires captured inventory, records_erased, no unconfirmed object absence and the exact disabled account/epoch. Only then does it remove that request's captured object paths, uploader UUIDs and attachment IDs. It does not remove another request, enable enrollment, delete shared Auth or mark completion. The disabled worker invokes it after household/recovery/preferences/notification erasure, before mandatory final identity/retention adapters. Missing or unconfirmed minimization leaves the worker pending.

The durable per-object absence acknowledgement and record-erasure marker must precede this minimization. A failed Storage removal never qualifies. Retrying the worker after paths were removed uses those durable stage markers; it does not reconstruct paths or infer completion from an empty inventory. Closed-enrollment write guards must remain in force until finalization is implemented and verified.

Local SQL tests cover early-stage refusal, wrong account/lease/epoch, foreign-request preservation, repeatable path removal, stale lease and browser-role denial. The actual disposable integration verifies paths absent after intermediate worker cleanup while the request stays running and finalization refuses completion. This is not a full account deletion implementation.

Final audit must still resolve account_access/app_epochs/app_session_epochs, purchase ownership/transactions/renewals, legacy unscoped notifications, deletion-request receipt lifetime, logs/backups, and post-deletion restoration. current_maintenance_purchase_account currently lazily creates absent enrollment rows: simply deleting closed markers would permit an old live shared Auth session to reenroll. Current deletion progress also joins app_epochs, so removing that row would hide the pending/completed receipt. Fresh explicit enrollment/reauthentication and a finite independent completion-receipt design must be implemented together with final erasure. No perpetual identifier-retention exception or legal duration is assumed.

## Explicit-enrollment policy prerequisite

The explicit_enrollment_guard migration prepares a private singleton policy with require_explicit=false. It does not enable a policy, create/reopen an enrollment, revoke shared Auth or erase data. Under the unchanged default, existing initial enrollment and closure behavior are preserved.

When explicitly enabled in a disposable test, current_maintenance_purchase_account becomes read-only for enrollment: it returns only an enabled user/epoch with an exact stored signed-session mapping and a live Auth session. It never inserts missing account, epoch or session rows. The restrictive household gate additionally checks that exact session from auth.jwt() and live auth.sessions; the shared Auth identity itself remains available to other apps. A revoked/unmapped session or erased identity cannot infer consent from an absent marker. Another mapped owner's records remain accessible. The policy table is RLS/service-only; browser roles cannot enable or disable it or call the service status RPC.

This is a prerequisite, not a complete enrollment or erasure implementation. Do not enable the strict policy in shared/production DB before explicit first enrollment, fresh reauthentication/consent, safe session binding, acknowledgement-loss recovery and the existing-user migration UX are implemented and end-to-end verified. Final erasure must atomically require this policy and prove old sessions cannot regain household or purchase access, while finite completion receipt handling remains available independently of the erased epoch. A separate preflight/status response cannot establish that atomic invariant.

PGlite applies the actual identity and policy SQL, tests unchanged default, exact mapped session, new unmapped login, revoked session, identity-row erasure with no recreation, another user's mapping and browser-role denial. The disposable real Auth/PostgreSQL/Storage integration adds a separate synthetic user, checks actual Auth sessions and household RLS, erases only that synthetic app identity, and proves its shared login remains valid while Ouchi access stays denied. The new real integration still needs a successful current-head CI run. No user records, production flag or shared Auth sessions are altered.

## Explicit consent grant and held enrollment endpoint

The enrollment_consent migration prepares a service-only grant for the exact original verified session, a different fresh reauthenticated session, user, and request UUID. Both Auth sessions must be live and belong to the same user; the reauthentication session must have been created within five minutes. The trusted server must verify both bearer tokens and perform password reauthentication before calling SQL; UUID possession is not authentication. Grant requires the explicit policy enabled, uses the existing user lock and a policy-row share lock, blocks every unfinished deletion and any disabled/partial enrollment, and never grants a purchase or transfers ownership. It creates/binds only the chosen original session. A reauthentication session and request are one-use, with identical still-live retry returning the same epoch. A new proof cannot reuse a consumed request; after uncertain acknowledgement clients read state instead of blindly submitting again.

Proof bookkeeping carries a five-minute expiry derived from the fresh session. A bounded500-row service cleaner is prepared, but no timer is enabled. Expiry does not prove erasure. Account-scoped final erasure must include enrollment_consents; cleanup scheduling/backlog monitoring must be connected before release. Shared Auth/users are never globally deleted by these functions. The dedicated status RPC is always read-only and never calls the legacy lazy initializer, including during policy changes.

GET/POST /api/account/enrollment are held by OUCHI_EXPLICIT_ENROLLMENT_ENABLED and an independently validated server Supabase configuration. No Apple certificates or paid rights are required for this free account operation. POST requires exact explicit confirmation, password and request UUID in bounded JSON. The handler verifies the original Auth/session before and after grant, verifies the fresh login token with Auth, checks exact receipt fields and snapshots them before cleanup. Temporary signOut uses scope local and independent bounded fixed-host transport after cancellation. Failed cleanup/Auth/acknowledgement yields an unconfirmed response rather than successful registration. Passwords, bearer tokens and personal payloads are not logged. GET rechecks the policy and identity before returning the exact original-session status.

Local tests cover fresh proof, idempotence, duplicate consumption, closure/partial state refusal, expiry/cleanup, browser denial, wrong Auth/proof/receipt, cancellation and temporary cleanup failure. The actual disposable Auth/PostgreSQL/API test adds explicit absent-state read, fresh login/receipt/readback, temporary session absence, original login preservation, duplicate refusal and pending deletion refusal. The earlier guard fixture's home now explicitly supplies owner_id and asserts RLS42501 for an unmapped session; the prior CI failure was a missing fixture owner field, not a confirmed strict-policy failure. Current-head real integration success is still required before claiming those flows work in actual Auth/DB.

No grant route/SQL/policy is enabled in shared DB. Enrollment UX (Web/iPhone), native/Web transport, explicit first-use and legacy-user migration, failed-password messaging and readback recovery still require implementation and full-flow verification. Final identity erasure, finite completion receipts, purchase minimization/authorized restoration and App Store release remain unfinished.

## Current consent evidence

At c4e6c99, disposable real Auth/PostgreSQL/API job114474501415 completed successfully: an absent enrollment read stays read-only; fresh password verification returns the exact grant/readback; the temporary Auth session is revoked while the original remains usable; reusing the request does not create another grant; pending deletion cannot reopen. The same job verifies exact mapped/unmapped household RLS and no lazy recreation after identity erasure. These are synthetic accounts in a disposable database, not a deployed or owner-device flow.

The route now uses a shared temporary Auth client factory. Additional local tests use the actual Supabase SDK and a loopback HTTP server: after caller cancellation, scoped local logout still reaches Auth and clears only the temporary client session; a cancelled fresh login cannot reach the server; redirects and oversized streamed login responses do not produce a session. This is HTTP transport evidence with synthetic Auth responses, separate from the actual Auth/database grant evidence. No scheduler, shared policy, purchase or deletion activation is included.

## Held Web enrollment screen

CloudAccount mounts the free enrollment control for a signed-in user only when NEXT_PUBLIC_OUCHI_EXPLICIT_ENROLLMENT_ENABLED is true. The flag remains unset. This existing account entry is also available after household loading errors, so strict-policy rollout cannot rely on a household already being accessible to show consent. Native entry and existing-user rollout still need implementation before policy activation.

The Web client reads status without a purchase/ledger initializer; registration requires an unchecked explicit consent and password, verifies the original Auth user/session comparison scope, exact POST receipt and a separate GET readback. No purchase transfer or automatic resubmission follows an uncertain acknowledgement. Token payload parsing is only for comparing server receipts; the server remains responsible for actual Auth verification. Account/token changes, cancellation and mismatched epochs refuse confirmation. Input password and displayed result are cleared on Auth events, page hiding and unmount.

The actual React control at390px was tested using selected sources and synthetic Auth/server responses, with no horizontal overflow, an initially disabled submit, explicit checkbox/password, lost acknowledgement followed by readback with exactly one write, removed password field after confirmation, and logout clearing the receipt. This proves the isolated UI/client path, not a deployed real-Auth browser flow or native enrollment. Dedicated client tests include absent read, response identity mismatch, cancellation, logout and changed-epoch readback. Release activation remains held until real UI-to-Auth-to-DB and legacy-user migration are verified.

## Consent-record erasure stage

The deletion_consent_erasure migration adds a service-only intermediate operation for enrollment_consents. It takes the existing account advisory lock and exact deletion request row lock, requires the current live lease, inventory capture, household record erasure, confirmed file absence and the exact disabled account/epoch, and removes only consent rows for that user/epoch. It does not mark deletion complete, purge shared Auth sessions or erase a different epoch. Repeating confirmed absence is safe; a stale lease or changed epoch remains refused. The worker requires this acknowledgement before minimizing captured paths and invoking the still-mandatory final identity/retention stages.

Local PGlite applies the actual identity, deletion, guard, consent and new erasure migrations, testing early refusal, wrong account/lease/epoch, repeat removal, another user's and another epoch's preservation, expired lease and browser-role denial. The disposable real Auth/PostgreSQL integration also prepares target/foreign synthetic rows and verifies worker removal, foreign preservation and pending final status. Current-head real CI success is required; local tests alone do not establish actual PostgreSQL/Auth behavior. All shared application, billing and deletion flags remain held. Consent expiry cleanup scheduling, final identifier/purchase/receipt erasure and release policy are still outstanding.

## Independent session-bound deletion receipt

The deletion_receipt_session_snapshot migration prepares minimal request/session pairs separately from app enrollment. Under the existing exact live deletion lease and account/request locks, the capture stage requires confirmed files and erased household records, then captures only existing mapped sessions whose actual Auth user matches the closed epoch's owner. Capture is durable and repeatable; it cannot append a later login after confirmation. The worker requires this stage before consent/path minimization and final identity adapters.

The live-session progress RPC uses this captured authorization once present. It can read a pending receipt after app_session_epochs/app_epochs/account_access are removed, but cannot grant enrollment or purchase rights. A new unmapped login or a different user's live session is refused. A different current application epoch hides the old receipt even from the original session. Requests not yet captured retain the existing current-epoch boundary; deleting identity without capturing a receipt never grants access by absence.

For captured completed receipts, an explicit future expiry is required for reading. The schema limits a configured expiry to at most30days after the last update; the exact shorter product duration is not activated or finalized. This is a bound for the prepared implementation, not permission to retain all purchase/identity data for30days. Completion and its timestamp must be set only by the mandatory finalization transaction, which remains unimplemented. No completion state is inferred from file or household flags.

A bounded service-only500-row cleaner physically removes expired completed requests and their receipt-session pairs by cascade. It refuses invalid limits, skips pending/unexpired requests, and requires captured receipts, erased records/inventory and no remaining object inventory. Expiry hiding alone is not physical erasure. Scheduling, backlog monitoring, the actual finalization transaction, old request migration and log/backup policy remain release gates; no cleanup timer or shared database change is enabled.

PGlite applies the actual migrations and simulates enrollment erasure under the strict policy: original receipt remains pending, unmapped login is denied, initializer stays read-only, a manually prepared completed fixture respects expiry, an excessive expiry is refused, and expired receipt/request rows are physically removed while another pending request remains. This does not prove an account was actually finalized. The disposable real Auth/PostgreSQL test additionally simulates only the synthetic user's identity-row erasure after the worker capture and checks pending receipt access/shared Auth preservation. Current-head CI is required before claiming that actual-DB scenario passes.

At2c01337, actual Auth/PostgreSQL job114480428381 completed successfully. Target consent removal, foreign preservation, independent pending receipt after synthetic identity-row erasure, unmapped-session refusal and no implicit recreation were confirmed. This proves these isolated database boundaries; it does not mark account deletion complete or enable shared policy.

## Ouchi purchase-ledger erasure category

The deletion_purchase_ledger_erasure migration prepares a service-only stage after confirmed file/record erasure, captured receipt authorization and path minimization. Under the same user/request locking protocol and exact live closed-epoch lease, it erases this Ouchi user's associated notification rows, verified renewal state, tip/subscription periods and original-transaction ownership in foreign-key order. The full account deletion covers the user's retained Ouchi purchase epochs, not another user's data. Corrupted cross-owner/epoch transaction, renewal or notification links cause refusal before any delete. Confirmed absence is repeatable. Apple subscription cancellation, appAccountToken changes, ownership transfer and shared Auth are not called.

The worker requires the purchase-category acknowledgement before final identity/retention adapters. It does not infer that legacy unassociated notifications, logs/backups, completion receipts or final app identity were erased. Unassociated verified-notification retention and safe fresh restore of externally held Apple transactions remain explicit release gates; do not mark complete after this category alone.

PGlite applies the actual purchase/renewal/inbox/deletion migrations and verifies owned rows erased, foreign rows preserved, wrong lease/account refused, corrupt ownership refusing all writes and browser-role denial. Disposable real Auth/PostgreSQL integration seeds synthetic tip/subscription/renewal events and checks target absence, foreign period preservation and pending final status. No Apple signature or production data is involved, and successful current-head real CI is still required.


### Atomic identity erasure and interrupted-worker recovery (prepared)

The identity_checkpoint migration adds a service-only intermediate erasure transaction. It locks the immutable account and deletion request, requires the exact current lease, and takes a shared lock on the strict explicit-enrollment policy. Legacy policy, uncaptured receipts, remaining captured paths, or any retained account-scoped category refuse erasure. Checks cover all retained epochs, including prior consents, attachment write attempts, delivery identities, preferences and purchase records. It removes only Ouchi account_access/app_epochs/app_session_epochs, with a durable identity_erased marker in the same transaction. Shared Auth sessions/users are preserved; the independent receipt continues to authorize only captured live sessions. No Apple cancellation, transfer or completion occurs.

The checkpoint reader requires the same immutable request/account/epoch/live lease, strict policy and actual identity-row absence. After a committed erasure loses its acknowledgement, the worker can resume without replaying category operations that require now-erased identity rows. Both mandatory identity/retention finalization and markComplete still run under the current lease. The marker alone never acknowledges retention or account completion; unavailable/malformed checkpoint reads and cancellation stay pending.

Local SQL tests apply the actual migration and check strict-policy refusal, retained prior-epoch consent refusal, wrong lease/user, repeated absence, browser denial, independent pending receipt and no implicit re-enrollment. Worker tests exercise a committed write followed by a lost acknowledgement, resumed retention failure, lease loss and cancellation. The disposable real Auth/PostgreSQL integration is prepared to use the erasure RPC instead of manually deleting identity rows, and to resume a held retention tail. Its current-head CI must pass before claiming that scenario is verified.

Remaining release gates include complete retention and completion adapters, physical receipt cleanup scheduling, legacy unassociated events and logs/backups policy, safely authorized Apple restore, real device and deployed flow verification. All activation remains held.


### Retained prior enrollment preferences (prepared)

The prior_preferences migration closes an account-wide erasure gap: earlier category operations deliberately removed only the current epoch, while final identity erasure refuses any residual user-scoped data. The new service-only operation removes all retained Ouchi enrollment consent, reconciliation, reminder-schedule and notification-channel generations for the target user. It still requires the exact current immutable request/epoch/lease, disabled current enrollment/access, captured completion-receipt sessions, erased household records and confirmed object absence under the common account lock. A changed current epoch or wrong lease refuses the entire operation. Another user's rows are never targeted. The worker requires acknowledgement before inventory minimization and identity finalization; no shared Auth deletion, completion or activation occurs.

Local actual-migration SQL tests seed prior generations, verify changed-epoch refusal and foreign preservation, then confirm the identity erasure RPC can proceed after acknowledged cleanup. The disposable real Auth/PostgreSQL integration is prepared to exercise the same category with full schemas. Current-head CI remains required for that proof.


### Completion boundary and final acknowledgement recovery (prepared)

The completion_boundary migration implements a service-only completion transition. It requires the exact running deletion scope and execution lease, strict enrollment policy locked in the same transaction, durable identity erasure, absent object inventory and captured receipt sessions. A fresh sealed retention check for this request is mandatory. No check or actual retention approval is inserted by this migration or the runtime adapter. The private RLS check table permits runtime SELECT only, plus the single-column UPDATE privilege required by PostgreSQL for row locking; an immutable trigger refuses every actual row change. Runtime cannot insert, delete, rewrite or reassign an approval. The privileged checker/operator path, approved product policy and logs/backups/unassociated-event verification remain unfinished and held.

Checks carry an explicit bounded receipt lifetime (1..2592000 seconds), policy version, checked time and a freshness window of at most one hour. These are implementation bounds, not an approved retention duration. Completion stores the exact finishing lease as a receipt correlation value, clears the execution lease and sets expiry once. Repeated acknowledgement cannot extend expiry. Recovery reads require the immutable request/user/epoch/finishing lease, unexpired completed receipt, strict policy and erased identity rows. An intermediate marker or a different worker token never proves completion. The worker can recover a lost final acknowledgement before checking the now-cleared running lease; malformed/unavailable reads and cancellation stay pending.

Local SQL tests apply actual migrations but use an explicitly synthetic privileged retention fixture to exercise successful completion. They prove missing/expired evidence refusal, runtime fabrication/reassignment denial, wrong-lease/browser denial, immutable expiry, completed receipt access and cascading physical request/session/check cleanup. The real Auth/PostgreSQL integration is prepared with the same synthetic fixture. These tests prove a completion boundary; they do not prove the required real retention checker, legal/product approval, deployed full account deletion, or native device cleanup. No production approval, endpoint, timer or sale is enabled.
