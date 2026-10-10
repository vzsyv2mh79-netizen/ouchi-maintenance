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
2. In one database transaction revoke app access, cancel dependent jobs, capture exact storage paths, and erase application records. Idempotent retry must never touch a later enrollment.
3. Worker removes queued objects, verifies absence, retries failures, then purges remaining app identity links according to the documented retention policy. Storage metadata DELETE alone does not erase file bytes.
4. Expose authenticated progress separate from purchase entitlement. Never report deleted until every required operation is acknowledged.
5. Wire native UI and test shared-family impact, session races, storage outage, duplicate requests, restore attempts and retained Apple notifications.
6. Run only disposable isolated tests first. Production migration and any existing-data erasure remain held.

No legal retention basis or deadline is assumed. Operator identity, support contact, retention policy and account boundary need finalization before activating this feature or submitting the app.
