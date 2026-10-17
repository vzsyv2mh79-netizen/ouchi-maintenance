# Recent authentication deadline at atomic COMMIT

Complete-inventory consent lasts fifteen minutes, while the supported recent
authentication window is ten minutes. The private activation approval previously
used the consent expiry and its ordinary five-second transaction window. A valid
authentication at authorization could therefore age past ten minutes before
COMMIT, while the approval still appeared current.

The signature-checking provider now returns the earliest of both participants'
consent and authentication deadlines, rejecting an already elapsed deadline.
Its existing private SQL approval is capped by that deadline as well as the
five-second bound. Existing deferred activation/approval checks then refuse
COMMIT after authentication recency expires. Consent tokens, original expiry,
replay semantics, schema and production gates are unchanged. No new public
role, endpoint, migration, paid resource or customer mutation is enabled.

Two PGlite full-schema cases leave three seconds of authenticated validity,
reach the last receipt write with a positive authentication-bound approval,
then delay 3.2 seconds. The receipt INSERT succeeds before the deferred SQL
exception rejects COMMIT. Owner, file metadata, capacity/activation group and
receipts roll back; both original consent records remain and source cleanup is
never called. Both owner-file and member-only variants pass. This is injected
identity plus actual embedded PostgreSQL/deferred checks, not a real GoTrue
timestamp-boundary or shipping end-to-end proof.

Validation: initial focused suite 13/13; final last-write/COMMIT witnesses 2/2;
final full regression 659 passed, 0 failed, 0 skipped; targeted lint and complete
TypeScript checking passed. An initial sandboxed full run had seven loopback
listen EPERM failures (652 passed); the authorized local-loopback rerun above
passed. Logs are in /private/tmp/ouchi-auth-deadline-*20261013*.log.

This closes the recent-authentication time boundary only. Current Auth/factor
state and effective-policy freshness at deferred COMMIT, production policy
acquisition, consistent multi-actor lock order, durable cleanup/completion,
shipping/native routes and physical-device/App Store verification remain open.
Actual-service CI must be checked on the newly published head; old-head success
does not prove this change.

References: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[PostgreSQL deferred constraint triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html).
