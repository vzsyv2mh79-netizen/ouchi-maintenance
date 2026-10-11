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

A skipped new retired transaction returns `retired`, not the durable persistence acknowledgement `ignored`. Client purchase persistence refuses that result, so a purchase/deletion race cannot finish the StoreKit transaction without a saved ledger row. Only the explicitly verified server notification context accepts `retired`; after both outer and nested Apple proof verification and that SQL result, it acknowledges the notification without inserting notification-inbox or renewal records. RPC failures stay retryable. Renewal-only events without a transaction remain on their existing paired-ledger path; their complete retirement/retention behavior remains a release gate.

Install and verify this migration before enabling the updated handler; all production billing, deletion endpoints and schedulers remain held. PGlite tests apply the actual SQL with synthetic users, checking closed/new-epoch refusal, no owner/period growth, existing refund ordering, another account's writes and browser-role denial. Handler tests use synthetic verifiers and confirm retirement cannot acknowledge a client purchase, invalid proof cannot be discarded, and unavailable SQL cannot be acknowledged. Real PostgreSQL concurrent closure/ingestion, signed Apple events, and complete erasure are not proved by these tests.

Still required: final erasure of app identity/session links, purchase ownership and ledger minimization with an approved finite policy, notification inbox/recovery cleanup, old-session re-enrollment prevention, safe fresh-owner restore after re-registration, confirmation receipt lifecycle, and final Keychain removal. Existing purchase identifiers are not authorized for permanent retention by this preparatory change. Shared Auth and other apps must remain intact.
