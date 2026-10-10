# Verified Apple notification inbox

Prepared 2026-10-11. Additive migration is not applied to shared production. No sales or paid infrastructure is enabled.

The notifications endpoint now requires verified-ledger storage, verifies the Apple outer signature and any included transaction, validates notification identity/date/environment, persists an included transaction first, then durably records bounded verified metadata before acknowledging HTTP200. A missing transaction no longer silently disappears. TEST is recorded as test; events lacking a transaction or carrying renewal metadata remain needs_reconciliation. This is not a completed renewal/grace worker. Future verified Server API reconciliation and actual signed lifecycle tests remain release gates.

The private RLS inbox is keyed by environment plus Apple notification UUID. Exact duplicates are accepted; conflicting proofs/metadata are rejected. A failed transaction write or inbox write returns503. If transaction storage succeeds and inbox storage fails, replay repeats the existing idempotent ledger write before retrying the inbox. No shortcut based only on receipt exists. The stored proof is SHA256 of the exact verified notification JWS, not the JWS itself; metadata contains no email, bearer, credentials or app-account token. Retention and operational reconciliation still require a production rollout decision.

Only service_role can invoke the security-invoker RPC or access the table; clients cannot write receipt records or grant rights. No existing household RLS or schema grants are changed.

Local checks passed: TypeScript, targeted ESLint, 240 backend tests with zero skips, including actual PGlite SQL role denial/deduplication/environment scope, actual route persistence failures, and synthetic transport metadata tests. These do not prove Apple signatures. Local Supabase security advisors were attempted but could not connect to127.0.0.1:54322; no local Supabase service is running. Full advisors remain required on the isolated deployment before production rollout. CI additionally applies the migration and exercises its RPC through real disposable Auth/PostgREST; its result must be inspected separately.

Official sources:
- https://developer.apple.com/documentation/appstoreservernotifications/notificationuuid
- https://developer.apple.com/documentation/appstoreservernotifications/responding-to-app-store-server-notifications
- https://supabase.com/docs/guides/database/postgres/row-level-security
