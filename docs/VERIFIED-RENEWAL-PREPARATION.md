# Verified renewal preparation

Updated 2026-10-11. This prepares validation and decisions only; persisted renewal state and live grace entitlement are not implemented or activated.

A separate Apple SignedDataVerifier.verifyAndDecodeRenewalInfo call must succeed before normalization. The decoded renewal must match the independently verified transaction's environment, original transaction, current subscription product, optional app-account token and exact period expiry. Auto-renew status must be a known numeric0/1, dates safe positive integers, retry flag an actual boolean and any grace expiry later than the matching paid period. Missing renewal app-account token uses the verified paired transaction, never client input.

The notification route now separately verifies included signed renewal information whenever it also has a verified transaction. Such notifications remain needs_reconciliation in the durable inbox; no flag is used to directly grant rights. Renewal-only notifications still need retrieval and pairing with a verified Server API transaction. Current database entitlement reading uses verified paid transactions only; no grace feature has been silently enabled.

Pure decisions tested: disabling auto-renew keeps the current paid period; retry alone does not extend rights; a matching signed renewal with an explicit grace expiry authorizes only until that expiry. Revoked/upgraded/tip/future purchases, mismatched environment/ownership/period and expired grace never authorize. Persistence must still retain newest signed snapshots, reject stale replay and read the active enrollment before these decisions become live. Refund/renewal/grace reconciliation, Server API recovery and actual Apple signed Sandbox lifecycle remain required before release.

Checks passed: TypeScript, targeted ESLint and242 backend tests with zero skips. Apple's actual verifier rejected unsigned renewal proof. Route mocks prove no persistence after rejected renewal verification. Synthetic normalized fixtures are not evidence of an actual Apple purchase, grace period or notification.

Official references checked:
- https://developer.apple.com/documentation/appstoreserverapi/graceperiodexpiresdate
- https://developer.apple.com/documentation/appstoreserverapi/isinbillingretryperiod
- https://developer.apple.com/documentation/appstoreserverapi/renewaldate
- https://developer.apple.com/documentation/appstoreserverapi/expiresdate
