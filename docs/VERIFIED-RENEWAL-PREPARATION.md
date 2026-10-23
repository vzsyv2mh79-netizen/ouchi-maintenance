# Verified renewal state and grace access

Updated 2026-10-11. Code and additive migration are prepared; no shared production migration or sales configuration is enabled.

Apple's separate renewal signature verifier must succeed before normalization. The decoded renewal must match its independently verified transaction's environment, original transaction, current subscription product, optional app-account token and exact period expiry. Unknown statuses, invalid dates and coerced retry flags are refused. Missing renewal app-account token is resolved only from the verified paired transaction.

Notifications with both signed transaction and signed renewal now verify both, persist the transaction, persist renewal state, then persist notification metadata before HTTP200. Any durable-write failure returns503; repeating delivery uses idempotent writes. Renewal-only notifications remain needs_reconciliation until a Server API worker retrieves and verifies the paired transaction. The inbox remains conservatively marked needs_reconciliation for events containing renewal metadata, even when the paired snapshot is already stored. Completion of that work must not be inferred from the receipt.

The private RLS renewal table is keyed by environment and original transaction. Its service-only security-invoker RPC requires existing immutable original ownership/epoch and an exact stored subscription period. Newer signed snapshots update state, older ones are ignored and conflicting same-time snapshots fail. Closed epochs may retain historical events but cannot read rights through a new enrollment. No household grants/policies change.

The service entitlement read preserves the paid period regardless of auto-renew status. Explicit matching grace extends access only when Apple's verified snapshot says billing retry is active and its grace expiry is still future. Retry alone, expired grace, revoked/upgraded purchases, future purchases, other environments and closed sessions do not authorize. A later transaction for the same original purchase prevents older grace from resurfacing. The lookup has an index for original transaction/period order.

Local validation passed: TypeScript, targeted ESLint and244 backend tests with zero skips; a subsequent actual SQL test rerun passed after adding the lookup index. PGlite executes actual migrations and validates paid cancellation, grace start/end, stale replay, refund, owner/environment mismatch and client role denial. These use normalized synthetic fixtures and do not prove an Apple signed purchase. Disposable real Auth/PostgREST CI is expanded to exercise renewal insert/dedup, grace read, client denial, wrong epoch and refund; inspect the current-head result separately.

Remaining release work includes verified Server API history/reconciliation, renewal-only notifications, actual signed Apple Sandbox lifecycle, latest iOS/native/Web same-account testing, production migration/advisor review, account erasure/retention and owner/Apple release gates. Supabase local security advisors could not connect to127.0.0.1:54322 earlier; they remain an isolated/production rollout requirement. No paid infrastructure, real charge or existing-data deletion has occurred.

Official references checked:
- https://developer.apple.com/documentation/appstoreserverapi/graceperiodexpiresdate
- https://developer.apple.com/documentation/appstoreserverapi/isinbillingretryperiod
- https://developer.apple.com/documentation/appstoreserverapi/renewaldate
- https://developer.apple.com/documentation/appstoreserverapi/expiresdate
