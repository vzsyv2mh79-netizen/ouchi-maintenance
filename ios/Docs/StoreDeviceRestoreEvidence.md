# Sandbox restore evidence collection

`PurchaseManager.sandboxRestoreEvidence` obtains the app transaction from
`AppTransaction.shared` and the selected subscription from
`Transaction.currentEntitlements`. It accepts only the currently bound app
account and a numeric original transaction ID; it does not accept supplied JWS
or a supplied device ID. It does not prompt for a purchase or call sync.

Both SDK results must be `.verified`, Sandbox, and from the same AppTransaction.
The selected transaction must be a known premium auto-renewable subscription,
PURCHASED, unrevoked, not upgraded and unexpired. A duplicate matching original
transaction is refused. App revocation is refused. Both device digests must match
SHA-384(lowercase nonce UUID + lowercase current SDK device UUID). Cancellation,
account rebinding and device ID change refuse the result. Exact bounded SDK JWS
strings are returned, without sending or logging the device ID.

This is evidence collection, not restore authorization or paid entitlement.
The server must independently verify the Apple signatures and pair, bind a fresh
App Attest challenge to the current app enrollment/session and approved build,
consume the assertion atomically with a restore reservation, and confirm the
Apple update and durable ownership/transaction completion. An old appAccountToken
alone cannot authorize transfer. No endpoint, scheduler or UI starts this new
method yet; selling and restore transfer remain disabled.

## Verification and remaining work

The digest smoke test uses an independently generated SHA-384 vector and checks
wrong nonce/device/order, changed digest and invalid lengths. These synthetic
values are not an Apple signature or own-device StoreKit proof. Native source
is typechecked by the existing verification script. Real device SDK evidence,
App Attest assertions, cancellation/account changes during SDK iteration and
end-to-end server transport still require a signed Sandbox build. Local Xcode
StoreKit evidence is deliberately refused by this Sandbox-only collector.

## Apple primary sources

- https://developer.apple.com/documentation/storekit/appstore/deviceverificationid
- https://developer.apple.com/documentation/storekit/transaction/deviceverification
- https://developer.apple.com/documentation/storekit/apptransaction/deviceverification
